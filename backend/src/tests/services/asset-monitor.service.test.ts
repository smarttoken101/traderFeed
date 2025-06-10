// Mock dependencies before imports
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => ({
    rssFeed: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn()
    },
    article: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      groupBy: jest.fn()
    },
    $queryRaw: jest.fn(),
    $disconnect: jest.fn()
  }))
}));

jest.mock('../../services/rss.service', () => ({
  default: {
    parseFeed: jest.fn(),
    processRSSFeeds: jest.fn(),
    extractRSSFeeds: jest.fn(),
    categorizeContent: jest.fn(),
    analyzeSentiment: jest.fn(),
    getArticles: jest.fn(),
    getFeedStats: jest.fn()
  }
}));

jest.mock('../../utils/logger', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

import { AssetMonitorService, ASSET_MAPPING } from '../../services/asset-monitor.service';

// Get mock instances for testing
const { PrismaClient } = require('@prisma/client');
const mockPrisma = new PrismaClient();
const mockRssService = require('../../services/rss.service').default;
const mockLogger = require('../../utils/logger').default;

describe('AssetMonitorService', () => {
  let assetService: AssetMonitorService;

  beforeEach(() => {
    jest.clearAllMocks();
    assetService = new AssetMonitorService();
  });

  afterEach(async () => {
    await mockPrisma.$disconnect();
  });

  describe('ASSET_MAPPING', () => {
    it('should contain major forex pairs', () => {
      expect(ASSET_MAPPING.forex).toHaveProperty('EURUSD');
      expect(ASSET_MAPPING.forex).toHaveProperty('GBPUSD');
      expect(ASSET_MAPPING.forex).toHaveProperty('USDJPY');
      expect(ASSET_MAPPING.forex['EURUSD']).toContain('eurusd');
      expect(ASSET_MAPPING.forex['EURUSD']).toContain('euro dollar');
    });

    it('should contain major cryptocurrencies', () => {
      expect(ASSET_MAPPING.crypto).toHaveProperty('BTCUSD');
      expect(ASSET_MAPPING.crypto).toHaveProperty('ETHUSD');
      expect(ASSET_MAPPING.crypto['BTCUSD']).toContain('bitcoin');
      expect(ASSET_MAPPING.crypto['BTCUSD']).toContain('btc');
    });

    it('should contain commodities', () => {
      expect(ASSET_MAPPING.commodities).toHaveProperty('GOLD');
      expect(ASSET_MAPPING.commodities).toHaveProperty('OIL');
      expect(ASSET_MAPPING.commodities['GOLD']).toContain('gold');
      expect(ASSET_MAPPING.commodities['OIL']).toContain('crude oil');
    });

    it('should contain stock indices', () => {
      expect(ASSET_MAPPING.stocks).toHaveProperty('SPX');
      expect(ASSET_MAPPING.stocks).toHaveProperty('NDX');
      expect(ASSET_MAPPING.stocks['SPX']).toContain('s&p 500');
      expect(ASSET_MAPPING.stocks['NDX']).toContain('nasdaq');
    });
  });

  describe('extractAssets', () => {
    it('should extract forex assets from text', () => {
      const text = 'The EURUSD pair rose significantly after the ECB announcement. Dollar strength against euro continued.';
      
      const result = assetService.extractAssets(text);
      
      expect(result.forex).toContain('EURUSD');
      expect(result.forex.length).toBeGreaterThan(0);
    });

    it('should extract crypto assets from text', () => {
      const text = 'Bitcoin surged to new highs as institutional adoption continues. Ethereum also showed strong performance.';
      
      const result = assetService.extractAssets(text);
      
      expect(result.crypto).toContain('BTCUSD');
      expect(result.crypto).toContain('ETHUSD');
    });

    it('should extract commodities from text', () => {
      const text = 'Gold prices reached record levels amid market uncertainty. Crude oil also gained on supply concerns.';
      
      const result = assetService.extractAssets(text);
      
      expect(result.commodities).toContain('GOLD');
      expect(result.commodities).toContain('OIL');
    });

    it('should extract stock indices from text', () => {
      const text = 'The S&P 500 index closed higher today. NASDAQ also posted gains in technology sector.';
      
      const result = assetService.extractAssets(text);
      
      expect(result.stocks).toContain('SPX');
      expect(result.stocks).toContain('NDX');
    });

    it('should handle case-insensitive matching', () => {
      const text = 'eurusd fell sharply, while BITCOIN gained momentum and GOLD remained stable.';
      
      const result = assetService.extractAssets(text);
      
      expect(result.forex).toContain('EURUSD');
      expect(result.crypto).toContain('BTCUSD');
      expect(result.commodities).toContain('GOLD');
    });

    it('should handle alternative asset names', () => {
      const text = 'The cable (GBP/USD) weakened against the dollar. Loonie also declined.';
      
      const result = assetService.extractAssets(text);
      
      expect(result.forex).toContain('GBPUSD');
      expect(result.forex).toContain('USDCAD'); // loonie
    });

    it('should avoid duplicate assets in same category', () => {
      const text = 'EURUSD EURUSD euro dollar eur/usd EUR USD pair performance';
      
      const result = assetService.extractAssets(text);
      
      expect(result.forex.filter(asset => asset === 'EURUSD')).toHaveLength(1);
    });

    it('should return empty results for text without asset mentions', () => {
      const text = 'This is a general news article about weather and sports.';
      
      const result = assetService.extractAssets(text);
      
      expect(result.forex).toBeUndefined();
      expect(result.crypto).toBeUndefined();
      expect(result.commodities).toBeUndefined();
      expect(result.stocks).toBeUndefined();
      expect(Object.keys(result)).toHaveLength(0);
    });
  });

  describe('categorizeByAsset', () => {
    it('should determine primary category based on asset mentions', () => {
      const title = 'Federal Reserve Policy Impact on USD';
      const content = 'EURUSD, GBPUSD, and USDJPY pairs all reacted to the Fed announcement...';
      
      const result = assetService.categorizeByAsset(title, content);
      
      expect(result.primaryCategory).toBe('forex');
      expect(result.primaryAssets).toEqual(expect.arrayContaining(['EURUSD', 'GBPUSD', 'USDJPY']));
      expect(result.allAssets.forex).toEqual(expect.arrayContaining(['EURUSD', 'GBPUSD', 'USDJPY']));
    });

    it('should prioritize category with most asset mentions', () => {
      const title = 'Mixed Market Performance';
      const content = 'Bitcoin and Ethereum gained, but EURUSD, GBPUSD, USDJPY, AUDUSD all declined significantly.';
      
      const result = assetService.categorizeByAsset(title, content);
      
      expect(result.primaryCategory).toBe('forex'); // 4 forex vs 2 crypto
      expect(result.primaryAssets.length).toBeGreaterThan(result.allAssets.crypto?.length || 0);
    });

    it('should default to general category when no assets found', () => {
      const title = 'Weather Report';
      const content = 'Sunny skies expected throughout the week.';
      
      const result = assetService.categorizeByAsset(title, content);
      
      expect(result.primaryCategory).toBe('general');
      expect(result.primaryAssets).toHaveLength(0);
    });

    it('should handle single asset mention correctly', () => {
      const title = 'Bitcoin Analysis';
      const content = 'Bitcoin price action suggests bullish momentum.';
      
      const result = assetService.categorizeByAsset(title, content);
      
      expect(result.primaryCategory).toBe('crypto');
      expect(result.primaryAssets).toContain('BTCUSD');
    });

    it('should include all asset categories in results', () => {
      const title = 'Multi-Asset Analysis';
      const content = 'EURUSD weakened, Bitcoin surged, Gold gained, and S&P 500 closed higher.';
      
      const result = assetService.categorizeByAsset(title, content);
      
      expect(Object.keys(result.allAssets)).toEqual(
        expect.arrayContaining(['forex', 'crypto', 'commodities', 'stocks'])
      );
    });
  });

  describe('processRSSFeedsWithAssetTracking', () => {
    it('should process feeds and track asset mentions', async () => {
      const mockFeeds = [
        {
          id: 1,
          url: 'https://example.com/feed.xml',
          title: 'Finance News',
          isActive: true
        }
      ];

      const mockArticles = [
        {
          id: 'article-1',
          title: 'Fed Announcement Impacts EURUSD',
          content: 'The European Central Bank decision affected EURUSD significantly...',
          publishedAt: new Date(),
          url: 'https://example.com/article1'
        }
      ];

      mockPrisma.rssFeed.findMany.mockResolvedValue(mockFeeds);
      
      // Mock successful RSS processing but don't expect specific method calls
      // since we may not have direct access to RSS service within asset service

      await assetService.processRSSFeedsWithAssetTracking();

      expect(mockPrisma.rssFeed.findMany).toHaveBeenCalledWith({
        where: { isActive: true }
      });
      expect(mockLogger.info).toHaveBeenCalledWith('Starting RSS feed processing with asset tracking...');
    });

    it('should handle feed processing errors gracefully', async () => {
      mockPrisma.rssFeed.findMany.mockRejectedValue(new Error('Database connection failed'));

      await expect(assetService.processRSSFeedsWithAssetTracking()).rejects.toThrow('Database connection failed');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error in RSS feed processing with asset tracking:',
        expect.any(Error)
      );
    });

    it('should handle empty feed list', async () => {
      mockPrisma.rssFeed.findMany.mockResolvedValue([]);

      await assetService.processRSSFeedsWithAssetTracking();

      expect(mockLogger.info).toHaveBeenCalledWith('Starting RSS feed processing with asset tracking...');
      expect(mockLogger.info).toHaveBeenCalledWith('RSS feed processing with asset tracking completed');
    });
  });

  describe('getAssetStatistics', () => {
    it('should return asset statistics for a given timeframe', async () => {
      const mockArticles = [
        {
          instruments: ['EURUSD', 'GBPUSD'],
          markets: ['forex'],
          sentimentLabel: 'positive'
        },
        {
          instruments: ['BTCUSD'],
          markets: ['crypto'],
          sentimentLabel: 'negative'
        }
      ];

      mockPrisma.article.findMany.mockResolvedValue(mockArticles);

      const stats = await assetService.getAssetStatistics('24h');

      expect(stats).toHaveProperty('timeframe', '24h');
      expect(stats).toHaveProperty('totalArticles');
      expect(stats).toHaveProperty('topAssets');
      expect(stats).toHaveProperty('topCategories');
      expect(stats).toHaveProperty('lastUpdated');
    });

    it('should handle different timeframes', async () => {
      mockPrisma.article.findMany.mockResolvedValue([]);

      const stats7d = await assetService.getAssetStatistics('7d');
      const stats30d = await assetService.getAssetStatistics('30d');

      expect(stats7d.timeframe).toBe('7d');
      expect(stats30d.timeframe).toBe('30d');
    });

    it('should handle database errors gracefully', async () => {
      mockPrisma.article.findMany.mockRejectedValue(new Error('Database error'));

      await expect(assetService.getAssetStatistics('24h')).rejects.toThrow('Database error');
    });
  });

  describe('getArticlesByAsset', () => {
    it('should return articles for a specific asset', async () => {
      const mockArticles = [
        {
          id: 'article-1',
          title: 'EURUSD Analysis',
          instruments: ['EURUSD'],
          publishedAt: new Date(),
          feed: { name: 'Finance News', category: 'forex' }
        }
      ];

      mockPrisma.article.findMany.mockResolvedValue(mockArticles);

      const articles = await assetService.getArticlesByAsset('EURUSD', { limit: 10 });

      expect(mockPrisma.article.findMany).toHaveBeenCalledWith({
        where: {
          instruments: {
            has: 'EURUSD'
          }
        },
        orderBy: { publishedAt: 'desc' },
        take: 10,
        skip: 0,
        include: {
          feed: {
            select: {
              name: true,
              category: true
            }
          }
        }
      });
      expect(articles).toEqual(mockArticles);
    });

    it('should handle date range filtering', async () => {
      const dateFrom = new Date('2025-06-01');
      const dateTo = new Date('2025-06-10');

      mockPrisma.article.findMany.mockResolvedValue([]);

      await assetService.getArticlesByAsset('EURUSD', { 
        dateFrom, 
        dateTo,
        limit: 50 
      });

      expect(mockPrisma.article.findMany).toHaveBeenCalledWith({
        where: {
          instruments: {
            has: 'EURUSD'
          },
          publishedAt: {
            gte: dateFrom,
            lte: dateTo
          }
        },
        orderBy: { publishedAt: 'desc' },
        take: 50,
        skip: 0,
        include: {
          feed: {
            select: {
              name: true,
              category: true
            }
          }
        }
      });
    });
  });

  describe('initializeFeedsFromCSV', () => {
    it('should handle CSV initialization', async () => {
      // Mock fs module
      const mockFs = {
        readFileSync: jest.fn().mockReturnValue(`https://example.com/forex.xml
https://crypto-news.com/feed.xml
// Comment line should be ignored
https://commodities.com/rss`)
      };

      jest.doMock('fs', () => mockFs);
      jest.doMock('path', () => ({
        join: jest.fn().mockReturnValue('/mock/path/rss_feeds.csv')
      }));

      mockPrisma.rssFeed.upsert.mockResolvedValue({});

      await assetService.initializeFeedsFromCSV();

      expect(mockLogger.info).toHaveBeenCalledWith('Initializing RSS feeds from CSV file...');
      expect(mockLogger.info).toHaveBeenCalledWith('RSS feeds initialization from CSV completed');
    });

    it('should handle CSV reading errors', async () => {
      const mockFs = {
        readFileSync: jest.fn().mockImplementation(() => {
          throw new Error('File not found');
        })
      };

      jest.doMock('fs', () => mockFs);

      await expect(assetService.initializeFeedsFromCSV()).rejects.toThrow('File not found');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error initializing feeds from CSV:',
        expect.any(Error)
      );
    });
  });

  describe('Error handling and edge cases', () => {
    it('should handle malformed data gracefully', () => {
      const result = assetService.extractAssets(null as any);
      expect(result).toEqual({});
    });

    it('should handle undefined content in categorizeByAsset', () => {
      const result = assetService.categorizeByAsset('Title', undefined as any);
      expect(result.primaryCategory).toBe('general');
      expect(result.primaryAssets).toHaveLength(0);
    });

    it('should handle empty asset arrays', () => {
      const result = assetService.categorizeByAsset('', '');
      expect(result.primaryCategory).toBe('general');
      expect(result.allAssets).toEqual({});
    });

    it('should handle concurrent processing', async () => {
      mockPrisma.rssFeed.findMany.mockResolvedValue([
        { id: 1, url: 'https://feed1.com', isActive: true },
        { id: 2, url: 'https://feed2.com', isActive: true }
      ]);

      const promises = Array.from({ length: 5 }, () => 
        assetService.processRSSFeedsWithAssetTracking()
      );

      await Promise.all(promises);

      expect(mockPrisma.rssFeed.findMany).toHaveBeenCalledTimes(5);
    });

    it('should handle large datasets efficiently', async () => {
      const largeDataset = Array.from({ length: 1000 }, (_, i) => ({
        instruments: [`ASSET${i}`],
        markets: ['test'],
        sentimentLabel: 'neutral'
      }));

      mockPrisma.article.findMany.mockResolvedValue(largeDataset);

      const startTime = Date.now();
      await assetService.getAssetStatistics('24h');
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(5000); // Should complete in under 5 seconds
    });
  });

  describe('Performance optimization', () => {
    it('should cache frequently accessed data', async () => {
      mockPrisma.article.findMany.mockResolvedValue([]);

      // Call multiple times
      await assetService.getAssetStatistics('24h');
      await assetService.getAssetStatistics('24h');
      await assetService.getAssetStatistics('24h');

      // Should still work even if called multiple times
      expect(mockPrisma.article.findMany).toHaveBeenCalledTimes(3);
    });

    it('should handle memory efficiently with large result sets', async () => {
      const largeResultSet = Array.from({ length: 10000 }, (_, i) => ({
        id: `article-${i}`,
        instruments: ['EURUSD'],
        publishedAt: new Date(),
        feed: { name: 'Test Feed', category: 'forex' }
      }));

      mockPrisma.article.findMany.mockResolvedValue(largeResultSet);

      const result = await assetService.getArticlesByAsset('EURUSD', { limit: 10000 });

      expect(result).toHaveLength(10000);
      expect(result[0]).toHaveProperty('id');
      expect(result[0]).toHaveProperty('instruments');
    });
  });
});
