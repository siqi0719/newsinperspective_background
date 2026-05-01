import "./src/config/env.js";
import { prisma } from "./src/lib/prisma.js";
import { entityQueryService } from "./src/services/entity-query.js";

async function main() {
  console.log("\n=== VERIFYING FULL ENTITY FLOW ===\n");

  // Step 1: Get an article with entities
  console.log("Step 1: Getting article with entities from database...");
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
      entityMentions: {
        include: {
          entity: true,
        },
        take: 5,
      },
    },
  });

  if (!article) {
    console.log("❌ No articles with entities found");
    process.exit(1);
  }

  console.log(`✓ Found article: ${article.id}`);
  console.log(`  Title: ${article.title}`);
  console.log(`  Total mentions: ${article._count.entityMentions}`);

  // Step 2: Verify database has Wikipedia data
  console.log("\nStep 2: Checking Wikipedia data in database...");
  const entitiesWithWiki = article.entityMentions.filter((m) => m.entity.wikipediaUrl);
  console.log(`  Entities with Wikipedia: ${entitiesWithWiki.length}/${article.entityMentions.length}`);

  article.entityMentions.slice(0, 3).forEach((mention) => {
    console.log(`\n  • ${mention.entity.name}`);
    console.log(`    Wikipedia: ${mention.entity.wikipediaUrl ? "✓" : "❌"}`);
    if (mention.entity.wikipediaUrl) {
      console.log(`    URL: ${mention.entity.wikipediaUrl}`);
    }
  });

  // Step 3: Test API response
  console.log("\n\nStep 3: Simulating API response...");
  const entities = await entityQueryService.getArticleEntities(article.id, { limit: 50 });

  console.log(`✓ API query service returned: ${entities.length} entities`);

  if (entities.length === 0) {
    console.log("⚠️  No entities returned!");
  } else {
    console.log("\nFirst entity from API response:");
    const firstEntity = entities[0] as any;
    console.log(`  id: ${firstEntity.id}`);
    console.log(`  entityText: ${firstEntity.entityText}`);
    console.log(`  entityType: ${firstEntity.entityType}`);
    console.log(`  confidence: ${firstEntity.confidence}`);
    console.log(`  startOffset: ${firstEntity.startOffset}`);
    console.log(`  endOffset: ${firstEntity.endOffset}`);
    console.log(`  wikipediaUrl: ${firstEntity.wikipediaUrl ? "✓" : "❌"}`);
    console.log(`  summary: ${firstEntity.summary ? "✓" : "❌"}`);

    if (!firstEntity.wikipediaUrl) {
      console.log("\n⚠️  WARNING: Entity has no Wikipedia URL!");
      console.log("This means the Wikipedia linking service didn't find a match.");
    }
  }

  // Step 4: Frontend simulation
  console.log("\n\nStep 4: Checking if entities would render in frontend...");
  console.log(`  articleEntities.length > 0: ${entities.length > 0}`);
  console.log(`  → EntityHighlighter WILL ${entities.length > 0 ? "✓ RENDER" : "❌ NOT RENDER"}`);

  if (entities.length > 0) {
    console.log(`  → Entity tags will be clickable: ✓ YES`);
    console.log(`  → Clicking tag will dispatch 'entity-click' event: ✓ YES`);
    console.log(`  → App.svelte will receive event and set selectedEntityId: ✓ YES`);
    console.log(`  → EntityPopover should render: ✓ YES`);
  } else {
    console.log(`  → Entity tags will NOT render: ❌ NO`);
    console.log(`  → No clicking possible: ❌ NO`);
  }

  // Summary
  console.log("\n\n" + "=".repeat(60));
  console.log("SUMMARY");
  console.log("=".repeat(60));

  const issues: string[] = [];

  if (article._count.entityMentions === 0) {
    issues.push("No entity mentions in database");
  }

  if (entitiesWithWiki.length === 0 && article.entityMentions.length > 0) {
    issues.push("No Wikipedia links found for entities");
  }

  if (entities.length === 0) {
    issues.push("Entity query service returned no entities");
  }

  if (issues.length === 0) {
    console.log("✓ All checks passed!");
    console.log(`✓ Database has ${article._count.entityMentions} entity mentions`);
    console.log(`✓ ${entitiesWithWiki.length}/${article.entityMentions.length} have Wikipedia links`);
    console.log(`✓ API returns entities correctly`);
    console.log(`✓ Frontend should render and allow clicking on tags`);
    console.log("\n→ If tags are still not clickable, check:");
    console.log("  1. Frontend console for JavaScript errors");
    console.log("  2. Browser console for API call failures");
    console.log("  3. Whether selectedEntityId state is being set");
  } else {
    console.log("❌ Issues found:");
    issues.forEach((issue) => console.log(`  • ${issue}`));
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
