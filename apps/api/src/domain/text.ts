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
    "a",
    "alors",
    "au",
    "aux",
    "autres",
    "avec",
    "ce",
    "cette",
    "ces",
    "dans",
    "de",
    "des",
    "du",
    "elle",
    "est",
    "ete",
    "été",
    "etre",
    "être",
    "en",
    "et",
    "il",
    "ils",
    "je",
    "la",
    "le",
    "les",
    "leur",
    "mais",
    "ne",
    "ont",
    "pas",
    "par",
    "plus",
    "pour",
    "que",
    "qui",
    "sa",
    "se",
    "ses",
    "son",
    "sont",
    "sur",
    "un",
    "une",
    "vous",
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
    "ha",
    "han",
    "la",
    "las",
    "lo",
    "los",
    "mas",
    "más",
    "para",
    "por",
    "que",
    "se",
    "su",
    "sus",
    "un",
    "una",
    "y",
  ]),
  it: new Set([
    "a",
    "al",
    "anche",
    "che",
    "con",
    "da",
    "de",
    "del",
    "della",
    "di",
    "e",
    "ha",
    "i",
    "il",
    "in",
    "la",
    "le",
    "gli",
    "ma",
    "nel",
    "non",
    "per",
    "si",
    "su",
    "tra",
    "un",
    "una",
  ]),
  tr: new Set([
    "ama",
    "ancak",
    "bu",
    "da",
    "de",
    "daha",
    "en",
    "gibi",
    "hem",
    "için",
    "ile",
    "kadar",
    "mi",
    "mı",
    "mu",
    "mü",
    "ne",
    "o",
    "olan",
    "olarak",
    "ve",
    "ya",
    "ya da",
  ]),
  el: new Set([
    "από",
    "για",
    "δεν",
    "ή",
    "η",
    "θα",
    "και",
    "με",
    "να",
    "ο",
    "οι",
    "σε",
    "στη",
    "στην",
    "στο",
    "την",
    "της",
    "το",
    "τον",
    "του",
    "των",
  ]),
};

const combinedStopWords = new Set(
  Object.values(stopWordsByLanguage).flatMap((words) => [...words]),
);

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
  if (!language || !language.trim()) {
    return combinedStopWords;
  }

  return stopWordsByLanguage[normalizeLanguage(language)] ?? combinedStopWords;
}

function tokenizeRaw(value: string): string[] {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export function detectLanguageFromText(...parts: Array<string | null | undefined>): string | null {
  const text = parts.filter(Boolean).join(" ");
  if (!text.trim()) return null;

  const tokens = tokenizeRaw(text);
  if (tokens.length < 8) return null;

  const scores = Object.entries(stopWordsByLanguage).map(([language, words]) => ({
    language,
    score: tokens.reduce((sum, token) => (words.has(token) ? sum + 1 : sum), 0),
  }));

  scores.sort((left, right) => right.score - left.score);
  const top = scores[0];
  const second = scores[1]?.score ?? 0;

  if (!top) return null;
  const scoreShare = top.score / tokens.length;
  if (top.score < 3 || scoreShare < 0.08) return null;
  if (top.score === second) return null;

  return top.language;
}

export function tokenize(value: string, language?: string | null): string[] {
  const stopWords = getStopWords(language);
  return tokenizeRaw(value).filter((token) => {
    if (token.length <= 2) return false;
    if (/^\d+$/u.test(token)) return false;
    return !stopWords.has(token);
  });
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
