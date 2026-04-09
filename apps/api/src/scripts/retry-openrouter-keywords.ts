import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import "../config/env.js";
import { prisma } from "../lib/prisma.js";
import { extractKeywordsWithOpenRouter } from "../services/openrouter-keywords.js";

interface ComparisonRow {
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
}

interface ComparisonFile {
  generatedAt: string;
  fromDate: string;
  limit: number;
  offset: number;
  results: ComparisonRow[];
  retriedAt?: string;
  retryStats?: {
    attempted: number;
    updated: number;
    stillMissing: number;
  };
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

function needsRetry(row: ComparisonRow): boolean {
  return row.openrouter.error !== null || row.openrouter.keywords.length === 0;
}

async function resolveInputPath(candidate: string | undefined): Promise<string> {
  if (candidate) {
    return resolve(process.cwd(), candidate);
  }

  const exportDir = resolve(process.cwd(), "notebooks", "exports", "keyword-comparison");
  const entries = await readdir(exportDir);
  const jsonEntries = entries.filter((entry) => entry.endsWith(".json"));
  if (jsonEntries.length === 0) {
    throw new Error(`No keyword comparison exports found in ${exportDir}`);
  }

  let newestPath: string | null = null;
  let newestMtime = -1;
  for (const entry of jsonEntries) {
    const fullPath = resolve(exportDir, entry);
    const meta = await stat(fullPath);
    if (meta.mtimeMs > newestMtime) {
      newestMtime = meta.mtimeMs;
      newestPath = fullPath;
    }
  }

  if (!newestPath) {
    throw new Error(`Unable to resolve latest keyword comparison export in ${exportDir}`);
  }

  return newestPath;
}

async function main() {
  const inputArg = process.argv[2];
  const inputPath = await resolveInputPath(inputArg);
  const maxBodyLength = 6000;

  const raw = await readFile(inputPath, "utf8");
  const parsed = JSON.parse(raw) as ComparisonFile;
  const rowsToRetry = parsed.results.filter(needsRetry);

  if (!inputArg) {
    console.log(`No file argument provided, using latest export automatically.`);
  }
  console.log(`Retrying OpenRouter keywords for ${rowsToRetry.length}/${parsed.results.length} clusters`);
  console.log(`Input file: ${inputPath}`);

  let updated = 0;

  for (const row of rowsToRetry) {
    const cluster = await prisma.storyCluster.findUnique({
      where: { id: row.clusterId },
      include: {
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
    });

    if (!cluster) {
      row.openrouter = {
        keywords: [],
        model: row.openrouter.model,
        error: `Cluster not found in DB: ${row.clusterId}`,
      };
      continue;
    }

    const topArticles = cluster.articles.slice(0, 6).map((item) => item.article);
    const language = pickLanguage(topArticles.map((article) => article.language));
    const summary = joinText(topArticles.map((article) => article.summary), 3000);
    const body = joinText(
      topArticles.map((article) => article.fullText ?? article.contentSnippet),
      maxBodyLength,
    );
    console.log("");
    console.log(`[${row.rank}] ${cluster.title}`);

    const openrouter = await extractKeywordsWithOpenRouter({
      title: cluster.title,
      summary,
      body,
      language,
      maxKeywords: 8,
      onAttemptLog: (message) => {
        console.log(`   ${message}`);
      },
    });

    row.openrouter = openrouter;
    if (!openrouter.error && openrouter.keywords.length > 0) {
      updated += 1;
    }

    if (openrouter.error) {
      console.log(`${row.rank}. ${cluster.title} -> error`);
    } else {
      console.log(`${row.rank}. ${cluster.title} -> ${openrouter.keywords.join(", ")}`);
    }
  }

  const stillMissing = parsed.results.filter(needsRetry).length;
  parsed.retriedAt = new Date().toISOString();
  parsed.retryStats = {
    attempted: rowsToRetry.length,
    updated,
    stillMissing,
  };

  await writeFile(inputPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");

  console.log("");
  console.log(`Updated: ${updated}`);
  console.log(`Still missing: ${stillMissing}`);
  console.log(`Saved: ${inputPath}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
