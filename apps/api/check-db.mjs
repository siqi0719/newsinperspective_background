import "./src/config/env.js";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  try {
    // Check specific article
    const articleId = "cmoh6dclu01lrvjp011jg617v";

    console.log("\n=== CHECKING DATABASE ===\n");

    // Check article exists
    const article = await prisma.article.findUnique({
      where: { id: articleId },
      select: {
        title: true,
        summary: true,
        fullText: true,
        _count: { select: { entityMentions: true } }
      }
    });

    if (article) {
      console.log("Article found:");
      console.log(`  Title: ${article.title.substring(0, 50)}...`);
      console.log(`  Has summary: ${!!article.summary}`);
      console.log(`  Has fullText: ${!!article.fullText}`);
      console.log(`  Entity mentions: ${article._count.entityMentions}`);
    } else {
      console.log("Article not found!");
    }

    // Check total articles on 2026-04-27
    const totalArticles = await prisma.article.count({
      where: {
        ingestionDate: {
          gte: new Date("2026-04-27T00:00:00Z"),
          lte: new Date("2026-04-27T23:59:59Z")
        }
      }
    });

    // Check total entity mentions on 2026-04-27
    const totalMentions = await prisma.entityMention.count({
      where: {
        article: {
          ingestionDate: {
            gte: new Date("2026-04-27T00:00:00Z"),
            lte: new Date("2026-04-27T23:59:59Z")
          }
        }
      }
    });

    console.log(`\nEnrichment Coverage for 2026-04-27:`);
    console.log(`  Total articles: ${totalArticles}`);
    console.log(`  Total entity mentions: ${totalMentions}`);

    // Check how many articles on that date have entities
    const articlesWithEntities = await prisma.article.count({
      where: {
        ingestionDate: {
          gte: new Date("2026-04-27T00:00:00Z"),
          lte: new Date("2026-04-27T23:59:59Z")
        },
        entityMentions: {
          some: {}
        }
      }
    });

    console.log(`  Articles with entities: ${articlesWithEntities}`);
    console.log(`  Articles missing entities: ${totalArticles - articlesWithEntities}`);
    console.log(`  Coverage: ${((articlesWithEntities / totalArticles) * 100).toFixed(1)}%`);

    // Sample entities
    const sampleEntities = await prisma.entityMention.findMany({
      where: {
        article: {
          ingestionDate: {
            gte: new Date("2026-04-27T00:00:00Z"),
            lte: new Date("2026-04-27T23:59:59Z")
          }
        }
      },
      include: { entity: true },
      take: 3
    });

    if (sampleEntities.length > 0) {
      console.log("\nSample entities found:");
      sampleEntities.forEach((m, i) => {
        console.log(`  ${i+1}. ${m.entity.name} (${m.entity.type})`);
      });
    } else {
      console.log("\nNo entities found on 2026-04-27!");
    }

  } catch (error) {
    console.error("Error:", error.message);
  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
}

main();
