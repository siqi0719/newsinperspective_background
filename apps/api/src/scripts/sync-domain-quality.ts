import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const DATASET_URL = "https://raw.githubusercontent.com/hauselin/domain-quality-ratings/main/data/domain_pc1.csv";
const OUTPUT_PATH = resolve(process.cwd(), "data", "domain_pc1.csv");

function countDataRows(csv: string): number {
  const lines = csv.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return 0;
  return Math.max(0, lines.length - 1);
}

async function main() {
  console.log(`[domain-quality] downloading ${DATASET_URL}`);
  const response = await fetch(DATASET_URL, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
    },
  });

  if (!response.ok) {
    throw new Error(`Download failed: HTTP ${response.status}`);
  }

  const body = await response.text();
  if (!body.startsWith("domain,pc1")) {
    throw new Error("Unexpected CSV header, expected 'domain,pc1'");
  }

  await mkdir(resolve(process.cwd(), "data"), { recursive: true });
  await writeFile(OUTPUT_PATH, body, "utf8");
  console.log(
    JSON.stringify(
      {
        outputPath: OUTPUT_PATH,
        rowCount: countDataRows(body),
        downloadedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
