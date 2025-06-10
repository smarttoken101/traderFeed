import { Router, Request, Response } from 'express';
import rssService from '../services/rss.service';
import logger from '../utils/logger';

const router = Router();

/**
 * GET /api/feeds - Get all RSS feeds
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const feeds = await rssService.getAllFeeds();
    res.json(feeds);
  } catch (error) {
    logger.error('Error fetching RSS feeds:', error);
    res.status(500).json({ error: 'Failed to fetch RSS feeds' });
  }
});

/**
 * POST /api/feeds - Add a new RSS feed
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, url, category } = req.body;

    if (!name || !url || !category) {
      return res.status(400).json({ error: 'Name, URL, and category are required' });
    }

    const feed = await rssService.addFeed(name, url, category);
    return res.status(201).json(feed);
  } catch (error) {
    logger.error('Error adding RSS feed:', error);
    return res.status(500).json({ error: 'Failed to add RSS feed' });
  }
});

/**
 * POST /api/feeds/process - Process all RSS feeds
 */
router.post('/process', async (req: Request, res: Response) => {
  try {
    // Start processing in background
    rssService.processAllFeeds().catch(error => {
      logger.error('Background RSS processing failed:', error);
    });

    res.json({ message: 'RSS feed processing started' });
  } catch (error) {
    logger.error('Error starting RSS processing:', error);
    res.status(500).json({ error: 'Failed to start RSS processing' });
  }
});

/**
 * POST /api/feeds/:id/process - Process a specific RSS feed
 */
router.post('/:id/process', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const feed = await rssService.prisma.rssFeed.findUnique({
      where: { id },
    });

    if (!feed) {
      return res.status(404).json({ error: 'Feed not found' });
    }

    // Process the specific feed
    const articles = await rssService.parseFeed(feed.url);
    const savedCount = await rssService.saveArticles(articles, feed.id);

    // Update feed status
    await rssService.prisma.rssFeed.update({
      where: { id },
      data: { 
        lastFetched: new Date(),
        fetchError: null,
      },
    });

    return res.json({
      message: `Processed feed: ${feed.name}`,
      articlesFound: articles.length,
      newArticles: savedCount,
    });
  } catch (error) {
    logger.error('Error processing specific feed:', error);
    return res.status(500).json({ error: 'Failed to process feed' });
  }
});

/**
 * PUT /api/feeds/:id - Update RSS feed
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, url, category, isActive } = req.body;

    const feed = await rssService.prisma.rssFeed.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(url && { url }),
        ...(category && { category }),
        ...(typeof isActive === 'boolean' && { isActive }),
      },
    });

    res.json(feed);
  } catch (error) {
    logger.error('Error updating RSS feed:', error);
    res.status(500).json({ error: 'Failed to update RSS feed' });
  }
});

/**
 * DELETE /api/feeds/:id - Delete RSS feed
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await rssService.prisma.rssFeed.delete({
      where: { id },
    });

    res.json({ message: 'RSS feed deleted successfully' });
  } catch (error) {
    logger.error('Error deleting RSS feed:', error);
    res.status(500).json({ error: 'Failed to delete RSS feed' });
  }
});

/**
 * POST /api/feeds/initialize - Initialize default feeds
 */
router.post('/initialize', async (req: Request, res: Response) => {
  try {
    await rssService.initializeDefaultFeeds();
    res.json({ message: 'Default RSS feeds initialized' });
  } catch (error) {
    logger.error('Error initializing default feeds:', error);
    res.status(500).json({ error: 'Failed to initialize default feeds' });
  }
});

export default router;
