import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { enrichArticleText } from "../services/article-text.js";
import { enrichArticlesWithEntities } from "../services/article-enrichment.js";
import { runIngestion } from "../services/ingestion.js";
import { runKagiNewsIngestion } from "../services/kagi-news-ingest.js";

export async function registerInternalRoutes(app: FastifyInstance): Promise<void> {
  app.post("/internal/ingest/run", async (request) => {
    const bodySchema = z
      .object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      })
      .default({});

    const body = bodySchema.parse(request.body ?? {});
    const date = body.date ?? new Date().toISOString().slice(0, 10);

    return runIngestion(date);
  });

  app.get("/internal/ingest/runs/:date", async (request, reply) => {
    const params = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(request.params);
    const ingestionDate = new Date(`${params.date}T00:00:00.000Z`);
    const run = await prisma.ingestionRun.findUnique({
      where: { ingestionDate },
      include: { feedFetches: true },
    });

    if (!run) {
      reply.code(404);
      return { message: "Run not found" };
    }

    return run;
  });

  app.post("/internal/articles/enrich", async (request) => {
    const bodySchema = z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      limit: z.number().int().positive().max(1000).optional(),
      force: z.boolean().optional(),
      withEntities: z.boolean().optional().default(true),
    });

    const body = bodySchema.parse(request.body ?? {});

    // Use full enrichment pipeline (text extraction + NER + Wikipedia linking)
    if (body.withEntities !== false) {
      return enrichArticlesWithEntities({
        date: body.date,
        limit: body.limit,
        force: body.force,
      });
    }

    // Legacy: only text extraction
    return enrichArticleText(body);
  });

  // ============================================================
  // Kagi News API Ingestion
  // ============================================================

  app.post("/internal/ingest/kagi", async (request) => {
    const bodySchema = z
      .object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      })
      .default({});

    const body = bodySchema.parse(request.body ?? {});
    const date = body.date ?? new Date().toISOString().slice(0, 10);

    return runKagiNewsIngestion(date);
  });
}
