import { PrismaClient } from "@news/db";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting database seeding...");
  
  try {
    // Create test story 1
    const story1 = await prisma.story.create({
      data: {
        date: new Date("2024-04-27"),
        dateFrom: new Date("2024-04-25"),
        dateUntil: new Date("2024-04-27"),
        title: "全球气候变化峰会召开",
        importanceScore: 8.5,
        region: "Global",
        category: "Global | Environment",
        keywords: ["气候", "峰会", "环保", "国际"],
        articles: {
          create: [
            {
              domain: "bbc.com",
              canonicalUrl: "https://bbc.com/news/climate-summit",
              title: "BBC: 全球气候峰会取得进展",
              summary: "在巴黎举行的全球气候变化峰会中，联合国秘书长古特雷斯呼吁各国加强气候行动。美国和中国等主要经济体表示支持新的气候协议。",
              publishedAt: new Date("2024-04-27T10:00:00Z"),
              sentiment: 0.7,
              subjectivity: 0.4,
              biasSignals: [],
              keywords: ["气候", "峰会"],
              extractionStatus: "SUCCESS",
            },
            {
              domain: "reuters.com",
              canonicalUrl: "https://reuters.com/business/climate-agreement",
              title: "路透社: 气候协议取得突破",
              summary: "各国领导人在峰会上同意制定新的碳排放目标。欧洲和美国联合推动该协议，力求在 2030 年前实现碳中和。",
              publishedAt: new Date("2024-04-27T11:30:00Z"),
              sentiment: 0.75,
              subjectivity: 0.35,
              biasSignals: [],
              keywords: ["气候", "碳排放"],
              extractionStatus: "SUCCESS",
            },
          ],
        },
      },
    });
    console.log("✅ Created story 1:", story1.id);

    // Create test story 2
    const story2 = await prisma.story.create({
      data: {
        date: new Date("2024-04-26"),
        dateFrom: new Date("2024-04-24"),
        dateUntil: new Date("2024-04-26"),
        title: "科技巨头发布新产品",
        importanceScore: 7.2,
        region: "North America",
        category: "North America | Technology",
        keywords: ["科技", "产品发布", "创新"],
        articles: {
          create: [
            {
              domain: "techcrunch.com",
              canonicalUrl: "https://techcrunch.com/ai-breakthrough",
              title: "TechCrunch: AI 技术突破",
              summary: "一家主要的科技公司宣布了新的人工智能模型，声称性能提升了 40%。该模型可用于医疗诊断和金融分析。",
              publishedAt: new Date("2024-04-26T09:00:00Z"),
              sentiment: 0.8,
              subjectivity: 0.3,
              biasSignals: [],
              keywords: ["AI", "人工智能"],
              extractionStatus: "SUCCESS",
            },
          ],
        },
      },
    });
    console.log("✅ Created story 2:", story2.id);

    console.log("\n✨ Database seeding completed successfully!");
    console.log("📊 Created 2 stories with 3 articles total");
  } catch (error) {
    console.error("❌ Error during seeding:", error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
