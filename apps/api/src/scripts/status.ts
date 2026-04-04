import "../config/env.js";
import { prisma } from "../lib/prisma.js";
import { extractRegion } from "../domain/category.js";

async function main() {
  const latestRun = await prisma.ingestionRun.findFirst({
    orderBy: { startedAt: "desc" },
  });

  const articleCount = await prisma.article.count();
  const clusterCount = await prisma.storyCluster.count();
  const duplicateArticleCount = await prisma.article.count({
    where: {
      duplicateCount: { gt: 0 },
    },
  });

  const categories = latestRun
    ? await prisma.storyCluster.findMany({
        where: {
          storyDate: latestRun.ingestionDate,
        },
        select: { topCategory: true },
        distinct: ["topCategory"],
        orderBy: { topCategory: "asc" },
      })
    : await prisma.storyCluster.findMany({
        select: { topCategory: true },
        distinct: ["topCategory"],
        orderBy: { topCategory: "asc" },
      });

  const sampleDuplicate = await prisma.article.findFirst({
    where: {
      duplicateCount: { gt: 0 },
    },
    select: {
      title: true,
      domain: true,
      duplicateDomains: true,
      duplicateCount: true,
      category: true,
    },
  });

  const regions = categories
    .map((item) => extractRegion(item.topCategory))
    .filter((value): value is string => Boolean(value))
    .filter((value, index, arr) => arr.indexOf(value) === index);

  console.log(
    JSON.stringify(
      {
        latestRun,
        articleCount,
        clusterCount,
        duplicateArticleCount,
        regions,
        categories: categories
          .map((item) => item.topCategory)
          .filter((value): value is string => Boolean(value)),
        sampleDuplicate,
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
