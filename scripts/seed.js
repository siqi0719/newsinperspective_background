// 简单的 PostgreSQL 种子脚本
const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:postgres@localhost:5432/news_in_perspective'
});

async function seed() {
  try {
    await client.connect();
    console.log('✅ 已连接到数据库');

    // 添加故事
    await client.query(`
      INSERT INTO "Story" (id, date, "dateFrom", "dateUntil", title, "importanceScore", region, category, keywords)
      VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, $9),
        ($10, $11, $12, $13, $14, $15, $16, $17, $18)
      ON CONFLICT DO NOTHING
    `, [
      'story-001', '2024-04-27', '2024-04-25', '2024-04-27', '全球气候变化峰会召开', 8.5, 'Global', 'Global | Environment', ['气候', '峰会', '环保', '国际'],
      'story-002', '2024-04-26', '2024-04-24', '2024-04-26', '科技巨头发布新产品', 7.2, 'North America', 'North America | Technology', ['科技', '产品', '创新']
    ]);
    console.log('✅ 故事已添加');

    // 添加文章
    await client.query(`
      INSERT INTO "Article" (id, "storyId", domain, "canonicalUrl", title, summary, "publishedAt", sentiment, subjectivity, "biasSignals", keywords, "extractionStatus")
      VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12),
        ($13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24),
        ($25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36)
      ON CONFLICT DO NOTHING
    `, [
      'article-001', 'story-001', 'bbc.com', 'https://bbc.com/news/climate-summit', 'BBC: 全球气候峰会取得进展',
      '在巴黎举行的全球气候变化峰会中，联合国秘书长古特雷斯呼吁各国加强气候行动。美国和中国等主要经济体表示支持新的气候协议。',
      '2024-04-27 10:00:00', 0.7, 0.4, [], ['气候', '峰会'], 'SUCCESS',

      'article-002', 'story-001', 'reuters.com', 'https://reuters.com/business/climate-agreement', '路透社: 气候协议取得突破',
      '各国领导人在峰会上同意制定新的碳排放目标。欧洲和美国联合推动该协议，力求在 2030 年前实现碳中和。',
      '2024-04-27 11:30:00', 0.75, 0.35, [], ['气候', '碳排放'], 'SUCCESS',

      'article-003', 'story-002', 'techcrunch.com', 'https://techcrunch.com/ai-breakthrough', 'TechCrunch: AI 技术突破',
      '一家主要的科技公司宣布了新的人工智能模型，声称性能提升了 40%。该模型可用于医疗诊断和金融分析。',
      '2024-04-26 09:00:00', 0.8, 0.3, [], ['AI', '人工智能'], 'SUCCESS'
    ]);
    console.log('✅ 文章已添加');

    console.log('\n✨ 种子数据添加完成！');
  } catch (err) {
    console.error('❌ 错误:', err);
  } finally {
    await client.end();
  }
}

seed();
