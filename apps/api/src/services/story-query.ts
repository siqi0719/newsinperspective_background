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

export async function listStoryFacets(date: string): Promise<StoryFacetDto> {
  const rows = await prisma.storyCluster.findMany({
    where: buildStoryWhere(date),
    select: { topCategory: true },
  });

  const categories = rows
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

export async function listStoriesByDate(date: string, filters: StoryFilters = {}): Promise<StoryListItem[]> {

  const rows = await prisma.storyCluster.findMany({
    where: buildStoryWhere(date, filters),
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
    orderBy: [{ sourceCount: "desc" }, { articleCount: "desc" }],
  });

  return rows.map((row) => {
    const topDomains = [...new Set(row.articles.flatMap((item) => uniqueDomains(item.article)))].slice(0, 4);
    const keywords = row.articles
      .flatMap((item) => item.article.features)
      .flatMap((feature) => {
        const payload = feature.featureSet as { keywords?: string[] };
        return payload.keywords ?? [];
      })
      .filter((value, index, arr) => arr.indexOf(value) === index)
      .slice(0, 8);

    return {
      id: row.id,
      date,
      title: row.title,
      region: extractRegion(row.topCategory),
      category: row.topCategory,
      articleCount: row.articleCount,
      sourceCount: row.sourceCount,
      topDomains,
      keywords,
    };
  });
}

export async function getStoryDetail(id: string): Promise<StoryDetail | null> {
  const row = await prisma.storyCluster.findUnique({
    where: { id },
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
      url: article.originalUrl,
      domain: article.domain,
      syndicatedDomains: article.duplicateDomains,
      sourceName: article.sourceName,
      publishedAt: article.publishedAt?.toISOString() ?? new Date().toISOString(),
      summary: article.summary,
      keywords: feature?.keywords ?? [],
      sentiment: feature?.sentiment ?? 0,
      subjectivity: feature?.subjectivity ?? 0,
      biasSignals: feature?.biasSignals ?? [],
    };
  });

  return {
    id: row.id,
    date: toIsoDate(row.storyDate),
    title: row.title,
    region: extractRegion(row.topCategory),
    category: row.topCategory,
    articleCount: row.articleCount,
    sourceCount: row.sourceCount,
    topDomains: [...new Set(articles.flatMap((article) => [article.domain, ...article.syndicatedDomains]))].slice(0, 4),
    keywords: [...new Set(articles.flatMap((article) => article.keywords))].slice(0, 8),
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
