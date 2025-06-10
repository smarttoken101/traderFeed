import { Router, Request, Response } from 'express';
import rssService from '../services/rss.service';
import CacheMiddleware from '../middleware/cache.middleware';
import PerformanceMonitorService from '../services/performance-monitor.service';
import QueryOptimizer from '../utils/query-optimizer';
import Database from '../config/database';
import logger from '../utils/logger';

const router = Router();

/**
 * GET /api/articles - Get all articles with filtering and caching
 */
router.get('/', 
  CacheMiddleware.cache({
    ttl: 300, // 5 minutes
    keyGenerator: CacheMiddleware.articleCacheKeyGenerator,
    condition: (req) => req.method === 'GET' && !req.query.real_time,
  }),
  async (req: Request, res: Response) => {
    try {
      const {
        page = 1,
        limit = 20,
        category,
        sentiment,
        market,
        dateFrom,
        dateTo,
        search,
      } = req.query;

      const pageNum = parseInt(page as string);
      const limitNum = Math.min(parseInt(limit as string), 100); // Cap at 100

      // Build optimized where clause
      const where: any = {};
      
      if (category) where.category = category;
      if (sentiment) where.sentimentLabel = sentiment;
      if (market) {
        where.markets = {
          has: market as string,
        };
      }
      if (search) {
        where.OR = [
          { title: { contains: search as string, mode: 'insensitive' } },
          { description: { contains: search as string, mode: 'insensitive' } },
        ];
      }
      if (dateFrom || dateTo) {
        where.publishedAt = {};
        if (dateFrom) where.publishedAt.gte = new Date(dateFrom as string);
        if (dateTo) where.publishedAt.lte = new Date(dateTo as string);
      }

      // Use query optimizer
      const optimizedQuery = QueryOptimizer.optimizeArticleQuery({
        where,
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
      });

      const prisma = Database.getInstance();

      // Execute optimized query with performance monitoring
      const [articles, totalCount] = await Promise.all([
        PerformanceMonitorService.monitorDatabaseQuery(
          'articles.findMany',
          () => prisma.article.findMany(optimizedQuery.query)
        ),
        PerformanceMonitorService.monitorDatabaseQuery(
          'articles.count',
          () => prisma.article.count({ where: optimizedQuery.query.where })
        ),
      ]);

      // Get pagination metadata
      const pagination = await QueryOptimizer.getPaginationMetadata(
        prisma,
        'articles',
        where,
        pageNum,
        limitNum
      );

      res.json({
        success: true,
        data: {
          articles,
          pagination: {
            ...pagination,
            totalCount,
          },
        },
      });
    } catch (error) {
      logger.error('Error fetching articles:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch articles',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * GET /api/articles/sentiment-stats - Get sentiment statistics with caching
 */
router.get('/sentiment-stats',
  CacheMiddleware.cache({
    ttl: 900, // 15 minutes (sentiment stats change less frequently)
    keyGenerator: (req) => 'api:articles:sentiment-stats',
  }),
  async (req: Request, res: Response) => {
    try {
      const prisma = Database.getInstance();
      
      const stats = await PerformanceMonitorService.monitorDatabaseQuery(
        'articles.sentimentStats',
        async () => {
          const [positive, negative, neutral, total] = await Promise.all([
            prisma.article.count({ where: { sentimentLabel: 'positive' } }),
            prisma.article.count({ where: { sentimentLabel: 'negative' } }),
            prisma.article.count({ where: { sentimentLabel: 'neutral' } }),
            prisma.article.count(),
          ]);

          return {
            positive,
            negative,
            neutral,
            total,
            positivePercentage: total > 0 ? Math.round((positive / total) * 100) : 0,
            negativePercentage: total > 0 ? Math.round((negative / total) * 100) : 0,
            neutralPercentage: total > 0 ? Math.round((neutral / total) * 100) : 0,
          };
        }
      );
      
      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      logger.error('Error fetching sentiment stats:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch sentiment statistics',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * POST /api/articles/process - Manually trigger RSS feed processing
 */
router.post('/process', async (req: Request, res: Response) => {
  try {
    await rssService.processRSSFeeds();
    
    res.json({
      success: true,
      message: 'RSS feeds processed successfully',
    });
  } catch (error) {
    logger.error('Error processing RSS feeds:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process RSS feeds',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/articles/categories - Get available categories with caching
 */
router.get('/categories',
  CacheMiddleware.cache({
    ttl: 3600, // 1 hour (categories rarely change)
    keyGenerator: (req) => 'api:articles:categories',
  }),
  async (req: Request, res: Response) => {
    try {
      const prisma = Database.getInstance();
      
      const categories = await PerformanceMonitorService.monitorDatabaseQuery(
        'feeds.distinct.category',
        () => prisma.rssFeed.findMany({
          select: { category: true },
          distinct: ['category'],
          where: { isActive: true },
        })
      );
      
      const categoryList = categories.map(c => c.category);
      
      res.json({
        success: true,
        data: categoryList,
      });
    } catch (error) {
      logger.error('Error fetching categories:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch categories',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * GET /api/articles/instruments - Get detected instruments with caching
 */
router.get('/instruments',
  CacheMiddleware.cache({
    ttl: 1800, // 30 minutes
    keyGenerator: (req) => 'api:articles:instruments',
  }),
  async (req: Request, res: Response) => {
    try {
      const prisma = Database.getInstance();
      
      const instrumentsData = await PerformanceMonitorService.monitorDatabaseQuery(
        'articles.distinct.instruments',
        async () => {
          const articles = await prisma.article.findMany({
            select: { instruments: true },
            where: {
              instruments: { isEmpty: false },
              publishedAt: {
                gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
              },
            },
          });

          // Flatten and get unique instruments
          const allInstruments = articles.flatMap(a => a.instruments);
          return [...new Set(allInstruments)].sort();
        }
      );
      
      res.json({
        success: true,
        data: instrumentsData,
      });
    } catch (error) {
      logger.error('Error fetching instruments:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch instruments',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

export default router;
