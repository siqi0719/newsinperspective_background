import { detectLanguageFromText, extractKeywords, tokenize } from "../domain/text.js";

interface KeywordInput {
  title: string;
  summary: string | null;
  body: string | null;
  language: string | null;
  maxKeywords?: number;
}

function unique(values: string[]): string[] {
  return values.filter((value, index, array) => array.indexOf(value) === index);
}

function normalizeParts(input: KeywordInput): { language: string | null; title: string; summary: string; body: string } {
  const language = input.language ?? detectLanguageFromText(input.title, input.summary, input.body);
  return {
    language,
    title: input.title ?? "",
    summary: input.summary ?? "",
    body: input.body ?? "",
  };
}

function splitSentences(text: string): string[] {
  return text
    .split(/[.!?;:\n]+/g)
    .map((value) => value.trim())
    .filter(Boolean);
}

function generatePhrases(tokens: string[]): string[] {
  const phrases: string[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    phrases.push(tokens[i]!);
    if (tokens[i + 1]) {
      phrases.push(`${tokens[i]} ${tokens[i + 1]}`);
    }
    if (tokens[i + 2]) {
      phrases.push(`${tokens[i]} ${tokens[i + 1]} ${tokens[i + 2]}`);
    }
  }
  return phrases;
}

function phraseQualityScore(phrase: string): number {
  const tokenCount = phrase.split(" ").length;
  const charCount = phrase.replace(/\s+/g, "").length;
  if (tokenCount >= 3) return charCount + 3;
  if (tokenCount === 2) return charCount + 1.5;
  return charCount;
}

export function extractBaselineKeywords(input: KeywordInput): string[] {
  const maxKeywords = input.maxKeywords ?? 8;
  const { language, title, summary, body } = normalizeParts(input);
  return extractKeywords(language, title, summary, body).slice(0, maxKeywords);
}

export function extractStatisticalKeywords(input: KeywordInput): string[] {
  const maxKeywords = input.maxKeywords ?? 8;
  const { language, title, summary, body } = normalizeParts(input);

  const combinedText = [title, summary, body].filter(Boolean).join(". ");
  const sentences = splitSentences(combinedText);
  const sentenceCount = Math.max(1, sentences.length);

  const tokenFrequency = new Map<string, number>();
  const sentenceFrequency = new Map<string, number>();

  for (const sentence of sentences) {
    const tokens = tokenize(sentence, language).filter((token) => token.length >= 3);
    const seenInSentence = new Set<string>();
    for (const token of tokens) {
      tokenFrequency.set(token, (tokenFrequency.get(token) ?? 0) + 1);
      seenInSentence.add(token);
    }
    for (const token of seenInSentence) {
      sentenceFrequency.set(token, (sentenceFrequency.get(token) ?? 0) + 1);
    }
  }

  const titleTokens = new Set(tokenize(title, language));
  const candidateScores = new Map<string, number>();

  for (const sentence of sentences) {
    const tokens = tokenize(sentence, language).filter((token) => token.length >= 3);
    for (const phrase of generatePhrases(tokens)) {
      const phraseTokens = phrase.split(" ");
      if (phraseTokens.length === 0) continue;

      let score = 0;
      for (const token of phraseTokens) {
        const tf = tokenFrequency.get(token) ?? 0;
        const sf = sentenceFrequency.get(token) ?? 1;
        const idf = Math.log((sentenceCount + 1) / sf);
        score += tf * (1 + idf);
      }

      if (phraseTokens.some((token) => titleTokens.has(token))) {
        score += 1.75;
      }

      score += phraseQualityScore(phrase) * 0.12;
      candidateScores.set(phrase, Math.max(score, candidateScores.get(phrase) ?? 0));
    }
  }

  return unique(
    [...candidateScores.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .map(([phrase]) => phrase)
      .slice(0, maxKeywords),
  );
}
