import "../config/env.js";
import { prisma } from "../lib/prisma.js";

async function main() {
  console.log("\n=== GENERATING ARTICLE SUMMARIES ===\n");

  const date = process.argv[2] || "2026-04-27";
  const limit = process.argv[3] ? Number(process.argv[3]) : 100;

  // Find articles without summary
  const articles = await prisma.article.findMany({
    where: {
      ingestionDate: {
        gte: new Date(`${date}T00:00:00.000Z`),
        lte: new Date(`${date}T23:59:59.999Z`),
      },
      summary: null, // Only articles without summary
    },
    take: limit,
  });

  console.log(`Found ${articles.length} articles without summaries\n`);

  let updated = 0;

  for (const article of articles) {
    // Generate summary from title and fullText
    let summary: string | null = null;

    if (article.fullText) {
      // Use first 300 chars of fullText as summary
      summary = article.fullText
        .substring(0, 300)
        .replace(/\s+/g, " ")
        .trim();

      // If it ends mid-word, remove the last incomplete word
      const lastSpace = summary.lastIndexOf(" ");
      if (lastSpace > 200) {
        summary = summary.substring(0, lastSpace) + "...";
      } else if (summary.length >= 300) {
        summary = summary + "...";
      }
    } else if (article.contentSnippet) {
      // Fallback to contentSnippet
      summary = article.contentSnippet.substring(0, 300).trim();
      if (summary.length >= 300) {
        summary = summary + "...";
      }
    } else {
      // Create summary from title if nothing else available
      summary = article.title.substring(0, 200);
    }

    if (summary) {
      await prisma.article.update({
        where: { id: article.id },
        data: { summary },
      });
      updated++;

      if (updated % 10 === 0) {
        console.log(`✓ Updated ${updated} articles...`);
      }
    }
  }

  console.log(`\n✓ Generated summaries for ${updated}/${articles.length} articles`);
  console.log("\nSample summaries:");

  const samples = await prisma.article.findMany({
    where: { summary: { not: null } },
    select: { title: true, summary: true },
    take: 3,
  });

  samples.forEach((article, index) => {
    console.log(`\n${index + 1}. ${article.title}`);
    console.log(`   ${article.summary?.substring(0, 80)}...`);
  });

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
