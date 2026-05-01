import { FastifyInstance } from "fastify";
import { z } from "zod";
import { getCachedFavicon } from "../services/favicon-cache.js";
import {
  getSourceProfile,
  getStoryComparison,
  getStoryDetail,
  listStoriesByDate,
  listStoryDates,
  listStoryFacets,
} from "../services/story-query.js";
import { entityQueryService } from "../services/entity-query.js";
import {
  articleEntitiesQuerySchema,
  searchEntitiesQuerySchema,
  entityIdParamsSchema,
} from "@news/shared";

export async function registerApiRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/dates", async () => {
    return listStoryDates();
  });

  app.get("/api/stories", async (request, reply) => {
    const querySchema = z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      category: z.string().optional(),
      region: z.string().optional(),
      offset: z.coerce.number().int().min(0).optional(),
      limit: z.coerce.number().int().min(1).max(50).optional(),
    });
    const query = querySchema.parse(request.query);
    const filters =
      query.category || query.region
        ? {
            category: query.category,
            region: query.region,
          }
        : undefined;
    return listStoriesByDate(query.date, filters, {
      offset: query.offset,
      limit: query.limit,
    });
  });

  app.get("/api/facets", async (request) => {
    const querySchema = z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    });
    const query = querySchema.parse(request.query);
    return listStoryFacets(query.date);
  });

  app.get("/api/stories/:id", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const detail = await getStoryDetail(params.id);
    if (!detail) {
      reply.code(404);
      return { message: "Story not found" };
    }
    return detail;
  });

  app.get("/api/stories/:id/comparison", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const comparison = await getStoryComparison(params.id);
    if (!comparison) {
      reply.code(404);
      return { message: "Story comparison not found" };
    }
    return comparison;
  });

  app.get("/api/sources/:domain", async (request, reply) => {
    const params = z.object({ domain: z.string() }).parse(request.params);
    const source = await getSourceProfile(params.domain);
    if (!source) {
      reply.code(404);
      return { message: "Source not found" };
    }
    return source;
  });

  app.get("/api/favicons/:domain", async (request, reply) => {
    const params = z.object({ domain: z.string().min(1).max(255) }).parse(request.params);
    const query = z.object({ refresh: z.coerce.boolean().optional() }).parse(request.query);
    const favicon = await getCachedFavicon(params.domain, { forceRefresh: query.refresh ?? false });

    if (!favicon) {
      reply.code(404);
      return { message: `Favicon not found for domain: ${params.domain}` };
    }

    reply.header("Cache-Control", "public, max-age=31536000, immutable");
    reply.type(favicon.contentType);
    return reply.send(favicon.buffer);
  });

  // ============================================================
  // Entity API Routes (Entity Recognition & Linking)
  // ============================================================

  /**
   * GET /api/articles/:articleId/entities
   * Get all entities recognized in a specific article
   */
  app.get("/api/articles/:articleId/entities", async (request, reply) => {
    const paramsSchema = z.object({ articleId: z.string().min(1) });
    const params = paramsSchema.parse(request.params);
    const query = articleEntitiesQuerySchema.parse(request.query);

    try {
      // Import prisma
      const { prisma } = await import("../lib/prisma.js");

      // Get article to verify it exists and get its title
      const article = await prisma.article.findUnique({
        where: { id: params.articleId },
        select: { title: true },
      });

      if (!article) {
        reply.code(404);
        return { message: "Article not found" };
      }

      const entities = await entityQueryService.getArticleEntities(
        params.articleId,
        {
          type: query.type ? query.type as any : undefined,
          minConfidence: query.minConfidence,
          limit: query.limit,
        }
      );

      // Count entities by type
      const byType = {
        PERSON: 0,
        GPE: 0,
        ORG: 0,
        EVENT: 0,
      };

      entities.forEach((e) => {
        if (e.entityType in byType) {
          byType[e.entityType as keyof typeof byType]++;
        }
      });

      return {
        articleId: params.articleId,
        title: article.title,
        totalEntities: entities.length,
        byType,
        entities,
      };
    } catch (error) {
      if ((error as any).message?.includes("Article not found") || (error as any).code === "P2025") {
        reply.code(404);
        return { message: "Article not found" };
      }
      throw error;
    }
  });

  /**
   * GET /api/entities/:entityId
   * Get detailed information about an entity with statistics
   */
  app.get("/api/entities/:entityId", async (request, reply) => {
    const params = entityIdParamsSchema.parse(request.params);

    try {
      const entity = await entityQueryService.getEntityDetail(params.entityId);
      return entity;
    } catch (error) {
      if ((error as any).message?.includes("Entity not found")) {
        reply.code(404);
        return { message: "Entity not found" };
      }
      throw error;
    }
  });

  /**
   * GET /api/entities/search
   * Search for entities by name with optional filtering
   */
  app.get<{ Querystring: any }>("/api/entities/search", async (request, reply) => {
    const query = searchEntitiesQuerySchema.parse(request.query);

    try {
      const { results, totalResults } = await entityQueryService.searchEntities(
        query.q,
        {
          type: query.type ? query.type as any : undefined,
          limit: query.limit,
          offset: query.offset,
        }
      );

      return {
        query: query.q,
        totalResults,
        results,
      };
    } catch (error) {
      reply.code(500);
      return { message: "Search failed: " + (error as any).message };
    }
  });
}
