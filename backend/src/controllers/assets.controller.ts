import { Router, Request, Response } from 'express';
import assetMonitorService from '../services/asset-monitor.service';
import rssMonitorJob from '../jobs/rss-monitor.job';
import logger from '../utils/logger';

const router = Router();

/**
 * GET /api/assets - Get list of all tracked assets
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { ASSET_MAPPING } = await import('../services/asset-monitor.service');
    
    const assetCategories = Object.keys(ASSET_MAPPING).map(category => ({
      category,
      assets: Object.keys(ASSET_MAPPING[category as keyof typeof ASSET_MAPPING])
    }));

    res.json({
      success: true,
      data: {
        categories: assetCategories,
        totalAssets: assetCategories.reduce((sum, cat) => sum + cat.assets.length, 0)
      }
    });
  } catch (error) {
    logger.error('Error fetching assets:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch assets',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/assets/:asset/news - Get news for specific asset
 */
router.get('/:asset/news', async (req: Request, res: Response) => {
  try {
    const { asset } = req.params;
    const { 
      limit = 50, 
      offset = 0,
      dateFrom,
      dateTo 
    } = req.query;

    const options: any = {
      limit: parseInt(limit as string),
      offset: parseInt(offset as string)
    };

    if (dateFrom) options.dateFrom = new Date(dateFrom as string);
    if (dateTo) options.dateTo = new Date(dateTo as string);

    const articles = await assetMonitorService.getArticlesByAsset(asset.toUpperCase(), options);

    res.json({
      success: true,
      data: {
        asset: asset.toUpperCase(),
        articles,
        count: articles.length,
        hasMore: articles.length === options.limit
      }
    });
  } catch (error) {
    logger.error(`Error fetching news for asset ${req.params.asset}:`, error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch asset news',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/assets/statistics - Get asset mention statistics
 */
router.get('/statistics', async (req: Request, res: Response) => {
  try {
    const { timeframe = '24h' } = req.query;
    
    if (!['24h', '7d', '30d'].includes(timeframe as string)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid timeframe. Use 24h, 7d, or 30d'
      });
    }

    const stats = await assetMonitorService.getAssetStatistics(timeframe as '24h' | '7d' | '30d');

    return res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Error fetching asset statistics:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch asset statistics',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/assets/process - Manually trigger RSS processing
 */
router.post('/process', async (req: Request, res: Response) => {
  try {
    const result = await rssMonitorJob.triggerManualProcessing();

    res.json({
      success: true,
      message: 'RSS processing triggered successfully',
      data: result
    });
  } catch (error) {
    logger.error('Error triggering RSS processing:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to trigger RSS processing',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/assets/monitor/status - Get monitoring job status
 */
router.get('/monitor/status', async (req: Request, res: Response) => {
  try {
    const status = rssMonitorJob.getStatus();

    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    logger.error('Error fetching monitor status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch monitor status',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/assets/monitor/start - Start monitoring jobs
 */
router.post('/monitor/start', async (req: Request, res: Response) => {
  try {
    rssMonitorJob.startMonitoring();

    res.json({
      success: true,
      message: 'RSS monitoring started successfully'
    });
  } catch (error) {
    logger.error('Error starting RSS monitoring:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to start RSS monitoring',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/assets/monitor/stop - Stop monitoring jobs
 */
router.post('/monitor/stop', async (req: Request, res: Response) => {
  try {
    rssMonitorJob.stopMonitoring();

    res.json({
      success: true,
      message: 'RSS monitoring stopped successfully'
    });
  } catch (error) {
    logger.error('Error stopping RSS monitoring:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to stop RSS monitoring',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/assets/initialize - Initialize feeds from CSV
 */
router.post('/initialize', async (req: Request, res: Response) => {
  try {
    await assetMonitorService.initializeFeedsFromCSV();

    res.json({
      success: true,
      message: 'RSS feeds initialized from CSV successfully'
    });
  } catch (error) {
    logger.error('Error initializing feeds from CSV:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to initialize feeds from CSV',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/assets/categories/:category/news - Get news by category
 */
router.get('/categories/:category/news', async (req: Request, res: Response) => {
  try {
    const { category } = req.params;
    const { 
      limit = 50, 
      offset = 0,
      dateFrom,
      dateTo 
    } = req.query;

    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();

    const where: any = {
      markets: {
        has: category.toLowerCase()
      }
    };

    if (dateFrom || dateTo) {
      where.publishedAt = {};
      if (dateFrom) where.publishedAt.gte = new Date(dateFrom as string);
      if (dateTo) where.publishedAt.lte = new Date(dateTo as string);
    }

    const articles = await prisma.article.findMany({
      where,
      orderBy: { publishedAt: 'desc' },
      take: parseInt(limit as string),
      skip: parseInt(offset as string),
      include: {
        feed: {
          select: {
            name: true,
            category: true
          }
        }
      }
    });

    await prisma.$disconnect();

    res.json({
      success: true,
      data: {
        category,
        articles,
        count: articles.length,
        hasMore: articles.length === parseInt(limit as string)
      }
    });
  } catch (error) {
    logger.error(`Error fetching news for category ${req.params.category}:`, error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch category news',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/assets/trending - Get trending assets
 */
router.get('/trending', async (req: Request, res: Response) => {
  try {
    const { timeframe = '24h' } = req.query;
    
    const stats = await assetMonitorService.getAssetStatistics(timeframe as '24h' | '7d' | '30d');
    
    // Get top 10 trending assets
    const trending = stats.topAssets.slice(0, 10).map((item: any, index: number) => ({
      rank: index + 1,
      asset: item.asset,
      mentions: item.mentions,
      sentiment: item.sentiment,
      change: index === 0 ? 0 : stats.topAssets[index - 1].mentions - item.mentions
    }));

    res.json({
      success: true,
      data: {
        timeframe,
        trending,
        lastUpdated: stats.lastUpdated
      }
    });
  } catch (error) {
    logger.error('Error fetching trending assets:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch trending assets',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
