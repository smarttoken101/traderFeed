import { RSSService } from '../../services/rss.service';
import { PrismaClient } from '@prisma/client';
import Parser from 'rss-parser';
import logger from '../../utils/logger';

// Mock dependencies
jest.mock('@prisma/client');
jest.mock('rss-parser');
jest.mock('../../utils/logger');

// Mock data
const mockFeedData = {
  id: 'feed-123',
  name: 'Test Feed',
  url: 'https://example.com/rss',
  category: 'forex',
  isActive: true,
  lastFetched: null,
  fetchError: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockArticleData = {
  id: 'article-123',
  title: 'EURUSD Shows Strong Bullish Movement',
  description: 'EUR/USD pair continues its upward trend...',
  link: 'https://example.com/article/123',
  author: 'Test Author',
  publishedAt: new Date(),
  feedId: 'feed-123',
  markets: ['forex'],
  instruments: ['EURUSD'],
  isProcessed: false,
};

const mockRSSItems = [
  {
    title: 'EURUSD Shows Strong Bullish Movement',
    content: 'EUR/USD pair continues its upward trend with strong fundamentals supporting the euro.',
    link: 'https://example.com/article/123',
    pubDate: new Date().toISOString(),
    contentSnippet: 'EUR/USD pair continues its upward trend...',
    creator: 'Test Author',
  },
  {
    title: 'Bitcoin Reaches New Heights',
    content: 'Bitcoin surges to new all-time highs as institutional adoption increases.',
    link: 'https://example.com/article/124',
    pubDate: new Date().toISOString(),
    contentSnippet: 'Bitcoin surges to new all-time highs...',
  },
];

describe('RSSService', () => {
  let rssService: RSSService;
  let mockPrisma: jest.Mocked<PrismaClient>;
  let mockParser: jest.Mocked<Parser>;

  beforeEach(() => {
    // Setup mocks
    mockPrisma = {
      rssFeed: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
      },
      article: {
        findFirst: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
      },
      $disconnect: jest.fn(),
    } as any;

    mockParser = {
      parseURL: jest.fn(),
    } as any;

    // Mock Parser constructor
    (Parser as jest.MockedClass<typeof Parser>).mockImplementation(() => mockParser);

    rssService = new RSSService();
    rssService.prisma = mockPrisma;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('processFeed', () => {
    it('should successfully process a new RSS feed', async () => {
      // Setup mocks
      mockPrisma.rssFeed.findUnique.mockResolvedValue(null);
      mockPrisma.rssFeed.create.mockResolvedValue(mockFeedData);
      mockPrisma.article.findFirst.mockResolvedValue(null);
      mockPrisma.article.create.mockResolvedValue(mockArticleData);
      mockPrisma.rssFeed.update.mockResolvedValue(mockFeedData);

      mockParser.parseURL.mockResolvedValue({
        title: 'Test Feed',
        description: 'Test Description',
        items: mockRSSItems,
      } as any);

      // Execute
      await rssService.processFeed('https://example.com/rss', 'forex');

      // Verify
      expect(mockPrisma.rssFeed.findUnique).toHaveBeenCalledWith({
        where: { url: 'https://example.com/rss' }
      });
      expect(mockPrisma.rssFeed.create).toHaveBeenCalledWith({
        data: {
          name: 'forex feed',
          url: 'https://example.com/rss',
          category: 'forex',
          isActive: true
        }
      });
      expect(mockParser.parseURL).toHaveBeenCalledWith('https://example.com/rss');
      expect(mockPrisma.article.create).toHaveBeenCalledTimes(2);
      expect(mockPrisma.rssFeed.update).toHaveBeenCalledWith({
        where: { id: 'feed-123' },
        data: {
          lastFetched: expect.any(Date),
          fetchError: null
        }
      });
    });

    it('should use existing feed if it already exists', async () => {
      // Setup mocks
      mockPrisma.rssFeed.findUnique.mockResolvedValue(mockFeedData);
      mockPrisma.article.findFirst.mockResolvedValue(null);
      mockPrisma.article.create.mockResolvedValue(mockArticleData);
      mockPrisma.rssFeed.update.mockResolvedValue(mockFeedData);

      mockParser.parseURL.mockResolvedValue({
        title: 'Test Feed',
        description: 'Test Description',
        items: mockRSSItems,
      } as any);

      // Execute
      await rssService.processFeed('https://example.com/rss', 'forex');

      // Verify
      expect(mockPrisma.rssFeed.findUnique).toHaveBeenCalledWith({
        where: { url: 'https://example.com/rss' }
      });
      expect(mockPrisma.rssFeed.create).not.toHaveBeenCalled();
      expect(mockPrisma.article.create).toHaveBeenCalledTimes(2);
    });

    it('should skip existing articles', async () => {
      // Setup mocks
      mockPrisma.rssFeed.findUnique.mockResolvedValue(mockFeedData);
      mockPrisma.article.findFirst
        .mockResolvedValueOnce(mockArticleData) // First article exists
        .mockResolvedValueOnce(null); // Second article doesn't exist
      mockPrisma.article.create.mockResolvedValue(mockArticleData);
      mockPrisma.rssFeed.update.mockResolvedValue(mockFeedData);

      mockParser.parseURL.mockResolvedValue({
        title: 'Test Feed',
        description: 'Test Description',
        items: mockRSSItems,
      } as any);

      // Execute
      await rssService.processFeed('https://example.com/rss', 'forex');

      // Verify
      expect(mockPrisma.article.create).toHaveBeenCalledTimes(1); // Only one new article
    });

    it('should skip items without title or link', async () => {
      // Setup mocks
      mockPrisma.rssFeed.findUnique.mockResolvedValue(mockFeedData);
      mockPrisma.rssFeed.update.mockResolvedValue(mockFeedData);

      const invalidItems = [
        { title: '', content: 'content', link: 'https://example.com/1' },
        { title: 'title', content: 'content', link: '' },
        { content: 'content only' },
      ];

      mockParser.parseURL.mockResolvedValue({
        title: 'Test Feed',
        description: 'Test Description',
        items: invalidItems,
      } as any);

      // Execute
      await rssService.processFeed('https://example.com/rss', 'forex');

      // Verify
      expect(mockPrisma.article.create).not.toHaveBeenCalled();
    });

    it('should handle empty feed gracefully', async () => {
      // Setup mocks
      mockPrisma.rssFeed.findUnique.mockResolvedValue(mockFeedData);

      mockParser.parseURL.mockResolvedValue({
        title: 'Empty Feed',
        description: 'Empty Description',
        items: [],
      } as any);

      // Execute
      await rssService.processFeed('https://example.com/rss', 'forex');

      // Verify
      expect(mockPrisma.article.create).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith('No items found in feed: https://example.com/rss');
    });

    it('should handle feed parsing errors', async () => {
      // Setup mocks
      const parseError = new Error('Failed to parse RSS feed');
      mockParser.parseURL.mockRejectedValue(parseError);

      // Execute
      await rssService.processFeed('https://example.com/rss', 'forex');

      // Verify
      expect(logger.error).toHaveBeenCalledWith(
        'Error processing RSS feed https://example.com/rss:',
        parseError
      );
    });
  });

  describe('categorizeContent', () => {
    it('should categorize forex content correctly', () => {
      const title = 'EURUSD Analysis';
      const content = 'EUR/USD shows strong bullish momentum';
      const category = 'forex';

      const result = rssService.categorizeContent(title, content, category);

      expect(result).toContain('forex');
    });

    it('should categorize crypto content correctly', () => {
      const title = 'Bitcoin Price Update';
      const content = 'Bitcoin reaches new all-time high';
      const category = 'crypto';

      const result = rssService.categorizeContent(title, content, category);

      expect(result).toContain('crypto');
    });

    it('should detect multiple markets in content', () => {
      const title = 'Market Analysis';
      const content = 'EURUSD and Bitcoin both showing strength while Gold futures decline';
      const category = 'general';

      const result = rssService.categorizeContent(title, content, category);

      expect(result.length).toBeGreaterThan(1);
    });
  });

  describe('extractInstruments', () => {
    it('should extract forex pairs correctly', () => {
      const text = 'EURUSD and GBPUSD are showing strong momentum';

      const result = rssService.extractInstruments(text);

      expect(result).toContain('EURUSD');
      expect(result).toContain('GBPUSD');
    });

    it('should extract crypto symbols correctly', () => {
      const text = 'Bitcoin (BTC) and Ethereum (ETH) prices surge';

      const result = rssService.extractInstruments(text);

      expect(result).toContain('BTC');
      expect(result).toContain('ETH');
    });

    it('should extract commodity symbols correctly', () => {
      const text = 'Gold and Silver prices continue to rise';

      const result = rssService.extractInstruments(text);

      expect(result).toContain('GOLD');
      expect(result).toContain('SILVER');
    });

    it('should return empty array for text without instruments', () => {
      const text = 'General market news without specific instruments';

      const result = rssService.extractInstruments(text);

      expect(result).toEqual([]);
    });
  });

  describe('getArticles', () => {
    it('should return articles with default pagination', async () => {
      const mockArticles = [mockArticleData];
      mockPrisma.article.findMany.mockResolvedValue(mockArticles);

      const result = await rssService.getArticles({});

      expect(mockPrisma.article.findMany).toHaveBeenCalledWith({
        include: {
          feed: {
            select: {
              name: true,
              category: true
            }
          }
        },
        orderBy: { publishedAt: 'desc' },
        take: 20,
        skip: 0
      });
      expect(result).toEqual(mockArticles);
    });

    it('should apply filters correctly', async () => {
      const mockArticles = [mockArticleData];
      mockPrisma.article.findMany.mockResolvedValue(mockArticles);

      const filters = {
        category: 'forex',
        sentiment: 'positive',
        limit: 10,
        offset: 5,
        instruments: ['EURUSD']
      };

      await rssService.getArticles(filters);

      expect(mockPrisma.article.findMany).toHaveBeenCalledWith({
        where: {
          feed: {
            category: 'forex'
          },
          sentimentLabel: 'positive',
          instruments: {
            hasSome: ['EURUSD']
          }
        },
        include: {
          feed: {
            select: {
              name: true,
              category: true
            }
          }
        },
        orderBy: { publishedAt: 'desc' },
        take: 10,
        skip: 5
      });
    });
  });

  describe('processRSSFeeds', () => {
    it('should process multiple feeds successfully', async () => {
      const mockFeeds = [
        { ...mockFeedData, id: 'feed-1', url: 'https://feed1.com/rss' },
        { ...mockFeedData, id: 'feed-2', url: 'https://feed2.com/rss' },
      ];

      mockPrisma.rssFeed.findMany.mockResolvedValue(mockFeeds);

      // Mock successful processing for both feeds
      jest.spyOn(rssService, 'processFeed').mockResolvedValue();

      await rssService.processRSSFeeds();

      expect(mockPrisma.rssFeed.findMany).toHaveBeenCalledWith({
        where: { isActive: true }
      });
      expect(rssService.processFeed).toHaveBeenCalledTimes(2);
      expect(rssService.processFeed).toHaveBeenCalledWith('https://feed1.com/rss', 'forex');
      expect(rssService.processFeed).toHaveBeenCalledWith('https://feed2.com/rss', 'forex');
    });

    it('should continue processing other feeds when one fails', async () => {
      const mockFeeds = [
        { ...mockFeedData, id: 'feed-1', url: 'https://feed1.com/rss' },
        { ...mockFeedData, id: 'feed-2', url: 'https://feed2.com/rss' },
      ];

      mockPrisma.rssFeed.findMany.mockResolvedValue(mockFeeds);

      jest.spyOn(rssService, 'processFeed')
        .mockRejectedValueOnce(new Error('Feed 1 failed'))
        .mockResolvedValueOnce();

      await rssService.processRSSFeeds();

      expect(rssService.processFeed).toHaveBeenCalledTimes(2);
      expect(logger.error).toHaveBeenCalledWith(
        'Error processing feed https://feed1.com/rss:',
        expect.any(Error)
      );
    });
  });

  describe('getSentimentStats', () => {
    it('should return sentiment statistics', async () => {
      mockPrisma.article.count
        .mockResolvedValueOnce(100) // total
        .mockResolvedValueOnce(40)  // positive
        .mockResolvedValueOnce(35)  // negative
        .mockResolvedValueOnce(25); // neutral

      const result = await rssService.getSentimentStats();

      expect(result).toEqual({
        total: 100,
        positive: 40,
        negative: 35,
        neutral: 25,
        positivePercentage: 40,
        negativePercentage: 35,
        neutralPercentage: 25
      });
    });

    it('should handle zero articles gracefully', async () => {
      mockPrisma.article.count.mockResolvedValue(0);

      const result = await rssService.getSentimentStats();

      expect(result).toEqual({
        total: 0,
        positive: 0,
        negative: 0,
        neutral: 0,
        positivePercentage: 0,
        negativePercentage: 0,
        neutralPercentage: 0
      });
    });
  });
});
