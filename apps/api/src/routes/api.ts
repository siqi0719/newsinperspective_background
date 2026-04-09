import { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  getSourceProfile,
  getStoryComparison,
  getStoryDetail,
  listStoriesByDate,
  listStoryDates,
  listStoryFacets,
} from "../services/story-query.js";

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
}
