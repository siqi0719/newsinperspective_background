import { ScopeType } from "@prisma/client";
import type { SourceProfileDto, StoryComparison, StoryDetail, StoryFacetDto, StoryListItem } from "@news/shared";
import { extractRegion } from "../domain/category.js";
import { prisma } from "../lib/prisma.js";

function toIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export async function listStoryDates(): Promise<string[]> {
  const rows = await prisma.storyCluster.findMany({
    distinct: ["storyDate"],
    orderBy: { storyDate: "desc" },
    select: { storyDate: true },
  });

  return rows.map((row) => toIsoDate(row.storyDate));
}

interface StoryFilters {
  category?: string | undefined;
  region?: string | undefined;
}

interface StoryPaging {
  offset?: number | undefined;
  limit?: number | undefined;
}

function buildStoryWhere(date: string, filters: StoryFilters = {}) {
  const start = new Date(`${date}T00:00:00.000Z`);
  const end = new Date(`${date}T23:59:59.999Z`);
  const where: {
    storyDate: { gte: Date; lte: Date };
    topCategory?: string | { startsWith: string };
  } = {
    storyDate: { gte: start, lte: end },
  };

  if (filters.category) {
    where.topCategory = filters.category;
  } else if (filters.region) {
    where.topCategory = { startsWith: `${filters.region}` };
  }

  return where;
}

function uniqueDomains(article: { domain: string; duplicateDomains: string[] }): string[] {
  return [...new Set([article.domain, ...article.duplicateDomains])];
}

function toIsoDateOrFallback(value: Date | null | undefined, fallback: Date): string {
  return toIsoDate(value ?? fallback);
}

function getClusterDateRange(
  storyDate: Date,
  articles: Array<{ article: { publishedAt: Date | null } }>,
): { dateFrom: string; dateUntil: string } {
  const publishedDates = articles
    .map(({ article }) => article.publishedAt)
    .filter((value): value is Date => value instanceof Date)
    .sort((left, right) => left.getTime() - right.getTime());

  return {
    dateFrom: toIsoDateOrFallback(publishedDates[0], storyDate),
    dateUntil: toIsoDateOrFallback(publishedDates[publishedDates.length - 1], storyDate),
  };
}

function englishTokenCount(value: string): number {
  const matches = value.toLowerCase().match(/\b[a-z]{2,}\b/g) ?? [];
  return matches.filter((token) => GLOBAL_TIER_DOMAINS.has(token) === false).length;
}

function nonAsciiLetterRatio(value: string): number {
  const letters = value.match(/\p{L}/gu) ?? [];
  if (letters.length === 0) return 0;
  const nonAsciiLetters = letters.filter((letter) => !/[a-z]/i.test(letter)).length;
  return nonAsciiLetters / letters.length;
}

function isLikelyEnglishStory(
  title: string,
  keywords: string[],
  articles: Array<{ article: { title: string; summary: string | null; contentSnippet: string | null } }>,
): boolean {
  const combinedLeadText = [
    title,
    ...articles.slice(0, 3).flatMap(({ article }) => [article.title, article.summary, article.contentSnippet]),
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ");

  const englishTokenScore = englishTokenCount(combinedLeadText);
  const keywordEnglishCount = keywords.filter((keyword) => /^[a-z]{3,}$/i.test(keyword)).length;
  const foreignScriptRatio = nonAsciiLetterRatio(combinedLeadText);

  return foreignScriptRatio < 0.18 && (englishTokenScore >= 12 || keywordEnglishCount >= 3);
}

const GLOBAL_TIER_DOMAINS = new Set([
  "apnews.com",
  "bbc.com",
  "bloomberg.com",
  "cnbc.com",
  "cnn.com",
  "economist.com",
  "ft.com",
  "guardian.co.uk",
  "nytimes.com",
  "reuters.com",
  "washingtonpost.com",
  "wsj.com",
]);

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function differenceInDays(start: string, end: string): number {
  const startDate = new Date(`${start}T00:00:00.000Z`);
  const endDate = new Date(`${end}T00:00:00.000Z`);
  return Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000));
}

