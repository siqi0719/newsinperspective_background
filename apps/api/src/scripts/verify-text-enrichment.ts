import { prisma } from "../lib/prisma.js";
import { closeArticleExtractionBrowser, enrichArticleText } from "../services/article-text.js";

function parseDateArg(value: string | undefined): string | undefined {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

function parseLimitArg(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 3;
}

async function main() {
  const date = parseDateArg(process.argv[2]);
  const limit = parseLimitArg(process.argv[3]);

  const candidates = await prisma.article.findMany({
    where: {
      ...(date
        ? {
            ingestionDate: {
              gte: new Date(`${date}T00:00:00.000Z`),
              lte: new Date(`${date}T23:59:59.999Z`),
            },
          }
        : {}),
      originalUrl: {
        startsWith: "http",
      },
    },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      domain: true,
    },
    take: 200,
  });

  const seenDomains = new Set<string>();
  const articleIds = candidates
    .filter((item) => {
      if (seenDomains.has(item.domain)) return false;
      seenDomains.add(item.domain);
      return true;
    })
    .slice(0, limit)
    .map((item) => item.id);

  const result = await enrichArticleText({
    articleIds,
    force: true,
  });

  const latest = await prisma.article.findMany({
    where: {
      id: { in: articleIds },
    },
    orderBy: [{ extractedAt: "desc" }, { updatedAt: "desc" }],
    select: {
      title: true,
      domain: true,
      originalUrl: true,
      extractionStatus: true,
      extractionError: true,
      fullText: true,
      extractedAt: true,
    },
  });

  console.log(
    JSON.stringify(
      {
        request: {
          date: date ?? null,
          limit,
          articleIds,
        },
        result,
        samples: latest.map((item) => ({
          ...item,
          fullTextLength: item.fullText?.length ?? 0,
        })),
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
    await prisma.$disconnect();
  });
