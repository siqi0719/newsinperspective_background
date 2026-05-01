import { Prisma, ExtractionStatus, EntityType } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { createFileLogger } from "../lib/file-logger.js";
import { extractArticleTextFromUrl } from "./article-text.js";
import { entityRecognitionService } from "./entity-recognition.js";
import { entityLinkerService } from "./entity-linker.js";

const logger = createFileLogger("article-enrichment.log");

export interface ArticleEnrichmentOptions {
  date?: string;
  limit?: number;
  force?: boolean;
  articleIds?: string[];
}

export interface ArticleEnrichmentResult {
  matched: number;
  attempted: number;
  succeeded: number;
  failed: number;
  entitiesExtracted: number;
}

/**
 * Full article enrichment pipeline:
 * 1. Extract full text from article URL
 * 2. Run NER to identify entities
 * 3. Link entities to Wikipedia
 * 4. Save entity mentions to database
 */
export async function enrichArticleWithEntities(
  articleId: string,
  originalUrl: string,
): Promise<{ success: boolean; entitiesCount: number; error?: string }> {
  try {
    // Step 1: Get article text from database (title + summary)
    let fullText: string;
    const article = await prisma.article.findUnique({
      where: { id: articleId },
      select: { title: true, summary: true, fullText: true },
    });

    if (!article) {
      return {
        success: false,
        entitiesCount: 0,
        error: `Article not found: ${articleId}`,
      };
    }

    // Use existing text or combination of title + summary
    fullText = article.fullText || `${article.title}\n\n${article.summary || ""}`;

    if (!fullText.trim()) {
      return {
        success: false,
        entitiesCount: 0,
        error: "No text available for entity extraction",
      };
    }

    // Step 2: Recognize entities using NER
    let entityMentions: Array<{
      entityText: string;
      entityType: EntityType;
      confidence: number;
      startOffset: number;
      endOffset: number;
      context: string;
    }> = [];

    try {
      const nerResult = await entityRecognitionService.recognizeEntities(fullText);
      entityMentions = nerResult.entities.map((entity) => ({
        entityText: entity.entityText,
        entityType: entity.entityType as EntityType,
        confidence: entity.confidence ?? 0.85,
        startOffset: entity.startOffset ?? 0,
        endOffset: entity.endOffset ?? entity.startOffset + entity.entityText.length,
        context: extractContext(fullText, entity.startOffset ?? 0, 50),
      }));

      logger.info(`Found ${entityMentions.length} entities in article ${articleId}`);
    } catch (error) {
      logger.warn(`NER failed for article ${articleId}:`, error);
      return {
        success: true,
        entitiesCount: 0,
        error: `NER failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    // Step 3: Link entities to Wikipedia and save to database
    let entitiesCreated = 0;

    for (const mention of entityMentions) {
      try {
        // Link to Wikipedia
        const linkedEntity = await entityLinkerService.linkEntity({
          entityText: mention.entityText,
          entityType: mention.entityType,
          confidence: mention.confidence,
          startOffset: mention.startOffset,
          endOffset: mention.endOffset,
          context: mention.context,
        });

        // Get or create entity in database
        const namedEntity = await prisma.namedEntity.upsert({
          where: { name: mention.entityText },
          update: {
            type: mention.entityType,
            wikipediaUrl: linkedEntity.wikipediaUrl,
            summary: linkedEntity.summary,
            imageUrl: linkedEntity.imageUrl,
            lastUpdated: new Date(),
          },
          create: {
            name: mention.entityText,
            type: mention.entityType,
            wikipediaUrl: linkedEntity.wikipediaUrl,
            summary: linkedEntity.summary,
            imageUrl: linkedEntity.imageUrl,
          },
        });

        // Create entity mention
        await prisma.entityMention.create({
          data: {
            entityId: namedEntity.id,
            articleId,
            startOffset: mention.startOffset,
            endOffset: mention.endOffset,
            context: mention.context,
            confidence: mention.confidence,
          },
        });

        entitiesCreated++;
      } catch (error) {
        logger.warn(
          `Failed to process entity "${mention.entityText}":`,
          error instanceof Error ? error.message : String(error),
        );
      }
    }

    logger.info(`Created ${entitiesCreated} entity mentions for article ${articleId}`);

    return {
      success: true,
      entitiesCount: entitiesCreated,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(`Article enrichment failed for ${articleId}:`, errorMsg);
    return {
      success: false,
      entitiesCount: 0,
      error: errorMsg,
    };
  }
}

/**
 * Batch enrich articles with entities
 */
export async function enrichArticlesWithEntities(
  options: ArticleEnrichmentOptions = {},
): Promise<ArticleEnrichmentResult> {
  const where: Prisma.ArticleWhereInput = {};

  if (options.date) {
    where.ingestionDate = {
      gte: new Date(`${options.date}T00:00:00.000Z`),
      lte: new Date(`${options.date}T23:59:59.999Z`),
    };
  }

  if (!options.force) {
    // Only process articles without entities
    where.entityMentions = {
      none: {},
    };
  }

  if (options.articleIds && options.articleIds.length > 0) {
    where.id = { in: options.articleIds };
  }

  const matched = await prisma.article.count({ where });
  const articles = await prisma.article.findMany({
    where,
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      originalUrl: true,
    },
    ...(options.limit ? { take: options.limit } : {}),
  });

  let succeeded = 0;
  let failed = 0;
  let entitiesExtracted = 0;

  logger.info(
    `Starting entity enrichment: matched=${matched}, attempting=${articles.length}`,
  );

  for (const article of articles) {
    const result = await enrichArticleWithEntities(article.id, article.originalUrl);
    if (result.success) {
      succeeded++;
      entitiesExtracted += result.entitiesCount;
    } else {
      failed++;
      if (result.error) {
        logger.warn(`Enrichment error for ${article.id}: ${result.error}`);
      }
    }
  }

  logger.info(
    `Entity enrichment completed: succeeded=${succeeded}, failed=${failed}, entitiesExtracted=${entitiesExtracted}`,
  );

  return {
    matched,
    attempted: articles.length,
    succeeded,
    failed,
    entitiesExtracted,
  };
}

function extractContext(text: string, offset: number, contextLength: number = 50): string {
  const start = Math.max(0, offset - contextLength);
  const end = Math.min(text.length, offset + contextLength);
  return text.slice(start, end).trim();
}