function computeImportanceScore(
  storyDate: Date,
  articleCount: number,
  sourceCount: number,
  articles: Array<{ article: { domain: string; duplicateDomains: string[]; publishedAt: Date | null } }>,
  dateFrom: string,
  dateUntil: string,
): number {
  const uniqueDomainCount = new Set(articles.flatMap(({ article }) => uniqueDomains(article))).size;
  const tierDomainCount = new Set(
    articles
      .map(({ article }) => article.domain)
      .filter((domain) => GLOBAL_TIER_DOMAINS.has(domain)),
  ).size;
  const latestPublishedAt = articles
    .map(({ article }) => article.publishedAt)
    .filter((value): value is Date => value instanceof Date)
    .sort((left, right) => right.getTime() - left.getTime())[0] ?? storyDate;

  const storyDayEnd = new Date(storyDate);
  storyDayEnd.setUTCHours(23, 59, 59, 999);
  const freshnessHours = Math.max(0, (storyDayEnd.getTime() - latestPublishedAt.getTime()) / 3_600_000);

  const sourceDiversityScore = clamp01(Math.log1p(uniqueDomainCount) / Math.log(18));
  const volumeScore = clamp01(Math.log1p(articleCount) / Math.log(30));
  const tierScore = clamp01(tierDomainCount / 4);
  const freshnessScore = clamp01(1 - freshnessHours / 30);
  const persistenceScore = clamp01(differenceInDays(dateFrom, dateUntil) / 3);
  const breadthScore = clamp01(Math.log1p(sourceCount) / Math.log(20));

  return Number(
    (
      (tierScore * 0.3
        + sourceDiversityScore * 0.25
        + freshnessScore * 0.2
        + volumeScore * 0.15
        + persistenceScore * 0.05
        + breadthScore * 0.05)
      * 100
    ).toFixed(1),
  );
}

export async function listStoryFacets(date: string): Promise<StoryFacetDto> {
  const rows = await prisma.storyCluster.findMany({
    where: buildStoryWhere(date),
    include: {
      articles: {
        include: {
          article: {
            include: {
              features: {
                where: { scopeType: ScopeType.ARTICLE },
              },
            },
          },
        },
      },
    },
  });

  const englishRows = rows.filter((row) => {
    const keywords = row.articles
      .flatMap((item) => item.article.features)
      .flatMap((feature) => {
        const payload = feature.featureSet as { keywords?: string[] };
        return payload.keywords ?? [];
      })
      .filter((value, index, arr) => arr.indexOf(value) === index)
      .slice(0, 8);

    return isLikelyEnglishStory(row.title, keywords, row.articles);
  });

  const categorySourceRows = englishRows.length >= 5 ? englishRows : rows;

  const categories = categorySourceRows
    .map((row) => row.topCategory)
    .filter((value): value is string => Boolean(value))
    .filter((value, index, arr) => arr.indexOf(value) === index)
    .sort((left, right) => left.localeCompare(right));

  const regions = categories
    .map((category) => extractRegion(category))
    .filter((value): value is string => Boolean(value))
    .filter((value, index, arr) => arr.indexOf(value) === index)
    .sort((left, right) => left.localeCompare(right));

  return {
    date,
    regions,
    categories,
  };
}

export async function listStoriesByDate(
  date: string,
  filters: StoryFilters = {},
  paging: StoryPaging = {},
): Promise<StoryListItem[]> {

  const rows = await prisma.storyCluster.findMany({
    where: buildStoryWhere(date, filters),
    include: {
      features: {
        where: { scopeType: ScopeType.CLUSTER },
        take: 1,
      },
      articles: {
        include: {
          article: {
            include: {
              features: {
                where: { scopeType: ScopeType.ARTICLE },
              },
            },
          },
        },
      },
    },
  });

  const scoredRows = rows.map((row) => {
    const topDomains = [...new Set(row.articles.flatMap((item) => uniqueDomains(item.article)))].slice(0, 4);
    const articleKeywords = row.articles
      .flatMap((item) => item.article.features)
      .flatMap((feature) => {
        const payload = feature.featureSet as { keywords?: string[] };
        return payload.keywords ?? [];
      })
      .filter((value, index, arr) => arr.indexOf(value) === index)
      .slice(0, 8);
    const clusterFeature = row.features[0]?.featureSet as { keywords?: string[] } | undefined;
    const keywords =
      clusterFeature?.keywords && clusterFeature.keywords.length > 0
        ? clusterFeature.keywords.slice(0, 8)
        : articleKeywords;
    const { dateFrom, dateUntil } = getClusterDateRange(row.storyDate, row.articles);
    const importanceScore = computeImportanceScore(
      row.storyDate,
      row.articleCount,
      row.sourceCount,
      row.articles,
      dateFrom,
      dateUntil,
    );

    return {
      likelyEnglish: isLikelyEnglishStory(row.title, keywords, row.articles),
      item: {
      id: row.id,
      date,
      dateFrom,
      dateUntil,
      importanceScore,
      title: row.title,
      region: extractRegion(row.topCategory),
      category: row.topCategory,
      articleCount: row.articleCount,
      sourceCount: row.sourceCount,
      topDomains,
      keywords,
      },
    };
  });

  const preferredItems = scoredRows.filter((row) => row.likelyEnglish).map((row) => row.item);
  const fallbackItems = scoredRows.map((row) => row.item);
  const candidateItems = preferredItems.length >= 10 ? preferredItems : fallbackItems;

  const items = candidateItems.sort((left, right) => {
    if (right.importanceScore !== left.importanceScore) {
      return right.importanceScore - left.importanceScore;
    }
    if (right.sourceCount !== left.sourceCount) {
      return right.sourceCount - left.sourceCount;
    }
    return right.articleCount - left.articleCount;
  });

  const offset = Math.max(0, paging.offset ?? 0);
  const limit = Math.max(1, paging.limit ?? items.length);
  return items.slice(offset, offset + limit);
}

