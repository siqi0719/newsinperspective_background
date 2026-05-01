import { PrismaClient } from "@news/db";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting database seeding...");
  
  try {
    // Create test articles
    const articles = await prisma.article.createMany({
      data: [
        {
          canonicalUrl: "https://bbc.com/news/climate-summit",
          originalUrl: "https://bbc.com/news/climate-summit",
          title: "BBC: 全球气候峰会取得进展",
          summary: "在巴黎举行的全球气候变化峰会中，联合国秘书长古特雷斯呼吁各国加强气候行动。美国和中国等主要经济体表示支持新的气候协议。",
          extractionStatus: "SUCCESS",
          publishedAt: new Date("2024-04-27T10:00:00Z"),
          sourceName: "BBC",
          domain: "bbc.com",
          ingestionDate: new Date("2024-04-27"),
        },
        {
          canonicalUrl: "https://reuters.com/business/climate-agreement",
          originalUrl: "https://reuters.com/business/climate-agreement",
          title: "路透社: 气候协议取得突破",
          summary: "各国领导人在峰会上同意制定新的碳排放目标。欧洲和美国联合推动该协议，力求在 2030 年前实现碳中和。",
          extractionStatus: "SUCCESS",
          publishedAt: new Date("2024-04-27T11:30:00Z"),
          sourceName: "Reuters",
          domain: "reuters.com",
          ingestionDate: new Date("2024-04-27"),
        },
        {
          canonicalUrl: "https://techcrunch.com/ai-breakthrough",
          originalUrl: "https://techcrunch.com/ai-breakthrough",
          title: "TechCrunch: AI 技术突破",
          summary: "一家主要的科技公司宣布了新的人工智能模型，声称性能提升了 40%。该模型可用于医疗诊断和金融分析。",
          extractionStatus: "SUCCESS",
          publishedAt: new Date("2024-04-26T09:00:00Z"),
          sourceName: "TechCrunch",
          domain: "techcrunch.com",
          ingestionDate: new Date("2024-04-26"),
        }
      ],
      skipDuplicates: true
    });
    
    console.log("✅ Created", articles.count, "articles");
    
    // Create story clusters
    const clusters = await Promise.all([
      prisma.storyCluster.create({
        data: {
          clusterKey: "climate-summit-2024",
          storyDate: new Date("2024-04-27"),
          title: "全球气候变化峰会召开",
          topCategory: "Global | Environment",
          articleCount: 2,
          sourceCount: 2,
        }
      }),
      prisma.storyCluster.create({
        data: {
          clusterKey: "ai-breakthrough-2024",
          storyDate: new Date("2024-04-26"),
          title: "科技巨头发布新产品",
          topCategory: "North America | Technology",
          articleCount: 1,
          sourceCount: 1,
        }
      })
    ]);
    
    console.log("✅ Created", clusters.length, "story clusters");
    
    // Link articles to clusters
    const articles_data = await prisma.article.findMany({
      where: {
        domain: { in: ["bbc.com", "reuters.com", "techcrunch.com"] }
      }
    });
    
    if (articles_data.length > 0) {
      for (let i = 0; i < Math.min(2, articles_data.length); i++) {
        if (articles_data[i].domain !== "techcrunch.com") {
          await prisma.clusterArticle.create({
            data: {
              clusterId: clusters[0].id,
              articleId: articles_data[i].id,
              rank: i + 1,
              similarity: 0.95 - (i * 0.05)
            }
          });
        }
      }
      
      const techArticle = articles_data.find(a => a.domain === "techcrunch.com");
      if (techArticle) {
        await prisma.clusterArticle.create({
          data: {
            clusterId: clusters[1].id,
            articleId: techArticle.id,
            rank: 1,
            similarity: 0.99
          }
        });
      }
    }
    
    console.log("✅ Linked articles to clusters");
    
    console.log("\n✨ Database seeding completed successfully!");
    console.log("📊 Created 3 articles and 2 story clusters");
  } catch (error) {
    console.error("❌ Error during seeding:", error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
