import cron, { ScheduledTask } from 'node-cron';
import assetMonitorService from '../services/asset-monitor.service';
import logger from '../utils/logger';

export class RSSMonitorJob {
  private isRunning: boolean = false;
  private jobs: ScheduledTask[] = [];

  /**
   * Start RSS monitoring with different intervals
   */
  startMonitoring(): void {
    try {
      logger.info('Starting RSS monitoring jobs...');

      // Every 15 minutes for high-priority feeds (forex, crypto)
      const highFrequencyJob = cron.schedule('*/15 * * * *', async () => {
        if (this.isRunning) {
          logger.warn('RSS processing already running, skipping this cycle');
          return;
        }

        try {
          this.isRunning = true;
          logger.info('Starting high-frequency RSS processing...');
          await assetMonitorService.processRSSFeedsWithAssetTracking();
          logger.info('High-frequency RSS processing completed');
        } catch (error) {
          logger.error('Error in high-frequency RSS processing:', error);
        } finally {
          this.isRunning = false;
        }
      });

      // Every hour for comprehensive monitoring
      const hourlyJob = cron.schedule('0 * * * *', async () => {
        try {
          logger.info('Starting hourly asset statistics update...');
          const stats = await assetMonitorService.getAssetStatistics('24h');
          logger.info(`Asset statistics updated - ${stats.totalArticles} articles processed`);
        } catch (error) {
          logger.error('Error in hourly asset statistics update:', error);
        }
      });

      // Daily cleanup and maintenance at 2 AM
      const dailyMaintenanceJob = cron.schedule('0 2 * * *', async () => {
        try {
          logger.info('Starting daily maintenance...');
          
          // Clean up old articles (older than 30 days)
          await this.cleanupOldArticles();
          
          // Generate daily asset report
          await this.generateDailyAssetReport();
          
          logger.info('Daily maintenance completed');
        } catch (error) {
          logger.error('Error in daily maintenance:', error);
        }
      });

      // Start all jobs
      highFrequencyJob.start();
      hourlyJob.start();
      dailyMaintenanceJob.start();

      this.jobs = [highFrequencyJob, hourlyJob, dailyMaintenanceJob];

      logger.info('RSS monitoring jobs started successfully');
      logger.info('- High frequency (every 15 minutes): Asset-specific RSS processing');
      logger.info('- Hourly: Asset statistics update');
      logger.info('- Daily (2 AM): Maintenance and cleanup');

    } catch (error) {
      logger.error('Error starting RSS monitoring jobs:', error);
      throw error;
    }
  }

  /**
   * Stop all monitoring jobs
   */
  stopMonitoring(): void {
    try {
      logger.info('Stopping RSS monitoring jobs...');
      
      this.jobs.forEach(job => {
        job.stop();
        job.destroy();
      });
      
      this.jobs = [];
      logger.info('RSS monitoring jobs stopped successfully');
    } catch (error) {
      logger.error('Error stopping RSS monitoring jobs:', error);
    }
  }

  /**
   * Manually trigger RSS processing
   */
  async triggerManualProcessing(): Promise<{ processed: number; errors: number }> {
    if (this.isRunning) {
      throw new Error('RSS processing is already running');
    }

    try {
      this.isRunning = true;
      logger.info('Manual RSS processing triggered...');
      
      await assetMonitorService.processRSSFeedsWithAssetTracking();
      
      logger.info('Manual RSS processing completed successfully');
      return { processed: 1, errors: 0 };
    } catch (error) {
      logger.error('Error in manual RSS processing:', error);
      return { processed: 0, errors: 1 };
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Get monitoring status
   */
  getStatus(): {
    isRunning: boolean;
    activeJobs: number;
    nextRuns: string[];
  } {
    const nextRuns = this.jobs
      .filter(job => job.getStatus() === 'scheduled')
      .map(job => {
        try {
          return 'Next execution scheduled';
        } catch {
          return 'Unknown';
        }
      });

    return {
      isRunning: this.isRunning,
      activeJobs: this.jobs.length,
      nextRuns
    };
  }

  /**
   * Clean up old articles
   */
  private async cleanupOldArticles(): Promise<void> {
    try {
      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient();

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const deleteResult = await prisma.article.deleteMany({
        where: {
          publishedAt: {
            lt: thirtyDaysAgo
          }
        }
      });

      logger.info(`Cleaned up ${deleteResult.count} old articles`);
      await prisma.$disconnect();
    } catch (error) {
      logger.error('Error in cleanup old articles:', error);
    }
  }

  /**
   * Generate daily asset report
   */
  private async generateDailyAssetReport(): Promise<void> {
    try {
      logger.info('Generating daily asset report...');
      
      const stats24h = await assetMonitorService.getAssetStatistics('24h');
      const stats7d = await assetMonitorService.getAssetStatistics('7d');

      const report = {
        date: new Date().toISOString().split('T')[0],
        summary: {
          articles24h: stats24h.totalArticles,
          articles7d: stats7d.totalArticles,
          topAssets24h: stats24h.topAssets.slice(0, 10),
          topCategories24h: stats24h.topCategories.slice(0, 5)
        }
      };

      // Log the report (could also save to file or send via email)
      logger.info('Daily Asset Report:', JSON.stringify(report, null, 2));
      
    } catch (error) {
      logger.error('Error generating daily asset report:', error);
    }
  }

  /**
   * Process specific asset news
   */
  async processAssetSpecificNews(asset: string): Promise<any[]> {
    try {
      logger.info(`Processing news for specific asset: ${asset}`);
      
      // Get recent articles for this asset
      const articles = await assetMonitorService.getArticlesByAsset(asset, {
        limit: 50,
        dateFrom: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
      });

      logger.info(`Found ${articles.length} articles for asset ${asset}`);
      return articles;
    } catch (error) {
      logger.error(`Error processing asset-specific news for ${asset}:`, error);
      throw error;
    }
  }
}

export default new RSSMonitorJob();