export async function getStoryDetail(id: string): Promise<StoryDetail | null> {
  const row = await prisma.storyCluster.findUnique({
    where: { id },
    include: {
      features: {
        where: { scopeType: ScopeType.CLUSTER },
        take: 1,
      },
      articles: {
        include: {
          article: {
            include: {
              features: {
                where: { scopeType: ScopeType.ARTICLE },
              },
            },
          },
        },
        orderBy: { rank: "asc" },
      },
    },
  });

  if (!row) return null;

  const articles = row.articles.map(({ article }) => {
    const feature = article.features[0]?.featureSet as
      | { keywords?: string[]; sentiment?: number; subjectivity?: number; biasSignals?: string[] }
      | undefined;

    return {
      id: article.id,
      title: article.title,
      url: article.canonicalUrl,
      domain: article.domain,
      syndicatedDomains: article.duplicateDomains,
      sourceName: article.sourceName,
      publishedAt: article.publishedAt?.toISOString() ?? new Date().toISOString(),
      summary: article.summary,
      contentSnippet: article.contentSnippet,
      fullText: article.fullText,
      extractionStatus: article.extractionStatus,
      keywords: feature?.keywords ?? [],
      sentiment: feature?.sentiment ?? 0,
      subjectivity: feature?.subjectivity ?? 0,
      biasSignals: feature?.biasSignals ?? [],
    };
  });
  const { dateFrom, dateUntil } = getClusterDateRange(row.storyDate, row.articles);
  const clusterFeature = row.features[0]?.featureSet as { keywords?: string[] } | undefined;
  const articleKeywords = [...new Set(articles.flatMap((article) => article.keywords))].slice(0, 8);
  const detailKeywords =
    clusterFeature?.keywords && clusterFeature.keywords.length > 0
      ? clusterFeature.keywords.slice(0, 8)
      : articleKeywords;
  const importanceScore = computeImportanceScore(
    row.storyDate,
    row.articleCount,
    row.sourceCount,
    row.articles,
    dateFrom,
    dateUntil,
  );

  return {
    id: row.id,
    date: toIsoDate(row.storyDate),
    dateFrom,
    dateUntil,
    importanceScore,
    title: row.title,
    region: extractRegion(row.topCategory),
    category: row.topCategory,
    articleCount: row.articleCount,
    sourceCount: row.sourceCount,
    topDomains: [...new Set(articles.flatMap((article) => [article.domain, ...article.syndicatedDomains]))].slice(0, 4),
    keywords: detailKeywords,
    articles,
  };
}

export async function getStoryComparison(id: string): Promise<StoryComparison | null> {
  const detail = await getStoryDetail(id);
  if (!detail) return null;

  const sharedKeywords = detail.keywords.slice(0, 8);
  const commonEntities = detail.articles
    .flatMap((article) => article.title.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}\b/g) ?? [])
    .filter((value, index, arr) => arr.indexOf(value) === index)
    .slice(0, 8);

  const articleComparisons = detail.articles.map((article) => ({
    articleId: article.id,
    title: article.title,
    domain: article.domain,
    publishedAt: article.publishedAt,
    sentiment: article.sentiment,
    subjectivity: article.subjectivity,
    biasSignals: article.biasSignals,
    sharedKeywords: article.keywords.filter((keyword) => sharedKeywords.includes(keyword)),
  }));

  const framingSummary = [
    `Coverage spans ${detail.sourceCount} sources across ${detail.topDomains.join(", ")}.`,
    `Shared focus terms: ${sharedKeywords.join(", ") || "none"}.`,
    `Bias signals observed: ${[...new Set(articleComparisons.flatMap((item) => item.biasSignals))].join(", ") || "none"}.`,
  ];

  return {
    storyId: detail.id,
    date: detail.date,
    dateFrom: detail.dateFrom,
    dateUntil: detail.dateUntil,
    title: detail.title,
    sharedKeywords,
    commonEntities,
    domainSpread: detail.topDomains,
    framingSummary,
    articleComparisons,
  };
}

export async function getSourceProfile(domain: string): Promise<SourceProfileDto | null> {
  const row = await prisma.sourceProfile.findUnique({
    where: { domain },
  });

  if (!row) return null;

  return {
    domain: row.domain,
    sourceName: row.sourceName,
    articleCount: row.articleCount,
    averageSentiment: row.averageSentiment,
    commonBiasSignals: row.commonBiasSignals,
  };
}
