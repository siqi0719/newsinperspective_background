import { Prisma, RunStatus } from "@prisma/client";
import { ExtractionStatus } from "@prisma/client";
import { extractRegion } from "../domain/category.js";
import { env } from "../config/env.js";
import { createFileLogger } from "../lib/file-logger.js";
import { prisma } from "../lib/prisma.js";
import { buildArticleFeatures, buildClusterKeywordsWithOpenRouter } from "./nlp.js";
import {
  listClustersForIngestion,
  closeKagiBrowser,
  KagiTopCluster,
} from "./kagi-news.js";
import { extractArticleTextFromUrl } from "./article-text.js";

interface NormalizedArticle {
  originalUrl: string;
  canonicalUrl: string;
  title: string;
  summary: string | null;
  publishedAt: Date | null;
  sourceName: string;
  domain: string;
  language: string | null;
  category: string | null;
}

function normalizeKagiArticle(
  article: { title: string; link: string; domain: string; date?: string },
): NormalizedArticle {
  return {
    originalUrl: article.link,
    canonicalUrl: article.link,
    title: article.title,
    summary: null,
    publishedAt: article.date ? new Date(article.date) : null,
    sourceName: article.domain,
    domain: article.domain,
    language: "en",
    category: "World",
  };
}

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

async function upsertNormalizedArticle(
  article: NormalizedArticle,
  ingestionDate: Date,
): Promise<string> {
  const existing = await prisma.article.findUnique({
    where: { canonicalUrl: article.canonicalUrl },
  });

  if (existing) return existing.id;

  const created = await prisma.article.create({
    data: {
      canonicalUrl: article.canonicalUrl,
      originalUrl: article.originalUrl,
      title: article.title,
      summary: article.summary,
      publishedAt: article.publishedAt,
      sourceName: article.sourceName,
      domain: article.domain,
      duplicateDomains: [],
      duplicateCount: 0,
      language: article.language,
      category: article.category,
      ingestionDate,
      authorNames: [],
    },
  });

  return created.id;
}

export async function runKagiNewsIngestion(
  date: string,
): Promise<{ runId: string; status: RunStatus; clusterCount: number; articleCount: number }> {
  const ingestionDate = new Date(`${date}T00:00:00.000Z`);
  const logger = createFileLogger(`ingestion-kagi-${date}.log`);

  logger.info("Kagi news ingestion started", { ingestionDate: ingestionDate.toISOString() });

  let clusterCount = 0;
  let articleCount = 0;
  let status = RunStatus.SUCCESS;

  try {
    // Fetch clusters from Kagi news API
    logger.info("Fetching Kagi news clusters...");
    const selection = await listClustersForIngestion({
      globalLimit: 50,
      perCategoryLimit: 15,
      requiredCategories: ["World", "USA", "Business", "Technology", "Science", "Entertainment", "Sports"],
      onStageMessage: (message) => logger.info(message),
    });

    const clusters = selection.clusters;
    clusterCount = clusters.length;

    logger.info(`Fetched ${clusters.length} clusters from Kagi`);

    if (clusters.length === 0) {
      logger.warn("No clusters returned from Kagi API");
      return { runId: "unknown", status: RunStatus.PARTIAL, clusterCount: 0, articleCount: 0 };
    }

    // Process each cluster
    for (const [clusterIndex, chosen] of clusters.entries()) {
      logger.info(`[cluster ${clusterIndex + 1}/${clusters.length}] ${chosen.story.title}`);

      // Create or get story cluster
      const storyCluster = await prisma.storyCluster.upsert({
        where: {
          clusterKey_storyDate: {
            clusterKey: `kagi-${chosen.story.id}`,
            storyDate: ingestionDate,
          },
        },
        update: {
          title: chosen.story.title,
          topCategory: chosen.categoryName,
          articleCount: chosen.story.articles.length,
          sourceCount: chosen.story.unique_domains ?? chosen.story.articles.length,
        },
        create: {
          clusterKey: `kagi-${chosen.story.id}`,
          storyDate: ingestionDate,
          title: chosen.story.title,
          topCategory: chosen.categoryName,
          articleCount: chosen.story.articles.length,
          sourceCount: chosen.story.unique_domains ?? chosen.story.articles.length,
        },
      });

      // Process articles in cluster
      for (const [articleIndex, rawArticle] of chosen.story.articles.entries()) {
        try {
          const article = normalizeKagiArticle(rawArticle);

          // Extract article text for better summary
          let fullText: string | null = null;
          let extractionStatus: ExtractionStatus = ExtractionStatus.PENDING;

          try {
            const extracted = await extractArticleTextFromUrl(article.originalUrl);
            fullText = extracted.text;
            article.summary = extracted.text.slice(0, 500);
            extractionStatus = ExtractionStatus.SUCCESS;
            logger.info(`Extracted article ${articleIndex + 1}/${chosen.story.articles.length}`, {
              title: article.title,
              textLength: fullText.length,
            });
          } catch (error) {
            logger.warn(`Failed to extract article text for ${article.originalUrl}`, {
              error: error instanceof Error ? error.message : String(error),
            });
            extractionStatus = ExtractionStatus.FAILED;
          }

          // Upsert article
          const articleId = await upsertNormalizedArticle(article, ingestionDate);

          // Update article with full text if extracted
          if (fullText) {
            await prisma.article.update({
              where: { id: articleId },
              data: {
                fullText,
                extractionStatus,
              },
            });
          }

          // Link article to cluster
          await prisma.clusterArticle.upsert({
            where: {
              clusterId_articleId: {
                clusterId: storyCluster.id,
                articleId,
              },
            },
            update: {
              rank: articleIndex + 1,
              similarity: 0.95,
            },
            create: {
              clusterId: storyCluster.id,
              articleId,
              rank: articleIndex + 1,
              similarity: 0.95,
            },
          });

          articleCount += 1;
        } catch (error) {
          logger.error(`Failed to process article: ${rawArticle.title}`, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      // Build cluster features
      try {
        const featureSet = buildArticleFeatures(
          chosen.story.title,
          chosen.story.short_summary,
          null,
          "en",
        );
        await prisma.nlpFeature.upsert({
          where: { id: `${storyCluster.id}-cluster` },
          update: { featureSet: toInputJson(featureSet) },
          create: {
            id: `${storyCluster.id}-cluster`,
            scopeType: "CLUSTER",
            clusterId: storyCluster.id,
            featureSet: toInputJson(featureSet),
          },
        });
      } catch (error) {
        logger.warn(`Failed to build cluster features`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    logger.info("Kagi news ingestion completed successfully", {
      clusterCount,
      articleCount,
    });
  } catch (error) {
    status = RunStatus.FAILED;
    logger.error("Kagi news ingestion failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    await closeKagiBrowser();
  }

  return {
    runId: "kagi-" + date,
    status,
    clusterCount,
    articleCount,
  };
}
