import { ExtractionStatus } from "@prisma/client";
import "../config/env.js";
import { prisma } from "../lib/prisma.js";

function parseDateArg(value: string | undefined): string | undefined {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

function buildDateWhere(date: string | undefined) {
  if (!date) return undefined;
  return {
    gte: new Date(`${date}T00:00:00.000Z`),
    lte: new Date(`${date}T23:59:59.999Z`),
  };
}

async function main() {
  const date = parseDateArg(process.argv[2]);
  const ingestionDate = buildDateWhere(date);

  const where = ingestionDate ? { ingestionDate } : {};

  const [total, pending, succeeded, failed, latestFailures] = await Promise.all([
    prisma.article.count({ where }),
    prisma.article.count({ where: { ...where, extractionStatus: ExtractionStatus.PENDING } }),
    prisma.article.count({ where: { ...where, extractionStatus: ExtractionStatus.SUCCESS } }),
    prisma.article.count({ where: { ...where, extractionStatus: ExtractionStatus.FAILED } }),
    prisma.article.findMany({
      where: { ...where, extractionStatus: ExtractionStatus.FAILED },
      orderBy: [{ extractedAt: "desc" }, { updatedAt: "desc" }],
      take: 10,
      select: {
        title: true,
        domain: true,
        originalUrl: true,
        extractionError: true,
        extractedAt: true,
      },
    }),
  ]);

  console.log(
    JSON.stringify(
      {
        date: date ?? null,
        total,
        pending,
        succeeded,
        failed,
        latestFailures,
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
