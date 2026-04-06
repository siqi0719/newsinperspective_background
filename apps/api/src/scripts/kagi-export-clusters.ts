import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { closeArticleExtractionBrowser, extractArticleTextFromUrl } from "../services/article-text.js";
import { closeKagiBrowser, listTopClustersBySourceCount } from "../services/kagi-news.js";

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function main() {
  const exportCount = parsePositiveInt(process.argv[2], 20);
  const offset = parsePositiveInt(process.argv[3], 0) - 1;
  const normalizedOffset = Math.max(0, offset);
  const topLimit = Math.max(
    exportCount + normalizedOffset,
    parsePositiveInt(process.argv[4], exportCount + normalizedOffset),
  );
  const clusters = await listTopClustersBySourceCount(topLimit);
  const selected = clusters.slice(normalizedOffset, normalizedOffset + exportCount);

  if (selected.length === 0) {
    throw new Error("No clusters returned from Kagi API");
  }

  const baseDir = resolve(process.cwd(), "notebooks", "exports", "kagi-top", new Date().toISOString().slice(0, 10));
  await mkdir(baseDir, { recursive: true });

  const results = [];

  for (const [index, chosen] of selected.entries()) {
    const exportDir = resolve(
      baseDir,
      `${normalizedOffset + index + 1}-${slugify(chosen.story.title)}`,
    );
    await mkdir(exportDir, { recursive: true });

    const sources = await Promise.all(
      chosen.story.articles.map(async (article) => {
        try {
          const extracted = await extractArticleTextFromUrl(article.link);
          return {
            ...article,
            originalUrl: extracted.originalUrl,
            finalUrl: extracted.finalUrl,
            extractionStatus: "SUCCESS",
            extractionError: null,
            fullText: extracted.text,
            fullTextLength: extracted.text.length,
            extractionFormat: extracted.format,
          };
        } catch (error) {
          return {
            ...article,
            originalUrl: article.link,
            finalUrl: article.link,
            extractionStatus: "FAILED",
            extractionError: error instanceof Error ? error.message : String(error),
            fullText: null,
            fullTextLength: 0,
            extractionFormat: null,
          };
        }
      }),
    );

    const payload = {
      generatedAt: new Date().toISOString(),
      topLimit,
      rank: normalizedOffset + index + 1,
      chosenCluster: {
        batchId: chosen.batchId,
        categoryId: chosen.categoryId,
        categoryName: chosen.categoryName,
        storyId: chosen.story.id,
        clusterNumber: chosen.story.cluster_number,
        title: chosen.story.title,
        shortSummary: chosen.story.short_summary,
        sourceCount: chosen.story.unique_domains ?? chosen.story.articles.length,
        articleCount: chosen.story.articles.length,
      },
      sources,
    };

    await writeFile(resolve(exportDir, "cluster.json"), JSON.stringify(payload, null, 2), "utf8");
    await writeFile(
      resolve(exportDir, "sources.jsonl"),
      `${sources.map((item) => JSON.stringify(item)).join("\n")}\n`,
      "utf8",
    );

    results.push({
      exportDir,
      rank: index + 1,
      storyId: chosen.story.id,
      title: chosen.story.title,
      articleCount: sources.length,
      successfulExtractions: sources.filter((item) => item.extractionStatus === "SUCCESS").length,
      failedExtractions: sources.filter((item) => item.extractionStatus === "FAILED").length,
    });
  }

  console.log(
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        exportCount: selected.length,
        offset: normalizedOffset,
        topLimit,
        baseDir,
        results,
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
    await closeKagiBrowser();
    await closeArticleExtractionBrowser();
  });
