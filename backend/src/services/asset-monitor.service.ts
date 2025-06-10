import { PrismaClient } from '@prisma/client';
import rssService from './rss.service';
import logger from '../utils/logger';

const prisma = new PrismaClient();

// Enhanced asset mapping for better categorization
export const ASSET_MAPPING = {
  forex: {
    'EURUSD': ['eurusd', 'eur/usd', 'euro dollar', 'euro usd', 'eur usd'],
    'GBPUSD': ['gbpusd', 'gbp/usd', 'pound dollar', 'cable', 'gbp usd', 'pound usd'],
    'USDJPY': ['usdjpy', 'usd/jpy', 'dollar yen', 'usd jpy', 'dollar jpy'],
    'AUDUSD': ['audusd', 'aud/usd', 'aussie dollar', 'aud usd', 'aussie usd'],
    'USDCAD': ['usdcad', 'usd/cad', 'dollar cad', 'usd cad', 'loonie'],
    'USDCHF': ['usdchf', 'usd/chf', 'dollar swiss', 'usd chf', 'swissy'],
    'NZDUSD': ['nzdusd', 'nzd/usd', 'kiwi dollar', 'nzd usd', 'kiwi usd'],
    'EURGBP': ['eurgbp', 'eur/gbp', 'euro pound', 'eur gbp'],
    'EURJPY': ['eurjpy', 'eur/jpy', 'euro yen', 'eur jpy'],
    'GBPJPY': ['gbpjpy', 'gbp/jpy', 'pound yen', 'gbp jpy'],
    'CHFJPY': ['chfjpy', 'chf/jpy', 'swiss yen', 'chf jpy'],
    'CADJPY': ['cadjpy', 'cad/jpy', 'cad yen', 'cad jpy'],
    'AUDJPY': ['audjpy', 'aud/jpy', 'aussie yen', 'aud jpy'],
    'AUDCAD': ['audcad', 'aud/cad', 'aussie cad', 'aud cad'],
    'AUDCHF': ['audchf', 'aud/chf', 'aussie swiss', 'aud chf'],
    'CADCHF': ['cadchf', 'cad/chf', 'cad swiss', 'cad chf'],
    'EURCHF': ['eurchf', 'eur/chf', 'euro swiss', 'eur chf'],
    'EURNZD': ['eurnzd', 'eur/nzd', 'euro kiwi', 'eur nzd'],
    'EURAUD': ['euraud', 'eur/aud', 'euro aussie', 'eur aud'],
    'EURCAD': ['eurcad', 'eur/cad', 'euro cad', 'eur cad'],
    'GBPAUD': ['gbpaud', 'gbp/aud', 'pound aussie', 'gbp aud'],
    'GBPCAD': ['gbpcad', 'gbp/cad', 'pound cad', 'gbp cad'],
    'GBPCHF': ['gbpchf', 'gbp/chf', 'pound swiss', 'gbp chf'],
    'GBPNZD': ['gbpnzd', 'gbp/nzd', 'pound kiwi', 'gbp nzd'],
    'NZDCAD': ['nzdcad', 'nzd/cad', 'kiwi cad', 'nzd cad'],
    'NZDCHF': ['nzdchf', 'nzd/chf', 'kiwi swiss', 'nzd chf'],
    'NZDJPY': ['nzdjpy', 'nzd/jpy', 'kiwi yen', 'nzd jpy']
  },
  crypto: {
    'BTCUSD': ['bitcoin', 'btc', 'btcusd', 'btc/usd', 'btc usd'],
    'ETHUSD': ['ethereum', 'eth', 'ethusd', 'eth/usd', 'eth usd'],
    'ADAUSD': ['cardano', 'ada', 'adausd', 'ada/usd', 'ada usd'],
    'DOTUSD': ['polkadot', 'dot', 'dotusd', 'dot/usd', 'dot usd'],
    'LINKUSD': ['chainlink', 'link', 'linkusd', 'link/usd', 'link usd'],
    'XRPUSD': ['ripple', 'xrp', 'xrpusd', 'xrp/usd', 'xrp usd'],
    'LTCUSD': ['litecoin', 'ltc', 'ltcusd', 'ltc/usd', 'ltc usd'],
    'BCHUSD': ['bitcoin cash', 'bch', 'bchusd', 'bch/usd', 'bch usd'],
    'BNBUSD': ['binance coin', 'bnb', 'bnbusd', 'bnb/usd', 'bnb usd'],
    'SOLUSD': ['solana', 'sol', 'solusd', 'sol/usd', 'sol usd'],
    'AVAXUSD': ['avalanche', 'avax', 'avaxusd', 'avax/usd', 'avax usd'],
    'MATICUSD': ['polygon', 'matic', 'maticusd', 'matic/usd', 'matic usd'],
    'ATOMUSD': ['cosmos', 'atom', 'atomusd', 'atom/usd', 'atom usd'],
    'ALGOUSD': ['algorand', 'algo', 'algousd', 'algo/usd', 'algo usd'],
    'DOGEUSD': ['dogecoin', 'doge', 'dogeusd', 'doge/usd', 'doge usd'],
    'SHIBUSD': ['shiba inu', 'shib', 'shibusd', 'shib/usd', 'shib usd']
  },
  commodities: {
    'GOLD': ['gold', 'xauusd', 'xau/usd', 'xau usd', 'gold futures'],
    'SILVER': ['silver', 'xagusd', 'xag/usd', 'xag usd', 'silver futures'],
    'OIL': ['crude oil', 'oil', 'wti', 'brent', 'crude', 'petroleum'],
    'NATGAS': ['natural gas', 'natgas', 'henry hub', 'gas futures'],
    'COPPER': ['copper', 'copper futures'],
    'PLATINUM': ['platinum', 'platinum futures'],
    'PALLADIUM': ['palladium', 'palladium futures'],
    'WHEAT': ['wheat', 'wheat futures'],
    'CORN': ['corn', 'corn futures'],
    'SOYBEANS': ['soybeans', 'soybean futures'],
    'COFFEE': ['coffee', 'coffee futures'],
    'SUGAR': ['sugar', 'sugar futures'],
    'COTTON': ['cotton', 'cotton futures'],
    'LUMBER': ['lumber', 'lumber futures']
  },
  stocks: {
    'SPX': ['s&p 500', 'spx', 'sp500', 's&p500', 'spy'],
    'NDX': ['nasdaq', 'ndx', 'nasdaq 100', 'qqq'],
    'DJI': ['dow jones', 'dji', 'dow', 'dia'],
    'RUSSELL': ['russell 2000', 'rut', 'iwm'],
    'VIX': ['vix', 'volatility index', 'fear index', 'volatility'],
    'TESLA': ['tesla', 'tsla', 'tesla stock'],
    'APPLE': ['apple', 'aapl', 'apple stock'],
    'MICROSOFT': ['microsoft', 'msft', 'microsoft stock'],
    'AMAZON': ['amazon', 'amzn', 'amazon stock'],
    'GOOGLE': ['google', 'googl', 'alphabet', 'goog'],
    'META': ['meta', 'facebook', 'fb', 'meta stock'],
    'NVIDIA': ['nvidia', 'nvda', 'nvidia stock']
  }
};

