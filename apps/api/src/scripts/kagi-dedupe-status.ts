import { ScopeType } from "@prisma/client";
import "../config/env.js";
import { prisma } from "../lib/prisma.js";

type ClusterFeaturePayload = {
  dedupeStrategy?: unknown;
  dedupeGroupCount?: unknown;
  dedupeMatchedArticleCount?: unknown;
  [key: string]: unknown;
};

function parseDateArg(value: string | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date: ${value}. Expected YYYY-MM-DD.`);
  }
  return parsed;
}

function hasDedupeMetadata(payload: ClusterFeaturePayload | null | undefined): boolean {
  if (!payload) return false;
  return (
    typeof payload.dedupeStrategy === "string" &&
    typeof payload.dedupeGroupCount === "number" &&
    typeof payload.dedupeMatchedArticleCount === "number"
  );
}

async function main() {
  const dateArg = process.argv[2];
  const dateFilter = parseDateArg(dateArg);

  const clusters = dateFilter
    ? await prisma.storyCluster.findMany({
        where: { storyDate: dateFilter },
        include: {
          features: {
            where: { scopeType: ScopeType.CLUSTER },
            orderBy: { updatedAt: "desc" },
            take: 1,
          },
        },
      })
    : await prisma.storyCluster.findMany({
        include: {
          features: {
            where: { scopeType: ScopeType.CLUSTER },
            orderBy: { updatedAt: "desc" },
            take: 1,
          },
        },
      });

  const withMetadata = clusters.filter((cluster) =>
    hasDedupeMetadata((cluster.features[0]?.featureSet ?? null) as ClusterFeaturePayload | null),
  );
  const missingMetadata = clusters.length - withMetadata.length;
  const dedupeGroupCountTotal = withMetadata.reduce((sum, cluster) => {
    const payload = cluster.features[0]?.featureSet as ClusterFeaturePayload;
    return sum + (typeof payload?.dedupeGroupCount === "number" ? payload.dedupeGroupCount : 0);
  }, 0);
  const dedupeMatchedArticlesTotal = withMetadata.reduce((sum, cluster) => {
    const payload = cluster.features[0]?.featureSet as ClusterFeaturePayload;
    return sum + (typeof payload?.dedupeMatchedArticleCount === "number" ? payload.dedupeMatchedArticleCount : 0);
  }, 0);

  const duplicateArticleCount = await prisma.article.count({
    where: { duplicateCount: { gt: 0 } },
  });
  const sampleDuplicates = await prisma.article.findMany({
    where: { duplicateCount: { gt: 0 } },
    select: {
      id: true,
      title: true,
      domain: true,
      duplicateCount: true,
      duplicateDomains: true,
      canonicalUrl: true,
    },
    orderBy: { updatedAt: "desc" },
    take: 10,
  });

  const unresolvedGoogleCount = await prisma.article.count({
    where: {
      canonicalUrl: {
        contains: "google.com",
      },
    },
  });
  const unresolvedGoogleSamples = await prisma.article.findMany({
    where: {
      canonicalUrl: {
        contains: "google.com",
      },
    },
    select: {
      id: true,
      title: true,
      canonicalUrl: true,
      originalUrl: true,
      domain: true,
      extractionStatus: true,
    },
    orderBy: { updatedAt: "desc" },
    take: 10,
  });

  console.log(
    JSON.stringify(
      {
        dateFilter: dateArg ?? null,
        dedupe: {
          clusterCount: clusters.length,
          clustersWithMetadata: withMetadata.length,
          clustersMissingMetadata: missingMetadata,
          totalGroupCount: dedupeGroupCountTotal,
          totalMatchedArticles: dedupeMatchedArticlesTotal,
          duplicateArticleCount,
          sampleDuplicates,
        },
        urlResolution: {
          unresolvedGoogleCount,
          unresolvedGoogleSamples,
        },
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
