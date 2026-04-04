const englishStopWords = new Set([
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "by",
    "for",
    "from",
    "has",
    "in",
    "is",
    "it",
    "of",
    "on",
    "or",
    "that",
    "the",
    "to",
    "was",
    "were",
    "will",
    "with",
  ]);

const stopWordsByLanguage: Record<string, Set<string>> = {
  en: englishStopWords,
  de: new Set([
    "am",
    "an",
    "auch",
    "auf",
    "aus",
    "bei",
    "das",
    "dem",
    "den",
    "der",
    "des",
    "die",
    "ein",
    "eine",
    "einer",
    "einem",
    "einen",
    "er",
    "es",
    "für",
    "im",
    "in",
    "ist",
    "mit",
    "nach",
    "nicht",
    "oder",
    "sein",
    "sie",
    "und",
    "von",
    "vor",
    "war",
    "wie",
    "zu",
    "zum",
    "zur",
  ]),
  fr: new Set([
    "alors",
    "au",
    "aux",
    "avec",
    "ce",
    "ces",
    "dans",
    "de",
    "des",
    "du",
    "elle",
    "en",
    "et",
    "il",
    "je",
    "la",
    "le",
    "les",
    "leur",
    "mais",
    "ne",
    "pas",
    "pour",
    "que",
    "qui",
    "se",
    "ses",
    "sur",
    "une",
  ]),
  es: new Set([
    "a",
    "al",
    "con",
    "de",
    "del",
    "el",
    "en",
    "es",
    "la",
    "las",
    "los",
    "para",
    "por",
    "que",
    "se",
    "sus",
    "un",
    "una",
    "y",
  ]),
};

const positiveWords = ["gain", "growth", "improve", "success", "win", "benefit"];
const negativeWords = ["crisis", "decline", "fail", "loss", "war", "attack", "risk"];
const biasLexicon: Record<string, string[]> = {
  loaded_language: ["shocking", "outrage", "slam", "blasts", "furious"],
  uncertainty: ["reportedly", "allegedly", "appears", "suggests"],
  conflict_frame: ["battle", "standoff", "clash", "showdown"],
};

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function normalizeLanguage(language: string | null | undefined): string {
  return (language ?? "en").toLowerCase().split(/[-_]/)[0] || "en";
}

function getStopWords(language: string | null | undefined): Set<string> {
  return stopWordsByLanguage[normalizeLanguage(language)] ?? englishStopWords;
}

export function tokenize(value: string, language?: string | null): string[] {
  const stopWords = getStopWords(language);
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((token) => token && !stopWords.has(token));
}

export function extractKeywords(language: string | null | undefined, ...parts: Array<string | null | undefined>): string[] {
  const counts = new Map<string, number>();
  for (const part of parts) {
    if (!part) continue;
    for (const token of tokenize(part, language)) {
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 8)
    .map(([word]) => word);
}

export function extractEntities(...parts: Array<string | null | undefined>): string[] {
  const text = parts.filter(Boolean).join(" ");
  const matches = text.match(/\b[\p{Lu}][\p{L}\p{M}]+(?:\s+[\p{Lu}][\p{L}\p{M}]+){0,2}\b/gu) ?? [];
  return [...new Set(matches)].slice(0, 8);
}

export function scoreSentiment(language: string | null | undefined, ...parts: Array<string | null | undefined>): number {
  const tokens = tokenize(parts.filter(Boolean).join(" "), language);
  let score = 0;
  for (const token of tokens) {
    if (positiveWords.includes(token)) score += 1;
    if (negativeWords.includes(token)) score -= 1;
  }
  if (tokens.length === 0) return 0;
  return Number((score / tokens.length).toFixed(3));
}

export function scoreSubjectivity(language: string | null | undefined, ...parts: Array<string | null | undefined>): number {
  const tokens = tokenize(parts.filter(Boolean).join(" "), language);
  if (tokens.length === 0) return 0;
  const opinionated = tokens.filter((token) =>
    Object.values(biasLexicon).some((list) => list.includes(token)),
  ).length;
  return Number((opinionated / tokens.length).toFixed(3));
}

export function detectBiasSignals(...parts: Array<string | null | undefined>): string[] {
  const text = parts.filter(Boolean).join(" ").toLowerCase();
  return Object.entries(biasLexicon)
    .filter(([, words]) => words.some((word) => text.includes(word)))
    .map(([label]) => label);
}

export function jaccardSimilarity(left: string, right: string, language?: string | null): number {
  const leftSet = new Set(tokenize(left, language));
  const rightSet = new Set(tokenize(right, language));

  if (leftSet.size === 0 && rightSet.size === 0) return 1;
  if (leftSet.size === 0 || rightSet.size === 0) return 0;

  let intersection = 0;
  for (const token of leftSet) {
    if (rightSet.has(token)) intersection += 1;
  }
  const union = leftSet.size + rightSet.size - intersection;
  return Number((intersection / union).toFixed(3));
}
