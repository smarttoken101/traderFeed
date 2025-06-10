import { Router, Request, Response } from 'express';
import rssService from '../services/rss.service';
import logger from '../utils/logger';

const router = Router();

/**
 * GET /api/articles - Get all articles with filtering
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const {
      page = 1,
      limit = 20,
      category,
      sentiment,
      instruments,
    } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const offset = (pageNum - 1) * limitNum;

    // Parse instruments if provided
    let instrumentsArray: string[] = [];
    if (instruments) {
      instrumentsArray = Array.isArray(instruments) 
        ? instruments as string[] 
        : (instruments as string).split(',');
    }

    const filters = {
      category: category as string,
      sentiment: sentiment as string,
      limit: limitNum,
      offset: offset,
      instruments: instrumentsArray.length > 0 ? instrumentsArray : undefined,
    };

    const articles = await rssService.getArticles(filters);

    res.json({
      success: true,
      data: {
        articles,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: articles.length,
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
});

/**
 * GET /api/articles/sentiment-stats - Get sentiment statistics
 */
router.get('/sentiment-stats', async (req: Request, res: Response) => {
  try {
    const stats = await rssService.getSentimentStats();
    
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
});

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
 * GET /api/articles/categories - Get available categories
 */
router.get('/categories', async (req: Request, res: Response) => {
  try {
    const categories = ['forex', 'crypto', 'futures', 'general'];
    
    res.json({
      success: true,
      data: categories,
    });
  } catch (error) {
    logger.error('Error fetching categories:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch categories',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/articles/instruments - Get detected instruments
 */
router.get('/instruments', async (req: Request, res: Response) => {
  try {
    // This would ideally come from the database
    const instruments = [
      'EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'NZDUSD', 'USDCHF',
      'BITCOIN', 'ETHEREUM', 'BTC', 'ETH', 'XRP', 'LTC', 'ADA',
      'GOLD', 'SILVER', 'OIL', 'CRUDE', 'NATURAL GAS', 'WHEAT', 'CORN'
    ];
    
    res.json({
      success: true,
      data: instruments,
    });
  } catch (error) {
    logger.error('Error fetching instruments:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch instruments',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
