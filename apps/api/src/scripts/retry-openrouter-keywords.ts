import { Prisma, ScopeType } from "@prisma/client";
import "../config/env.js";
import { prisma } from "../lib/prisma.js";
import { extractKeywordsWithOpenRouter } from "../services/openrouter-keywords.js";

type ClusterFeaturePayload = {
  keywords?: unknown;
  keywordSource?: unknown;
  keywordStatus?: unknown;
  keywordModel?: unknown;
  keywordError?: unknown;
  [key: string]: unknown;
};

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function parseDateArg(value: string | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date: ${value}. Expected YYYY-MM-DD.`);
  }
  return parsed;
}

function joinText(parts: Array<string | null | undefined>, maxLength: number): string {
  const text = parts.filter((value): value is string => Boolean(value)).join("\n\n");
  return text.slice(0, maxLength);
}

function pickLanguage(values: Array<string | null | undefined>): string | null {
  const histogram = new Map<string, number>();
  for (const value of values) {
    if (!value) continue;
    histogram.set(value, (histogram.get(value) ?? 0) + 1);
  }
  const sorted = [...histogram.entries()].sort((left, right) => right[1] - left[1]);
  return sorted[0]?.[0] ?? null;
}

function readKeywords(payload: ClusterFeaturePayload): string[] {
  if (!Array.isArray(payload.keywords)) return [];
  return payload.keywords.filter((value): value is string => typeof value === "string").map((value) => value.trim()).filter(Boolean);
}

function isPending(payload: ClusterFeaturePayload): boolean {
  const keywordStatus = payload.keywordStatus;
  if (keywordStatus === "keywords_pending") return true;
  const keywordSource = payload.keywordSource;
  const keywords = readKeywords(payload);
  return keywordSource === "openrouter" && keywords.length === 0;
}

async function main() {
  const limit = parsePositiveInt(process.argv[2], 50);
  const dateFilter = parseDateArg(process.argv[3]);

  const features = await prisma.nlpFeature.findMany({
    where: {
      scopeType: ScopeType.CLUSTER,
      ...(dateFilter
        ? {
            cluster: {
              storyDate: dateFilter,
            },
          }
        : {}),
    },
    orderBy: { updatedAt: "asc" },
    include: {
      cluster: {
        select: {
          id: true,
          title: true,
          storyDate: true,
          articles: {
            orderBy: { rank: "asc" },
            include: {
              article: {
                select: {
                  title: true,
                  summary: true,
                  contentSnippet: true,
                  fullText: true,
                  language: true,
                },
              },
            },
          },
        },
      },
    },
  });

  const pending = features
    .filter((item) => item.cluster !== null)
    .filter((item) => isPending(item.featureSet as ClusterFeaturePayload))
    .slice(0, limit);

  console.log(
    `[retry:openrouter-keywords] pending=${pending.length} limit=${limit}${dateFilter ? ` date=${process.argv[3]}` : ""}`,
  );

  let updatedReady = 0;
  let stillPending = 0;

  for (const [index, item] of pending.entries()) {
    const cluster = item.cluster!;
    const payload = item.featureSet as ClusterFeaturePayload;
    const topArticles = cluster.articles.slice(0, 6).map((link) => link.article);
    const language = pickLanguage(topArticles.map((article) => article.language));
    const summary = joinText(topArticles.map((article) => article.summary), 3000);
    const body = joinText(topArticles.map((article) => article.fullText ?? article.contentSnippet), 6000);

    console.log("");
    console.log(
      `[retry:openrouter-keywords] ${index + 1}/${pending.length} cluster=${cluster.id} title=${cluster.title}`,
    );

    const openrouter = await extractKeywordsWithOpenRouter({
      title: cluster.title,
      summary,
      body,
      language,
      maxKeywords: 8,
      onAttemptLog: (message) => {
        console.log(`  ${message}`);
      },
    });

    const nextPayload: ClusterFeaturePayload = {
      ...payload,
      keywordSource: "openrouter",
      keywordModel: openrouter.model,
      keywordRetriedAt: new Date().toISOString(),
    };

    if (!openrouter.error && openrouter.keywords.length > 0) {
      nextPayload.keywords = openrouter.keywords;
      nextPayload.keywordStatus = "ready";
      nextPayload.keywordError = null;
      updatedReady += 1;
      console.log(`  success -> ${openrouter.keywords.join(", ")}`);
    } else {
      nextPayload.keywords = [];
      nextPayload.keywordStatus = "keywords_pending";
      nextPayload.keywordError = openrouter.error;
      stillPending += 1;
      console.log(`  pending -> ${openrouter.error ?? "unknown OpenRouter failure"}`);
    }

    await prisma.nlpFeature.update({
      where: { id: item.id },
      data: {
        featureSet: toInputJson(nextPayload),
      },
    });
  }

  console.log("");
  console.log(
    JSON.stringify(
      {
        attempted: pending.length,
        updatedReady,
        stillPending,
        dateFilter: process.argv[3] ?? null,
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
