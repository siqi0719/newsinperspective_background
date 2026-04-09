import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import "../config/env.js";
import { prisma } from "../lib/prisma.js";
import {
  extractBaselineKeywords,
  extractStatisticalKeywords,
} from "../services/keyword-algorithms.js";
import { extractKeywordsWithOpenRouter } from "../services/openrouter-keywords.js";

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function endOfDay(date: string): Date {
  return new Date(`${date}T23:59:59.999Z`);
}

async function resolveDate(candidate: string | undefined): Promise<string> {
  if (candidate) return candidate;
  const row = await prisma.storyCluster.findFirst({
    orderBy: { storyDate: "desc" },
    select: { storyDate: true },
  });
  if (!row) {
    throw new Error("No story clusters found in database");
  }
  return row.storyDate.toISOString().slice(0, 10);
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

async function main() {
  const date = await resolveDate(process.argv[2]);
  const limit = parsePositiveInt(process.argv[3], 20);
  const offset = Math.max(0, parsePositiveInt(process.argv[4], 1) - 1);
  const maxBodyLength = parsePositiveInt(process.argv[5], 6000);

  const rows = await prisma.storyCluster.findMany({
    where: {
      storyDate: { lte: endOfDay(date) },
    },
    include: {
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
            },
          },
        },
      },
    },
    orderBy: [{ storyDate: "desc" }, { sourceCount: "desc" }, { articleCount: "desc" }],
    skip: offset,
    take: limit,
  });

  const results: Array<{
    rank: number;
    clusterId: string;
    storyDate: string;
    title: string;
    articleCount: number;
    sourceCount: number;
    language: string | null;
    baseline: string[];
    statistical: string[];
    openrouter: { keywords: string[]; model: string; error: string | null };
  }> = [];

  for (const [index, row] of rows.entries()) {
    const topArticles = row.articles.slice(0, 6).map((item) => item.article);
    const language = pickLanguage(topArticles.map((article) => article.language));
    const summary = joinText(topArticles.map((article) => article.summary), 3000);
    const body = joinText(
      topArticles.map((article) => article.fullText ?? article.contentSnippet),
      maxBodyLength,
    );

    const baseline = extractBaselineKeywords({
      title: row.title,
      summary,
      body,
      language,
      maxKeywords: 8,
    });

    const statistical = extractStatisticalKeywords({
      title: row.title,
      summary,
      body,
      language,
      maxKeywords: 8,
    });

    const openrouter = await extractKeywordsWithOpenRouter({
      title: row.title,
      summary,
      body,
      language,
      maxKeywords: 8,
    });

    results.push({
      rank: offset + index + 1,
      clusterId: row.id,
      storyDate: row.storyDate.toISOString().slice(0, 10),
      title: row.title,
      articleCount: row.articleCount,
      sourceCount: row.sourceCount,
      language,
      baseline,
      statistical,
      openrouter,
    });
  }

  const output = {
    generatedAt: new Date().toISOString(),
    fromDate: date,
    limit,
    offset,
    results,
  };

  const outputDir = resolve(process.cwd(), "notebooks", "exports", "keyword-comparison");
  await mkdir(outputDir, { recursive: true });
  const outputPath = resolve(outputDir, `${date}-offset-${offset + 1}-limit-${limit}.json`);
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");

  console.log(`Keyword comparison from ${date} backwards (${results.length} clusters):`);
  for (const item of results) {
    console.log(`${item.rank}. [${item.storyDate}] ${item.title}`);
    console.log(`   baseline    : ${item.baseline.join(", ") || "(none)"}`);
    console.log(`   statistical : ${item.statistical.join(", ") || "(none)"}`);
    if (item.openrouter.error) {
      console.log(`   openrouter  : (error) ${item.openrouter.error}`);
    } else {
      console.log(`   openrouter  : ${item.openrouter.keywords.join(", ") || "(none)"}`);
    }
  }
  console.log(`Saved JSON comparison: ${outputPath}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
