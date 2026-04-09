import { Prisma, ScopeType } from "@prisma/client";
import "../config/env.js";
import { prisma } from "../lib/prisma.js";
import { buildSoftDedupePlan, resolveDedupeStrategy } from "../services/dedupe.js";

type ClusterFeaturePayload = {
  dedupeStrategy?: unknown;
  dedupeGroupCount?: unknown;
  dedupeMatchedArticleCount?: unknown;
  [key: string]: unknown;
};

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function parseUnitFloat(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : fallback;
}

function parseDateArg(value: string | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date: ${value}. Expected YYYY-MM-DD.`);
  }
  return parsed;
}

function isDedupeMetadataMissing(payload: ClusterFeaturePayload | null | undefined): boolean {
  if (!payload) return true;
  const strategyMissing = typeof payload.dedupeStrategy !== "string";
  const groupCountMissing = typeof payload.dedupeGroupCount !== "number";
  const matchedCountMissing = typeof payload.dedupeMatchedArticleCount !== "number";
  return strategyMissing || groupCountMissing || matchedCountMissing;
}

function normalizeDomains(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
}

async function main() {
  const limit = parsePositiveInt(process.argv[2], 200);
  const dateFilter = parseDateArg(process.argv[3]);
  const mode = (process.argv[4] ?? "missing").trim().toLowerCase();
  const strategy = resolveDedupeStrategy(process.argv[5] ?? process.env.KAGI_DEDUPE_STRATEGY);
  const processAll = mode === "all";

  const clusters = dateFilter
    ? await prisma.storyCluster.findMany({
        where: { storyDate: dateFilter },
        orderBy: [{ storyDate: "desc" }, { createdAt: "desc" }],
        include: {
          features: {
            where: { scopeType: ScopeType.CLUSTER },
            orderBy: { updatedAt: "desc" },
            take: 1,
          },
          articles: {
            orderBy: { rank: "asc" },
            include: {
              article: {
                select: {
                  id: true,
                  title: true,
                  summary: true,
                  contentSnippet: true,
                  fullText: true,
                  language: true,
                  domain: true,
                  duplicateDomains: true,
                },
              },
            },
          },
        },
      })
    : await prisma.storyCluster.findMany({
        orderBy: [{ storyDate: "desc" }, { createdAt: "desc" }],
        include: {
          features: {
            where: { scopeType: ScopeType.CLUSTER },
            orderBy: { updatedAt: "desc" },
            take: 1,
          },
          articles: {
            orderBy: { rank: "asc" },
            include: {
              article: {
                select: {
                  id: true,
                  title: true,
                  summary: true,
                  contentSnippet: true,
                  fullText: true,
                  language: true,
                  domain: true,
                  duplicateDomains: true,
                },
              },
            },
          },
        },
      });

  const targets = clusters
    .filter((cluster) => {
      if (processAll) return true;
      const payload = (cluster.features[0]?.featureSet ?? null) as ClusterFeaturePayload | null;
      return isDedupeMetadataMissing(payload);
    })
    .slice(0, limit);

  console.log(
    `[kagi:backfill-dedupe] clusters=${targets.length}/${clusters.length} strategy=${strategy} mode=${
      processAll ? "all" : "missing"
    }${dateFilter ? ` date=${process.argv[3]}` : ""}`,
  );

  let totalGroups = 0;
  let totalMatchedArticles = 0;
  let changedArticles = 0;

  for (const [index, cluster] of targets.entries()) {
    console.log("");
    console.log(`[kagi:backfill-dedupe] ${index + 1}/${targets.length} ${cluster.title} (${cluster.id})`);

    const plan = buildSoftDedupePlan(
      cluster.articles.map((link) => ({
        id: link.article.id,
        domain: link.article.domain,
        title: link.article.title,
        summary: link.article.summary ?? link.article.contentSnippet,
        body: link.article.fullText ?? link.article.contentSnippet,
        language: link.article.language,
      })),
      {
        strategy,
        mirrorDomainsOnAllMembers: true,
        simHashMinJaccardSimilarity: parseUnitFloat(process.env.KAGI_DEDUPE_SIMHASH_MIN_JACCARD, 0.9),
      },
    );

    const updateById = new Map(plan.updates.map((item) => [item.id, item]));
    for (const link of cluster.articles) {
      const article = link.article;
      const dedupeUpdate = updateById.get(article.id);
      if (!dedupeUpdate) continue;
      const mergedDomains = normalizeDomains([
        ...article.duplicateDomains,
        ...dedupeUpdate.duplicateDomains,
      ]);
      const existingDomains = normalizeDomains(article.duplicateDomains);
      const changed =
        mergedDomains.length !== existingDomains.length ||
        mergedDomains.some((domain, itemIndex) => domain !== existingDomains[itemIndex]);
      if (!changed) continue;
      await prisma.article.update({
        where: { id: article.id },
        data: {
          duplicateDomains: mergedDomains,
          duplicateCount: mergedDomains.length,
        },
      });
      changedArticles += 1;
    }

    const existingFeature = cluster.features[0];
    const existingPayload = (existingFeature?.featureSet ?? {}) as ClusterFeaturePayload;
    const nextPayload: ClusterFeaturePayload = {
      ...existingPayload,
      dedupeStrategy: plan.strategy,
      dedupeGroupCount: plan.groupCount,
      dedupeMatchedArticleCount: plan.matchedArticleCount,
      dedupeUpdatedAt: new Date().toISOString(),
    };

    if (existingFeature) {
      await prisma.nlpFeature.update({
        where: { id: existingFeature.id },
        data: {
          featureSet: toInputJson(nextPayload),
        },
      });
    } else {
      await prisma.nlpFeature.create({
        data: {
          scopeType: ScopeType.CLUSTER,
          clusterId: cluster.id,
          featureSet: toInputJson(nextPayload),
        },
      });
    }

    totalGroups += plan.groupCount;
    totalMatchedArticles += plan.matchedArticleCount;

    console.log(
      `[kagi:backfill-dedupe] groups=${plan.groupCount} matchedArticles=${plan.matchedArticleCount} compared=${plan.comparedCount}`,
    );
  }

  console.log("");
  console.log(
    JSON.stringify(
      {
        strategy,
        mode: processAll ? "all" : "missing",
        dateFilter: process.argv[3] ?? null,
        attemptedClusters: targets.length,
        changedArticles,
        totalGroups,
        totalMatchedArticles,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
