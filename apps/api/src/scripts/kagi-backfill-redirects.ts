import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { closeArticleExtractionBrowser, resolveUrlWithBrowser } from "../services/article-text.js";

interface ClusterPayload {
  sources: Array<Record<string, unknown>>;
}

async function findClusterFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = resolve(root, entry.name);
      if (entry.isDirectory()) return findClusterFiles(fullPath);
      return entry.isFile() && entry.name === "cluster.json" ? [fullPath] : [];
    }),
  );
  return nested.flat();
}

function parseCsvArg(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(",").map((item) => item.trim()).filter(Boolean);
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

  let updatedSources = 0;

  for (const file of clusterFiles) {
    const payload = JSON.parse(await readFile(file, "utf8")) as ClusterPayload;
    let changed = false;

    for (const source of payload.sources) {
      const domain = String(source.domain ?? "");
      if (domainFilter.length > 0 && !domainFilter.includes(domain)) continue;

      const originalUrl = String(source.originalUrl ?? source.link ?? "");
      if (!originalUrl) continue;

      const existingFinalUrl =
        typeof source.finalUrl === "string"
          ? String(source.finalUrl)
          : typeof source.redirectUrl === "string"
            ? String(source.redirectUrl)
            : typeof source.originalUrl === "string"
              ? String(source.originalUrl)
              : null;

      if (existingFinalUrl) {
        source.originalUrl = originalUrl;
        source.finalUrl = existingFinalUrl;
        if (Object.hasOwn(source, "redirectUrl")) {
          delete source.redirectUrl;
        }
        changed = true;
        updatedSources += 1;
        continue;
      }

      try {
        const resolved = await resolveUrlWithBrowser(originalUrl);
        source.originalUrl = originalUrl;
        source.finalUrl = resolved;
        if (Object.hasOwn(source, "redirectUrl")) {
          delete source.redirectUrl;
        }
        changed = true;
        updatedSources += 1;
      } catch {
        source.originalUrl = originalUrl;
        source.finalUrl = originalUrl;
        if (Object.hasOwn(source, "redirectUrl")) {
          delete source.redirectUrl;
        }
        changed = true;
        updatedSources += 1;
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
        updatedSources,
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