export class AssetMonitorService {
  /**
   * Extract specific assets mentioned in text
   */
  extractAssets(text: string): { [category: string]: string[] } {
    const normalizedText = text.toLowerCase();
    const foundAssets: { [category: string]: string[] } = {};

    for (const [category, assets] of Object.entries(ASSET_MAPPING)) {
      for (const [assetCode, keywords] of Object.entries(assets)) {
        for (const keyword of keywords) {
          if (normalizedText.includes(keyword)) {
            if (!foundAssets[category]) foundAssets[category] = [];
            if (!foundAssets[category].includes(assetCode)) {
              foundAssets[category].push(assetCode);
            }
          }
        }
      }
    }

    return foundAssets;
  }

  /**
   * Categorize article by primary asset
   */
  categorizeByAsset(title: string, content: string): {
    primaryCategory: string;
    primaryAssets: string[];
    allAssets: { [category: string]: string[] };
  } {
    const text = `${title} ${content}`;
    const allAssets = this.extractAssets(text);
    
    // Determine primary category based on number of mentions and importance
    let primaryCategory = 'general';
    let primaryAssets: string[] = [];
    let maxMentions = 0;

    for (const [category, assets] of Object.entries(allAssets)) {
      if (assets.length > maxMentions) {
        maxMentions = assets.length;
        primaryCategory = category;
        primaryAssets = assets;
      }
    }

    return {
      primaryCategory,
      primaryAssets,
      allAssets
    };
  }

