import "./src/config/env.js";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  try {
    // Find an article with entities
    const article = await prisma.article.findFirst({
      where: {
        ingestionDate: {
          gte: new Date("2026-04-27T00:00:00Z"),
          lte: new Date("2026-04-27T23:59:59Z")
        },
        entityMentions: {
          some: {}
        }
      },
      select: {
        id: true,
        title: true,
        summary: true,
        _count: { select: { entityMentions: true } }
      }
    });

    if (article) {
      console.log("\n=== ARTICLE WITH ENTITIES ===");
      console.log(`ID: ${article.id}`);
      console.log(`Title: ${article.title}`);
      console.log(`Summary: ${article.summary?.substring(0, 100)}...`);
      console.log(`Entities: ${article._count.entityMentions}`);

      // Get the entities for this article
      const entities = await prisma.entityMention.findMany({
        where: { articleId: article.id },
        include: { entity: true },
        take: 5
      });

      if (entities.length > 0) {
        console.log(`\nSample entities:`);
        entities.forEach((m, i) => {
          console.log(`  ${i+1}. ${m.entity.name} (${m.entity.type}) - Wikipedia: ${m.entity.wikipediaUrl ? "✓" : "❌"}`);
        });
      }
    } else {
      console.log("No article with entities found!");
    }

  } catch (error) {
    console.error("Error:", error.message);
  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
}

main();
