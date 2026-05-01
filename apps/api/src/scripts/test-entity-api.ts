import "../config/env.js";
import { prisma } from "../lib/prisma.js";
import { entityQueryService } from "../services/entity-query.js";

async function main() {
  console.log("\n=== TESTING ENTITY API ENDPOINTS ===\n");

  // Test 1: getArticleEntities
  console.log("📌 Test 1: GET /api/articles/:articleId/entities");
  console.log("-".repeat(60));

  const articleWithEntities = await prisma.article.findFirst({
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

  if (!articleWithEntities) {
    console.log("❌ No articles with entity mentions found!");
  } else {
    console.log(`✓ Found article: "${articleWithEntities.title}"`);
    console.log(`  ID: ${articleWithEntities.id}`);
    console.log(`  Entity mentions: ${articleWithEntities._count.entityMentions}`);

    try {
      const entities = await entityQueryService.getArticleEntities(articleWithEntities.id, {
        limit: 50,
      });

      console.log(`\n✓ Retrieved ${entities.length} entities`);

      entities.slice(0, 3).forEach((entity, i) => {
        console.log(`\n  ${i + 1}. ${entity.entityText} (${entity.entityType})`);
        console.log(`     Confidence: ${(entity.confidence * 100).toFixed(1)}%`);
        console.log(`     Wikipedia URL: ${entity.wikipediaUrl ? "✓ Present" : "❌ MISSING"}`);
        if (entity.wikipediaUrl) {
          console.log(`     URL: ${entity.wikipediaUrl}`);
        }
        console.log(`     Summary: ${entity.summary ? entity.summary.substring(0, 60) + "..." : "❌ MISSING"}`);
      });
    } catch (error) {
      console.error("❌ Error:", error instanceof Error ? error.message : String(error));
    }
  }

  // Test 2: getEntityDetail
  console.log("\n\n📌 Test 2: GET /api/entities/:entityId");
  console.log("-".repeat(60));

  const entity = await prisma.namedEntity.findFirst({
    where: {
      mentions: {
        some: {},
      },
    },
    include: {
      _count: {
        select: { mentions: true },
      },
    },
    orderBy: {
      mentions: {
        _count: "desc",
      },
    },
  });

  if (!entity) {
    console.log("❌ No entities with mentions found!");
  } else {
    console.log(`✓ Found entity: "${entity.name}"`);
    console.log(`  ID: ${entity.id}`);
    console.log(`  Type: ${entity.type}`);
    console.log(`  Mentions: ${entity._count.mentions}`);

    try {
      const detail = await entityQueryService.getEntityDetail(entity.id);

      console.log(`\n✓ Retrieved entity details`);
      console.log(`  Total mentions: ${detail.statistics.totalMentions}`);
      console.log(`  Unique articles: ${detail.statistics.articlesCount}`);
      console.log(`  Mentions (7 days): ${detail.statistics.mentions7Days}`);
      console.log(`  Mentions (30 days): ${detail.statistics.mentions30Days}`);
      console.log(`  Wikipedia URL: ${detail.wikipediaUrl ? "✓ Present" : "❌ MISSING"}`);
      console.log(`  Top domains: ${detail.statistics.topDomains.length}`);
      detail.statistics.topDomains.slice(0, 3).forEach((domain) => {
        console.log(`    - ${domain.domain}: ${domain.mentions}`);
      });
    } catch (error) {
      console.error("❌ Error:", error instanceof Error ? error.message : String(error));
    }
  }

  // Test 3: searchEntities
  console.log("\n\n📌 Test 3: GET /api/entities/search");
  console.log("-".repeat(60));

  const searchTerm = entity?.name?.split(" ")[0] || "the";
  console.log(`Searching for: "${searchTerm}"`);

  try {
    const results = await entityQueryService.searchEntities(searchTerm, {
      limit: 5,
    });

    console.log(`\n✓ Found ${results.totalResults} results (showing ${results.results.length})`);
    results.results.forEach((result, i) => {
      console.log(`\n  ${i + 1}. ${result.name} (${result.type})`);
      console.log(`     Mentions: ${result.mentionsCount}`);
      console.log(`     Articles: ${result.articlesCount}`);
      console.log(`     Relevance: ${(result.relevanceScore * 100).toFixed(1)}%`);
      console.log(`     Wikipedia: ${result.wikipediaUrl ? "✓" : "❌"}`);
    });
  } catch (error) {
    console.error("❌ Error:", error instanceof Error ? error.message : String(error));
  }

  // Summary
  console.log("\n\n📊 SUMMARY");
  console.log("-".repeat(60));

  const totalEntities = await prisma.namedEntity.count();
  const totalMentions = await prisma.entityMention.count();
  const entitiesWithWiki = await prisma.namedEntity.count({
    where: { wikipediaUrl: { not: null } },
  });

  console.log(`Total entities in DB: ${totalEntities}`);
  console.log(`Total mentions in DB: ${totalMentions}`);
  console.log(`Entities with Wikipedia links: ${entitiesWithWiki}`);
  console.log(`Coverage: ${entitiesWithWiki > 0 ? `${((entitiesWithWiki / totalEntities) * 100).toFixed(1)}%` : "0%"}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
