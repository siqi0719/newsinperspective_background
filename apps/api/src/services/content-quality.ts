const BLOCK_PATTERNS = [
  "blocked as a crawler bot",
  "you might have been detected and blocked",
  "please enable javascript",
  "disable any adblockers",
  "accessissues@",
  "verify you are human",
  "press and hold",
  "captcha",
  "subscribe to continue reading",
  "sign in to continue",
  "cookie policy",
];

export interface ContentQualityAssessment {
  ok: boolean;
  reasons: string[];
}

export function assessExtractedArticleText(text: string): ContentQualityAssessment {
  const normalized = text.toLowerCase();
  const reasons: string[] = [];

  for (const pattern of BLOCK_PATTERNS) {
    if (normalized.includes(pattern)) {
      reasons.push(`matched:${pattern}`);
    }
  }

  // Count words using Unicode letters so non-English articles are not rejected by ASCII-only tokenization.
  const words = text.match(/\p{L}{3,}/gu) ?? [];
  const uniqueWords = new Set(words.map((word) => word.toLowerCase()));
  const uniqueRatio = words.length === 0 ? 0 : uniqueWords.size / words.length;

  if (words.length < 40) {
    reasons.push("too-few-words");
  }

  if (words.length > 0 && uniqueRatio < 0.2) {
    reasons.push("low-token-diversity");
  }

  return {
    ok: reasons.length === 0,
    reasons,
  };
}
