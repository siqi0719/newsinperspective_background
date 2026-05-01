import "../config/env.js";
import { prisma } from "../lib/prisma.js";
import { enrichArticlesWithEntities } from "../services/article-enrichment.js";
import { createFileLogger } from "../lib/file-logger.js";

const logger = createFileLogger("re-enrich.log");

async function main() {
  const date = process.argv[2] || "2026-04-27";
  const limit = process.argv[3] ? Number(process.argv[3]) : 100;

  console.log(`\n=== RE-ENRICHING ARTICLES WITH WIKIPEDIA LINKS ===`);
  console.log(`Date: ${date}`);
  console.log(`Limit: ${limit}`);
  console.log(`Force: true (will re-process articles with existing entities)`);
  console.log("-".repeat(60));

  try {
    const result = await enrichArticlesWithEntities({
      date,
      limit,
      force: true,  // Re-process all articles, even those already enriched
      withEntities: true,
    });

    console.log("\n✓ Enrichment completed!");
    console.log(`  Matched articles: ${result.matched}`);
    console.log(`  Attempted: ${result.attempted}`);
    console.log(`  Succeeded: ${result.succeeded}`);
    console.log(`  Failed: ${result.failed}`);
    console.log(`  Entities extracted: ${result.entitiesExtracted}`);

    if (result.succeeded > 0) {
      console.log("\n📊 Checking entities for Wikipedia links...");
      const entitiesWithWiki = await prisma.namedEntity.count({
        where: { wikipediaUrl: { not: null } },
      });
      const totalEntities = await prisma.namedEntity.count();

      console.log(`  Total entities: ${totalEntities}`);
      console.log(`  With Wikipedia links: ${entitiesWithWiki}`);
      console.log(`  Coverage: ${entitiesWithWiki > 0 ? ((entitiesWithWiki / totalEntities) * 100).toFixed(1) + "%" : "0%"}`);

      // Show sample entities with Wikipedia links
      const sample = await prisma.namedEntity.findMany({
        where: { wikipediaUrl: { not: null } },
        include: { _count: { select: { mentions: true } } },
        take: 5,
      });

      if (sample.length > 0) {
        console.log("\n🎉 Sample entities with Wikipedia links:");
        sample.forEach((entity) => {
          console.log(`  • ${entity.name} (${entity.type})`);
          console.log(`    Wikipedia: ${entity.wikipediaUrl}`);
          console.log(`    Mentions: ${entity._count.mentions}`);
        });
      }
    }
  } catch (error) {
    logger.error("Re-enrichment failed", error);
    console.error("❌ Error:", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
