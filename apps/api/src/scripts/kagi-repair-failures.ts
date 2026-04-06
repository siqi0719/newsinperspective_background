import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { closeArticleExtractionBrowser, extractArticleTextFromUrl } from "../services/article-text.js";

interface ClusterPayload {
  generatedAt?: string;
  chosenCluster: {
    title: string;
  };
  sources: Array<Record<string, unknown>>;
}

async function findClusterFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = resolve(root, entry.name);
      if (entry.isDirectory()) {
        return findClusterFiles(fullPath);
      }
      return entry.isFile() && entry.name === "cluster.json" ? [fullPath] : [];
    }),
  );
  return nested.flat();
}

function parseCsvArg(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function shouldRetry(source: Record<string, unknown>, domains: string[]): boolean {
  if (source.extractionStatus !== "FAILED") return false;
  if (domains.length === 0) return true;
  return domains.includes(String(source.domain ?? ""));
}

async function main() {
  const domainFilter = parseCsvArg(process.argv[2]);
  const roots = [
    resolve(fileURLToPath(new URL("../../../../notebooks/exports", import.meta.url))),
    resolve(fileURLToPath(new URL("../../notebooks/exports", import.meta.url))),
  ];
  const clusterFiles = (
    await Promise.all(
      roots.map(async (root) => {
        try {
          return await findClusterFiles(root);
        } catch {
          return [];
        }
      }),
    )
  ).flat();

  let retried = 0;
  let recovered = 0;

  for (const file of clusterFiles) {
    const payload = JSON.parse(await readFile(file, "utf8")) as ClusterPayload;
    let changed = false;

    for (const source of payload.sources) {
      if (!shouldRetry(source, domainFilter)) continue;

      retried += 1;

      try {
        const extracted = await extractArticleTextFromUrl(String(source.link));
        source.extractionStatus = "SUCCESS";
        source.extractionError = null;
        source.fullText = extracted.text;
        source.fullTextLength = extracted.text.length;
        source.extractionFormat = extracted.format;
        recovered += 1;
        changed = true;
      } catch (error) {
        source.extractionError = error instanceof Error ? error.message : String(error);
        changed = true;
      }
    }

    if (changed) {
      await writeFile(file, JSON.stringify(payload, null, 2), "utf8");
    }
  }

  console.log(
    JSON.stringify(
      {
        clusterFileCount: clusterFiles.length,
        retried,
        recovered,
        domainFilter,
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
    await closeArticleExtractionBrowser();
  });