  /**
   * Process RSS feeds with enhanced asset monitoring
   */
  async processRSSFeedsWithAssetTracking(): Promise<void> {
    try {
      logger.info('Starting RSS feed processing with asset tracking...');
      
      // Get all active RSS feeds
      const feeds = await prisma.rssFeed.findMany({
        where: { isActive: true }
      });

      for (const feed of feeds) {
        try {
          await this.processFeedWithAssetTracking(feed.url, feed.category);
        } catch (error) {
          logger.error(`Error processing feed ${feed.url}:`, error);
        }
      }

      logger.info('RSS feed processing with asset tracking completed');
    } catch (error) {
      logger.error('Error in RSS feed processing:', error);
      throw error;
    }
  }

  /**
   * Process a single feed with asset tracking
   */
  async processFeedWithAssetTracking(feedUrl: string, category: string): Promise<void> {
    try {
      logger.info(`Processing RSS feed with asset tracking: ${feedUrl}`);

      // Use existing RSS service to parse feed
      const feedItems = await rssService.parseFeed(feedUrl);
      
      if (!feedItems || feedItems.length === 0) {
        logger.warn(`No items found in feed: ${feedUrl}`);
        return;
      }

      // Get feed data
      const feedData = await prisma.rssFeed.findUnique({
        where: { url: feedUrl }
      });

      if (!feedData) {
        logger.error(`Feed not found in database: ${feedUrl}`);
        return;
      }

      let processedCount = 0;
      let skippedCount = 0;

      for (const item of feedItems) {
        try {
          if (!item.title || !item.link) {
            skippedCount++;
            continue;
          }

          // Check if article already exists
          const existingArticle = await prisma.article.findFirst({
            where: {
              OR: [
                { link: item.link },
                {
                  AND: [
                    { title: item.title },
                    { feedId: feedData.id }
                  ]
                }
              ]
            }
          });

          if (existingArticle) {
            skippedCount++;
            continue;
          }

          // Extract content
          const content = item.content || item.contentSnippet || item.summary || '';
          const publishedDate = item.pubDate ? new Date(item.pubDate) : new Date();

          // Perform asset analysis
          const assetAnalysis = this.categorizeByAsset(item.title, content);
          
          // Create markets array based on asset analysis
          const markets = [category]; // Start with feed category
          if (assetAnalysis.primaryCategory !== 'general' && !markets.includes(assetAnalysis.primaryCategory)) {
            markets.push(assetAnalysis.primaryCategory);
          }

          // Create instruments array from all found assets
          const instruments: string[] = [];
          for (const assets of Object.values(assetAnalysis.allAssets)) {
            instruments.push(...assets);
          }

          // Create article with enhanced asset information
          await prisma.article.create({
            data: {
              title: item.title,
              description: item.contentSnippet || content.substring(0, 500),
              content,
              link: item.link,
              author: item.creator || item.author || null,
              publishedAt: publishedDate,
              feedId: feedData.id,
              originalText: content,
              markets: Array.from(new Set(markets)), // Remove duplicates
              instruments: Array.from(new Set(instruments)), // Remove duplicates
              isProcessed: false
            }
          });

          processedCount++;
          
          // Log asset findings for debugging
          if (instruments.length > 0) {
            logger.info(`Article "${item.title}" - Found assets: ${instruments.join(', ')} in categories: ${Object.keys(assetAnalysis.allAssets).join(', ')}`);
          }

        } catch (error) {
          logger.error(`Error processing article "${item.title}":`, error);
        }
      }

      // Update feed metadata
      await prisma.rssFeed.update({
        where: { id: feedData.id },
        data: {
          lastFetched: new Date(),
          fetchError: null
        }
      });

      logger.info(`Feed ${feedUrl}: Processed ${processedCount}, Skipped ${skippedCount}`);

    } catch (error) {
      logger.error(`Error processing feed ${feedUrl}:`, error);
      
      // Update feed with error
      try {
        const feedData = await prisma.rssFeed.findUnique({
          where: { url: feedUrl }
        });
        if (feedData) {
          await prisma.rssFeed.update({
            where: { id: feedData.id },
            data: {
              fetchError: error instanceof Error ? error.message : 'Unknown error',
              lastFetched: new Date()
            }
          });
        }
      } catch (updateError) {
        logger.error('Error updating feed error status:', updateError);
      }
    }
  }

  /**
   * Get articles by specific asset
   */
  async getArticlesByAsset(asset: string, options: {
    limit?: number;
    offset?: number;
    dateFrom?: Date;
    dateTo?: Date;
  } = {}): Promise<any[]> {
    const where: any = {
      instruments: {
        has: asset
      }
    };

    if (options.dateFrom || options.dateTo) {
      where.publishedAt = {};
      if (options.dateFrom) where.publishedAt.gte = options.dateFrom;
      if (options.dateTo) where.publishedAt.lte = options.dateTo;
    }

    return await prisma.article.findMany({
      where,
      orderBy: { publishedAt: 'desc' },
      take: options.limit || 50,
      skip: options.offset || 0,
      include: {
        feed: {
          select: {
            name: true,
            category: true
          }
        }
      }
    });
  }

