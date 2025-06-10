import fs from 'fs';
import path from 'path';
import csv from 'csv-parser';
import logger from '../utils/logger';

interface RSSFeedConfig {
  category: string;
  name: string;
  url: string;
}

export class FeedConfigService {
  private feedsConfigPath = path.join(__dirname, '../../../rss.txt');
  private feeds: RSSFeedConfig[] = [];

  /**
   * Load RSS feeds from CSV configuration file
   */
  async loadFeedsFromConfig(): Promise<RSSFeedConfig[]> {
    return new Promise((resolve, reject) => {
      const feeds: RSSFeedConfig[] = [];
      
      if (!fs.existsSync(this.feedsConfigPath)) {
        logger.error(`RSS feeds config file not found at: ${this.feedsConfigPath}`);
        reject(new Error('RSS feeds config file not found'));
        return;
      }

      fs.createReadStream(this.feedsConfigPath)
        .pipe(csv())
        .on('data', (row: any) => {
          // Handle the CSV columns: Category, Name, RSS URL
          if (row.Category && row.Name && row['RSS URL']) {
            feeds.push({
              category: row.Category.toLowerCase(),
              name: row.Name,
              url: row['RSS URL']
            });
          }
        })
        .on('end', () => {
          this.feeds = feeds;
          logger.info(`Loaded ${feeds.length} RSS feeds from configuration`);
          resolve(feeds);
        })
        .on('error', (error) => {
          logger.error('Error loading RSS feeds config:', error);
          reject(error);
        });
    });
  }

  /**
   * Get feeds by category
   */
  getFeedsByCategory(category: string): RSSFeedConfig[] {
    return this.feeds.filter(feed => 
      feed.category.toLowerCase() === category.toLowerCase()
    );
  }

  /**
   * Get all feeds
   */
  getAllFeeds(): RSSFeedConfig[] {
    return this.feeds;
  }

  /**
   * Get feeds grouped by category
   */
  getFeedsGroupedByCategory(): Record<string, RSSFeedConfig[]> {
    const grouped: Record<string, RSSFeedConfig[]> = {};
    
    this.feeds.forEach(feed => {
      if (!grouped[feed.category]) {
        grouped[feed.category] = [];
      }
      grouped[feed.category].push(feed);
    });
    
    return grouped;
  }

  /**
   * Get feed statistics
   */
  getFeedStats(): Record<string, number> {
    const stats: Record<string, number> = {};
    
    this.feeds.forEach(feed => {
      stats[feed.category] = (stats[feed.category] || 0) + 1;
    });
    
    return stats;
  }
}

export default new FeedConfigService();
