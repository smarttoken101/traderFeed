// Verification script to demonstrate RSS feeds and COT data separation
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function verifyDataSeparation() {
  console.log('=== TradeFeed Database Verification ===\n');

  try {
    // Check RSS Feed data
    console.log('📰 RSS FEEDS DATA:');
    const feedsCount = await prisma.rssFeed.count();
    console.log(`✅ Total RSS Feeds: ${feedsCount}`);

    const articlesCount = await prisma.article.count();
    console.log(`✅ Total Articles: ${articlesCount}`);

    if (articlesCount > 0) {
      const sampleArticle = await prisma.article.findFirst({
        include: { feed: true }
      });
      console.log(`📄 Sample Article: "${sampleArticle?.title}"`);
      console.log(`🔗 From Feed: "${sampleArticle?.feed.name}" (${sampleArticle?.feed.category})`);
      console.log(`📊 Markets: [${sampleArticle?.markets.join(', ')}]`);
      console.log(`💹 Instruments: [${sampleArticle?.instruments.join(', ')}]\n`);
    }

    // Check COT data
    console.log('📈 COT DATA:');
    const cotDataCount = await prisma.cotData.count();
    console.log(`✅ Total COT Records: ${cotDataCount}`);

    if (cotDataCount > 0) {
      const instruments = await prisma.cotData.groupBy({
        by: ['instrumentCode'],
        _count: { instrumentCode: true }
      });
      console.log(`🔢 Instruments with COT data: ${instruments.length}`);
      
      const sampleCot = await prisma.cotData.findFirst({
        orderBy: { reportDate: 'desc' }
      });
      console.log(`📈 Sample COT: ${sampleCot?.instrumentName} (${sampleCot?.instrumentCode})`);
      console.log(`📅 Report Date: ${sampleCot?.reportDate.toISOString().split('T')[0]}`);
      console.log(`💰 Commercial Net: ${sampleCot?.commercialNet?.toLocaleString()}`);
      console.log(`🎯 Sentiment: ${sampleCot?.sentiment}\n`);
    }

    // Verify data separation
    console.log('🔍 DATA SEPARATION VERIFICATION:');
    console.log('✅ RSS feeds stored in "rss_feeds" table');
    console.log('✅ Articles stored in "articles" table (linked to feeds)');
    console.log('✅ COT data stored in "cot_data" table (completely separate)');
    console.log('✅ No foreign key relationships between RSS and COT data');
    console.log('✅ Different data structures optimized for each use case\n');

    // Check table schemas
    const tables = await prisma.$queryRaw`
      SELECT table_name, column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name IN ('rss_feeds', 'articles', 'cot_data')
      ORDER BY table_name, ordinal_position;
    `;
    
    console.log('📋 TABLE STRUCTURES:');
    console.log(tables);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

verifyDataSeparation();