  /**
   * Get asset statistics
   */
  async getAssetStatistics(timeframe: '24h' | '7d' | '30d' = '24h'): Promise<any> {
    const now = new Date();
    const timeAgo = new Date();
    
    switch (timeframe) {
      case '24h':
        timeAgo.setHours(now.getHours() - 24);
        break;
      case '7d':
        timeAgo.setDate(now.getDate() - 7);
        break;
      case '30d':
        timeAgo.setDate(now.getDate() - 30);
        break;
    }

    // Get articles from the timeframe
    const articles = await prisma.article.findMany({
      where: {
        publishedAt: {
          gte: timeAgo
        }
      },
      select: {
        instruments: true,
        markets: true,
        sentimentLabel: true
      }
    });

    // Count mentions by asset
    const assetMentions: { [asset: string]: number } = {};
    const categoryMentions: { [category: string]: number } = {};
    const sentimentByAsset: { [asset: string]: { positive: number; negative: number; neutral: number } } = {};

    articles.forEach(article => {
      // Count asset mentions
      article.instruments.forEach(instrument => {
        assetMentions[instrument] = (assetMentions[instrument] || 0) + 1;
        
        // Track sentiment by asset
        if (!sentimentByAsset[instrument]) {
          sentimentByAsset[instrument] = { positive: 0, negative: 0, neutral: 0 };
        }
        if (article.sentimentLabel) {
          sentimentByAsset[instrument][article.sentimentLabel as keyof typeof sentimentByAsset[string]]++;
        }
      });

      // Count category mentions
      article.markets.forEach(market => {
        categoryMentions[market] = (categoryMentions[market] || 0) + 1;
      });
    });

    // Sort by mentions
    const topAssets = Object.entries(assetMentions)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 20)
      .map(([asset, count]) => ({
        asset,
        mentions: count,
        sentiment: sentimentByAsset[asset] || { positive: 0, negative: 0, neutral: 0 }
      }));

    const topCategories = Object.entries(categoryMentions)
      .sort(([,a], [,b]) => b - a)
      .map(([category, count]) => ({ category, mentions: count }));

    return {
      timeframe,
      totalArticles: articles.length,
      topAssets,
      topCategories,
      lastUpdated: new Date()
    };
  }

  /**
   * Initialize feeds from CSV file
   */
  async initializeFeedsFromCSV(): Promise<void> {
    try {
      logger.info('Initializing RSS feeds from CSV file...');
      
      // Read and process CSV file
      const fs = require('fs');
      const path = require('path');
      
      const csvPath = path.join(__dirname, '../../../rss_feeds.csv');
      const csvContent = fs.readFileSync(csvPath, 'utf-8');
      const lines = csvContent.split('\n').filter((line: string) => line.trim() && !line.startsWith('//'));

      for (const line of lines) {
        const url = line.trim();
        if (url.startsWith('http')) {
          try {
            // Determine category based on URL
            let category = 'general';
            const urlLower = url.toLowerCase();
            
            if (urlLower.includes('forex') || urlLower.includes('fx') || urlLower.includes('currency')) {
              category = 'forex';
            } else if (urlLower.includes('crypto') || urlLower.includes('bitcoin') || urlLower.includes('ethereum')) {
              category = 'crypto';
            } else if (urlLower.includes('futures') || urlLower.includes('commodit')) {
              category = 'futures';
            }

            // Extract name from URL
            const urlObj = new URL(url);
            const name = urlObj.hostname.replace('www.', '').replace('.com', '').replace('.org', '');

            // Create or update feed
            await prisma.rssFeed.upsert({
              where: { url },
              update: {
                name: `${name} (${category})`,
                category,
                isActive: true
              },
              create: {
                name: `${name} (${category})`,
                url,
                category,
                isActive: true
              }
            });

            logger.info(`Initialized feed: ${name} (${category}) - ${url}`);
          } catch (error) {
            logger.error(`Error initializing feed ${url}:`, error);
          }
        }
      }

      logger.info('RSS feeds initialization from CSV completed');
    } catch (error) {
      logger.error('Error initializing feeds from CSV:', error);
      throw error;
    }
  }
}

export default new AssetMonitorService();
