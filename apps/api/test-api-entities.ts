import "./src/config/env.js";
import { prisma } from "./src/lib/prisma.js";
import { entityQueryService } from "./src/services/entity-query.js";

async function main() {
  console.log("\n=== TESTING ENTITIES API FLOW ===\n");

  // Step 1: Get an article with entities
  console.log("Step 1: Finding an article with entities...");
  const article = await prisma.article.findFirst({
    where: {
      entityMentions: {
        some: {},
      },
    },
    include: {
      _count: {
        select: { entityMentions: true },
      },
    },
  });

  if (!article) {
    console.log("❌ No article with entities found in database");
    process.exit(1);
  }

  console.log(`✓ Found article: ${article.id}`);
  console.log(`  Title: ${article.title}`);
  console.log(`  Entity mentions: ${article._count.entityMentions}`);

  // Step 2: Fetch entities via the query service
  console.log("\nStep 2: Fetching entities via entity-query service...");

  const entities = await entityQueryService.getArticleEntities(article.id, {
    limit: 50,
  });

  console.log(`✓ Found ${entities.length} entities via service`);

  if (entities.length === 0) {
    console.log("⚠️  No entities returned");
  } else {
    // Show first few entities
    console.log("\nFirst 3 entities:");
    entities.slice(0, 3).forEach((entity: any, index: number) => {
      console.log(`\n  ${index + 1}. ${entity.entityText} (${entity.entityType})`);
      console.log(`     Confidence: ${(entity.confidence * 100).toFixed(0)}%`);
      console.log(`     Wikipedia: ${entity.wikipediaUrl ? "✓" : "❌"}`);
      if (entity.wikipediaUrl) {
        console.log(`     URL: ${entity.wikipediaUrl}`);
      }
      if (entity.summary) {
        console.log(`     Summary: ${entity.summary.substring(0, 60)}...`);
      }
    });

    // Step 3: Verify Wikipedia data coverage
    console.log("\n\nStep 3: Checking Wikipedia data coverage...");
    const withWiki = entities.filter((e: any) => e.wikipediaUrl).length;
    const coverage = ((withWiki / entities.length) * 100).toFixed(1);
    console.log(`  Total entities: ${entities.length}`);
    console.log(`  With Wikipedia: ${withWiki}`);
    console.log(`  Coverage: ${coverage}%`);

    if (withWiki === 0) {
      console.log("\n⚠️  WARNING: No Wikipedia links found in entities!");
      console.log("This could be the issue preventing entity clicks from working.");
    }
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
