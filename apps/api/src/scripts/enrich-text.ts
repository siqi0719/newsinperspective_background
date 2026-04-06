import { prisma } from "../lib/prisma.js";
import { closeArticleExtractionBrowser, enrichArticleText } from "../services/article-text.js";

function parseBooleanFlag(value: string | undefined): boolean {
  return value === "true" || value === "1";
}

async function main() {
  const date = process.argv[2];
  const limitArg = process.argv[3];
  const forceArg = process.argv[4];

  const result = await enrichArticleText({
    date: date && !date.startsWith("--") ? date : undefined,
    limit: limitArg && !limitArg.startsWith("--") ? Number(limitArg) : undefined,
    force: parseBooleanFlag(forceArg),
  });

  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeArticleExtractionBrowser();
    await prisma.$disconnect();
  });
