export interface FeedCandidate {
  url: string;
  category: string | null;
  sourceName: string | null;
}

export interface NormalizedArticleInput {
  originalUrl: string;
  canonicalUrl: string;
  textFingerprint: string | null;
  title: string;
  summary: string | null;
  contentSnippet: string | null;
  publishedAt: Date | null;
  sourceName: string;
  domain: string;
  language: string | null;
  category: string | null;
  authorNames: string[];
}

export interface ArticleFeatureSet {
  keywords: string[];
  entities: string[];
  sentiment: number;
  subjectivity: number;
  biasSignals: string[];
  language: string | null;
}
