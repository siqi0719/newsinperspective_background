import { ArticleFeatureSet } from "../domain/types.js";
import {
  detectBiasSignals,
  extractEntities,
  extractKeywords,
  normalizeLanguage,
  scoreSentiment,
  scoreSubjectivity,
} from "../domain/text.js";

export function buildArticleFeatures(
  title: string,
  summary: string | null,
  body: string | null,
  language: string | null,
): ArticleFeatureSet {
  const normalizedLanguage = normalizeLanguage(language);
  return {
    keywords: extractKeywords(normalizedLanguage, title, summary, body),
    entities: extractEntities(title, summary, body),
    sentiment: scoreSentiment(normalizedLanguage, title, summary, body),
    subjectivity: scoreSubjectivity(normalizedLanguage, title, summary, body),
    biasSignals: detectBiasSignals(title, summary, body),
    language: language,
  };
}
