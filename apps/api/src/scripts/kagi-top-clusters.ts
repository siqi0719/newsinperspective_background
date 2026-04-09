import { closeKagiBrowser, listTopClustersBySourceCount } from "../services/kagi-news.js";

function parseLimitArg(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 10;
}

async function main() {
  const limit = parseLimitArg(process.argv[2]);
  const clusters = await listTopClustersBySourceCount(limit);

  console.log(
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        limit,
        clusters: clusters.map((item, index) => ({
          rank: index + 1,
          batchId: item.batchId,
          categoryId: item.categoryId,
          categoryUuid: item.categoryUuid,
          categoryName: item.categoryName,
          storyId: item.story.id,
          clusterNumber: item.story.cluster_number,
          title: item.story.title,
          shortSummary: item.story.short_summary,
          sourceCount: item.story.unique_domains ?? item.story.articles.length,
          articleCount: item.story.articles.length,
          domains: [...new Set(item.story.articles.map((article) => article.domain))],
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
    await closeKagiBrowser();
  });
