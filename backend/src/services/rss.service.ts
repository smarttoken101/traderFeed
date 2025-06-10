import Parser from 'rss-parser';
import { PrismaClient } from '@prisma/client';
import feedConfigService from './feedConfig.service';
import logger from '../utils/logger';

const prisma = new PrismaClient();

export interface RSSFeedItem {
  title: string;
  content: string;
  link: string;
  pubDate?: Date;
  category: 'forex' | 'crypto' | 'futures' | 'general' | 'stocks' | 'commodities' | 'options' | 'economic';
}

export interface ArticleCreateData {
  title: string;
  description?: string;
  content?: string;
  link: string;
  author?: string;
  publishedAt: Date;
  feedId: string;
  originalText?: string;
  markets: string[];
  instruments: string[];
}

export class RSSService {
  private parser: Parser;
  public prisma: PrismaClient;

  constructor() {
    this.parser = new Parser({
      customFields: {
        item: ['media:content', 'media:thumbnail']
      }
    });
    this.prisma = prisma;
  }

  /**
   * Parse and store articles from a single RSS feed
   */
  async processFeed(feedUrl: string, category: string): Promise<void> {
    try {
      logger.info(`Processing RSS feed: ${feedUrl} (${category})`);

      // Get or create the feed in database
      let feedData = await prisma.rssFeed.findUnique({
        where: { url: feedUrl }
      });

      if (!feedData) {
        feedData = await prisma.rssFeed.create({
          data: {
            name: `${category} feed`,
            url: feedUrl,
            category,
            isActive: true
          }
        });
      }

      // Parse the RSS feed
      const feed = await this.parser.parseURL(feedUrl);
      
      if (!feed.items || feed.items.length === 0) {
        logger.warn(`No items found in feed: ${feedUrl}`);
        return;
      }

      let processedCount = 0;
      let skippedCount = 0;

      for (const item of feed.items) {
        try {
          if (!item.title || !item.link) {
            logger.debug('Skipping item without title or link');
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

          // Process and store the article
          const publishedDate = item.pubDate ? new Date(item.pubDate) : new Date();
          const content = item.content || item.contentSnippet || item.summary || '';
          const description = item.contentSnippet || item.summary || content.substring(0, 500);

          // Create article in database
          const articleData: ArticleCreateData = {
            title: item.title,
            description,
            content,
            link: item.link,
            author: item.creator || item.author || null,
            publishedAt: publishedDate,
            feedId: feedData.id,
            originalText: content,
            markets: this.categorizeContent(item.title || '', content, category),
            instruments: this.extractInstruments(item.title + ' ' + content)
          };

          await prisma.article.create({
            data: {
              ...articleData,
              isProcessed: false
            }
          });

          processedCount++;
          logger.debug(`Stored article: ${item.title}`);

        } catch (error: any) {
          logger.error(`Error processing item from ${feedUrl}:`, error);
          skippedCount++;
        }
      }

      // Update feed last fetched time
      await prisma.rssFeed.update({
        where: { id: feedData.id },
        data: { 
          lastFetched: new Date(),
          fetchError: null
        }
      });

      logger.info(`Feed processing completed: ${feedUrl} - ${processedCount} new articles, ${skippedCount} skipped`);

    } catch (error: any) {
      logger.error(`Error processing RSS feed ${feedUrl}:`, error);
      
      // Update feed with error if it exists
      try {
        const feedData = await prisma.rssFeed.findUnique({
          where: { url: feedUrl }
        });
        
        if (feedData) {
          await prisma.rssFeed.update({
            where: { id: feedData.id },
            data: { 
              fetchError: error.message,
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
   * Categorize content by market type
   */
  private categorizeContent(title: string, content: string, defaultCategory: string): string[] {
    const markets = new Set<string>();
    const text = (title + ' ' + content).toLowerCase();

    // Add default category
    if (defaultCategory && defaultCategory !== 'general') {
      markets.add(defaultCategory);
    }

    // Forex keywords
    if (text.match(/\b(forex|fx|currency|exchange rate|eurusd|gbpusd|usdjpy|audusd|usdcad|usdchf|nzdusd|central bank|fed|ecb|boe|boj|interest rate|monetary policy|dollar|euro|pound|yen)\b/)) {
      markets.add('forex');
    }

    // Crypto keywords
    if (text.match(/\b(crypto|bitcoin|btc|ethereum|eth|blockchain|altcoin|defi|nft|binance|coinbase|cryptocurrency|digital currency|web3|solana|cardano|polkadot)\b/)) {
      markets.add('crypto');
    }

    // Futures keywords
    if (text.match(/\b(futures|commodities|oil|gold|silver|wheat|corn|natural gas|crude|wti|brent|copper|platinum|coffee|sugar|cotton|lumber)\b/)) {
      markets.add('futures');
    }

    // Stocks keywords
    if (text.match(/\b(stocks|equity|shares|nasdaq|s&p|dow|earnings|ipo|dividend|market cap|nyse|russell)\b/)) {
      markets.add('stocks');
    }

    // Options keywords
    if (text.match(/\b(options|calls|puts|volatility|vix|implied volatility|strike|expiration)\b/)) {
      markets.add('options');
    }

    // Economic keywords
    if (text.match(/\b(gdp|inflation|unemployment|cpi|ppi|non-farm|payrolls|retail sales|industrial production|consumer confidence)\b/)) {
      markets.add('economic');
    }

    return markets.size > 0 ? Array.from(markets) : ['general'];
  }

  /**
   * Extract trading instruments from text
   */
  private extractInstruments(text: string): string[] {
    const instruments = new Set<string>();
    const upperText = text.toUpperCase();

    // Forex pairs
    const forexPairs = [
      'EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF', 'NZDUSD',
      'EURJPY', 'EURGBP', 'EURCHF', 'GBPJPY', 'GBPCHF', 'AUDJPY', 'EURAUD',
      'AUDCAD', 'AUDCHF', 'AUDNZD', 'CADJPY', 'CHFJPY', 'EURNZD', 'GBPAUD',
      'GBPCAD', 'GBPNZD', 'NZDCAD', 'NZDCHF', 'NZDJPY', 'USDPLN', 'USDSEK'
    ];
    
    forexPairs.forEach(pair => {
      if (upperText.includes(pair) || 
          upperText.includes(pair.slice(0, 3) + '/' + pair.slice(3)) ||
          upperText.includes(pair.slice(0, 3) + '-' + pair.slice(3))) {
        instruments.add(pair);
      }
    });

    // Crypto pairs
    const cryptoPairs = [
      'BTCUSD', 'ETHUSD', 'ADAUSD', 'DOTUSD', 'LINKUSD', 'LTCUSD', 
      'SOLUSD', 'AVAXUSD', 'MATICUSD', 'ATOMUSD', 'LUNAUSD', 'ALGOUSD'
    ];
    cryptoPairs.forEach(pair => {
      if (upperText.includes(pair) || 
          upperText.includes(pair.slice(0, 3) + '/' + pair.slice(3)) ||
          upperText.includes(pair.slice(0, 3) + '-' + pair.slice(3))) {
        instruments.add(pair);
      }
    });

    // Commodities futures symbols
    const commodities = [
      'GC', 'SI', 'CL', 'NG', 'HG', 'ZW', 'ZC', 'ZS', 'ZL', 'ZM',
      'CT', 'KC', 'SB', 'CC', 'LBS', 'HE', 'LE', 'GF', 'PL', 'PA'
    ];
    commodities.forEach(symbol => {
      if (upperText.includes(' ' + symbol + ' ') || 
          upperText.includes('/' + symbol + '/') ||
          upperText.startsWith(symbol + ' ') ||
          upperText.endsWith(' ' + symbol)) {
        instruments.add(symbol);
      }
    });

    // Stock indices
    const indices = ['SPX', 'NDX', 'DJI', 'RUT', 'VIX', 'ES', 'NQ', 'YM'];
    indices.forEach(index => {
      if (upperText.includes(index)) {
        instruments.add(index);
      }
    });

    return Array.from(instruments);
  }

  /**
   * Process all RSS feeds from configuration
   */
  async processAllFeeds(): Promise<void> {
    try {
      // Load feeds from configuration if not already loaded
      if (feedConfigService.getAllFeeds().length === 0) {
        await feedConfigService.loadFeedsFromConfig();
      }

      const feeds = feedConfigService.getAllFeeds();
      
      if (feeds.length === 0) {
        logger.warn('No RSS feeds configured');
        return;
      }

      logger.info(`Starting to process ${feeds.length} RSS feeds`);

      // Process feeds with some concurrency but not too much to avoid rate limiting
      const batchSize = 3;
      for (let i = 0; i < feeds.length; i += batchSize) {
        const batch = feeds.slice(i, i + batchSize);
        
        await Promise.allSettled(
          batch.map(feed => this.processFeed(feed.url, feed.category))
        );

        // Small delay between batches
        if (i + batchSize < feeds.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      logger.info('Completed processing all RSS feeds');

    } catch (error) {
      logger.error('Error in processAllFeeds:', error);
      throw error;
    }
  }

  /**
   * Alias for processAllFeeds - for backward compatibility
   */
  async processRSSFeeds(): Promise<void> {
    return this.processAllFeeds();
  }

  /**
   * Initialize default feeds from configuration
   */
  async initializeDefaultFeeds(): Promise<void> {
    return this.initializeFeeds();
  }

  /**
   * Initialize feeds from configuration
   */
  async initializeFeeds(): Promise<void> {
    try {
      await feedConfigService.loadFeedsFromConfig();
      
      const feeds = feedConfigService.getAllFeeds();
      logger.info(`Initialized ${feeds.length} RSS feeds from configuration`);

      // Create feed records in database
      for (const feed of feeds) {
        try {
          await prisma.rssFeed.upsert({
            where: { url: feed.url },
            update: {
              name: feed.name,
              category: feed.category,
              isActive: true
            },
            create: {
              name: feed.name,
              url: feed.url,
              category: feed.category,
              isActive: true
            }
          });
        } catch (error) {
          logger.error(`Error creating feed record for ${feed.url}:`, error);
        }
      }

    } catch (error) {
      logger.error('Error initializing feeds:', error);
      throw error;
    }
  }

  /**
   * Parse RSS feed - alias for backward compatibility
   */
  async parseFeed(feedUrl: string): Promise<any[]> {
    try {
      const feed = await this.parser.parseURL(feedUrl);
      return feed.items || [];
    } catch (error) {
      logger.error(`Error parsing feed ${feedUrl}:`, error);
      return [];
    }
  }

  /**
   * Save articles to database - for backward compatibility
   */
  async saveArticles(articles: any[], feedId: string): Promise<number> {
    let savedCount = 0;
    
    for (const article of articles) {
      try {
        // Check if article already exists
        const existing = await prisma.article.findUnique({
          where: { link: article.link }
        });

        if (!existing) {
          const publishedDate = article.pubDate ? new Date(article.pubDate) : new Date();
          const content = article.content || article.contentSnippet || article.summary || '';
          
          await prisma.article.create({
            data: {
              title: article.title,
              description: article.contentSnippet || content.substring(0, 500),
              content,
              link: article.link,
              author: article.creator || article.author || null,
              publishedAt: publishedDate,
              feedId,
              originalText: content,
              markets: [],
              instruments: [],
              isProcessed: false
            }
          });
          
          savedCount++;
        }
      } catch (error) {
        logger.error(`Error saving article ${article.title}:`, error);
      }
    }

    return savedCount;
  }

  /**
   * Get articles with optional filtering
   */
  async getArticles(filters: {
    category?: string;
    sentiment?: string;
    limit?: number;
    offset?: number;
    instruments?: string[];
    markets?: string[];
    dateFrom?: Date;
    dateTo?: Date;
  } = {}): Promise<any[]> {
    const where: any = {};

    if (filters.category) {
      where.feed = { category: filters.category };
    }

    if (filters.markets && filters.markets.length > 0) {
      where.markets = { hasSome: filters.markets };
    }

    if (filters.sentiment) {
      where.sentimentLabel = filters.sentiment;
    }

    if (filters.instruments && filters.instruments.length > 0) {
      where.instruments = {
        hasSome: filters.instruments
      };
    }

    if (filters.dateFrom || filters.dateTo) {
      where.publishedAt = {};
      if (filters.dateFrom) where.publishedAt.gte = filters.dateFrom;
      if (filters.dateTo) where.publishedAt.lte = filters.dateTo;
    }

    return await prisma.article.findMany({
      where,
      orderBy: { publishedAt: 'desc' },
      take: filters.limit || 50,
      skip: filters.offset || 0,
      include: {
        feed: {
          select: {
            name: true,
            category: true,
            url: true
          }
        }
      }
    });
  }

  /**
   * Get sentiment statistics for articles
   */
  async getSentimentStats(timeframe: string = '24h'): Promise<any> {
    const hours = timeframe === '24h' ? 24 : timeframe === '7d' ? 168 : 720; // 30d
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const stats = await prisma.article.groupBy({
      by: ['sentimentLabel'],
      where: {
        sentimentLabel: { not: null },
        publishedAt: { gte: since },
        isProcessed: true
      },
      _count: { sentimentLabel: true },
      _avg: { sentimentScore: true }
    });

    return stats.map(stat => ({
      sentiment: stat.sentimentLabel,
      count: stat._count.sentimentLabel,
      averageScore: stat._avg.sentimentScore
    }));
  }

  /**
   * Get all RSS feeds from database
   */
  async getAllFeeds(): Promise<any[]> {
    try {
      return await prisma.rssFeed.findMany({
        where: { isActive: true },
        include: {
          _count: {
            select: { articles: true }
          }
        },
        orderBy: { name: 'asc' }
      });
    } catch (error) {
      logger.error('Error getting feeds:', error);
      throw error;
    }
  }

  /**
   * Add a new RSS feed to database
   */
  async addFeed(name: string, url: string, category: string): Promise<any> {
    try {
      return await prisma.rssFeed.create({
        data: {
          name,
          url,
          category,
          isActive: true
        }
      });
    } catch (error) {
      logger.error('Error adding feed:', error);
      throw error;
    }
  }

  /**
   * Update feed status
   */
  async updateFeedStatus(feedId: string, isActive: boolean): Promise<any> {
    try {
      return await prisma.rssFeed.update({
        where: { id: feedId },
        data: { isActive }
      });
    } catch (error) {
      logger.error('Error updating feed status:', error);
      throw error;
    }
  }

  /**
   * Delete RSS feed
   */
  async deleteFeed(feedId: string): Promise<void> {
    try {
      await prisma.rssFeed.delete({
        where: { id: feedId }
      });
    } catch (error) {
      logger.error('Error deleting feed:', error);
      throw error;
    }
  }
}

export default new RSSService();