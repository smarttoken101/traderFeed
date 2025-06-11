import cron, { ScheduledTask } from 'node-cron';
import logger from '../utils/logger';
import SentimentService from '../services/sentiment.service';

export interface SentimentJobStatus {
  name: string;
  lastRun: Date | null;
  nextRun: Date | null;
  status: 'idle' | 'running' | 'error';
  duration?: number;
  error?: string;
  articlesProcessed?: number;
}

/**
 * Sentiment Analysis Job Scheduler
 * Manages automated sentiment processing for articles
 */
export class SentimentJobScheduler {
  private jobs = new Map<string, ScheduledTask>();
  private jobStatuses = new Map<string, SentimentJobStatus>();
  private sentimentService: SentimentService;

  constructor() {
    this.sentimentService = new SentimentService();
    this.initializeJobs();
  }

  /**
   * Initialize all scheduled jobs
   */
  private initializeJobs(): void {
    // Process sentiment for unprocessed articles every 5 minutes
    this.scheduleJob(
      'sentiment-processing',
      '*/5 * * * *', // Every 5 minutes
      this.processSentiment.bind(this),
      'Process sentiment analysis for unprocessed articles'
    );

    // Sentiment health check every hour
    this.scheduleJob(
      'sentiment-health-check',
      '0 * * * *', // Every hour
      this.performHealthCheck.bind(this),
      'Check sentiment processing health and statistics'
    );

    logger.info('Sentiment analysis job scheduler initialized with 2 jobs');
  }

  /**
   * Schedule a job with error handling and status tracking
   */
  private scheduleJob(
    name: string,
    cronExpression: string,
    jobFunction: () => Promise<void>,
    description: string
  ): void {
    try {
      // Validate cron expression
      if (!cron.validate(cronExpression)) {
        throw new Error(`Invalid cron expression: ${cronExpression}`);
      }

      // Initialize job status
      this.jobStatuses.set(name, {
        name,
        lastRun: null,
        nextRun: this.getNextRunTime(cronExpression),
        status: 'idle'
      });

      // Create scheduled task
      const task = cron.schedule(cronExpression, async () => {
        await this.executeJob(name, jobFunction);
      }, {
        timezone: 'UTC'
      });

      this.jobs.set(name, task);

      logger.info(`Scheduled sentiment job: ${name} - ${description}`, {
        cronExpression,
        nextRun: this.getNextRunTime(cronExpression)
      });
    } catch (error) {
      logger.error(`Failed to schedule sentiment job ${name}:`, error);
    }
  }

  /**
   * Execute a job with error handling and status tracking
   */
  private async executeJob(name: string, jobFunction: () => Promise<void>): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Update status to running
      this.updateJobStatus(name, {
        status: 'running',
        lastRun: new Date(),
        error: undefined
      });

      logger.info(`Starting sentiment job: ${name}`);
      
      // Execute the job function
      await jobFunction();
      
      const duration = Date.now() - startTime;
      
      // Update status to idle
      this.updateJobStatus(name, {
        status: 'idle',
        duration
      });

      logger.info(`Completed sentiment job: ${name} in ${duration}ms`);
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Update status to error
      this.updateJobStatus(name, {
        status: 'error',
        duration,
        error: errorMessage
      });

      logger.error(`Sentiment job failed: ${name}`, { error: errorMessage, duration });
    }
  }

  /**
   * Update job status
   */
  private updateJobStatus(name: string, updates: Partial<SentimentJobStatus>): void {
    const currentStatus = this.jobStatuses.get(name);
    if (currentStatus) {
      this.jobStatuses.set(name, { ...currentStatus, ...updates });
    }
  }

  /**
   * Process sentiment for unprocessed articles
   */
  private async processSentiment(): Promise<void> {
    try {
      // Get count of unprocessed articles before processing
      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient();
      
      const beforeCount = await prisma.article.count({
        where: { 
          isProcessed: false,
          processingError: null,
        }
      });

      if (beforeCount === 0) {
        logger.info('No unprocessed articles found for sentiment analysis');
        await prisma.$disconnect();
        return;
      }

      logger.info(`Found ${beforeCount} unprocessed articles for sentiment analysis`);

      // Process the articles
      await this.sentimentService.processUnprocessedArticles();

      // Get count after processing
      const afterCount = await prisma.article.count({
        where: { 
          isProcessed: false,
          processingError: null,
        }
      });

      const processed = beforeCount - afterCount;

      // Update job status with articles processed
      this.updateJobStatus('sentiment-processing', {
        articlesProcessed: processed
      });

      logger.info(`Sentiment processing completed: processed ${processed} articles, ${afterCount} remaining`);
      
      await prisma.$disconnect();
    } catch (error) {
      logger.error('Sentiment processing failed:', error);
      throw error;
    }
  }

  /**
   * Perform sentiment health check
   */
  private async performHealthCheck(): Promise<void> {
    try {
      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient();

      // Get processing statistics
      const totalArticles = await prisma.article.count();
      const processedArticles = await prisma.article.count({
        where: { isProcessed: true }
      });
      const unprocessedArticles = await prisma.article.count({
        where: { isProcessed: false }
      });
      const errorArticles = await prisma.article.count({
        where: { 
          isProcessed: true,
          processingError: { not: null }
        }
      });

      // Get sentiment distribution
      const sentimentStats = await this.sentimentService.getSentimentStats('24h');

      logger.info('Sentiment processing health check', {
        totalArticles,
        processedArticles,
        unprocessedArticles,
        errorArticles,
        processingRate: totalArticles > 0 ? Math.round((processedArticles / totalArticles) * 100) : 0,
        sentimentDistribution: sentimentStats.length
      });

      // Alert if too many unprocessed articles
      if (unprocessedArticles > 100) {
        logger.warn(`High number of unprocessed articles: ${unprocessedArticles}`);
      }

      // Alert if high error rate
      const errorRate = processedArticles > 0 ? (errorArticles / processedArticles) * 100 : 0;
      if (errorRate > 10) {
        logger.warn(`High sentiment processing error rate: ${errorRate.toFixed(2)}%`);
      }

      await prisma.$disconnect();
    } catch (error) {
      logger.error('Sentiment health check failed:', error);
      throw error;
    }
  }

  /**
   * Start all scheduled jobs
   */
  public startAll(): void {
    try {
      this.jobs.forEach((task, name) => {
        task.start();
        logger.info(`Started sentiment job: ${name}`);
      });
      
      logger.info(`Started ${this.jobs.size} sentiment analysis jobs`);
    } catch (error) {
      logger.error('Failed to start sentiment jobs:', error);
    }
  }

  /**
   * Stop all scheduled jobs
   */
  public stopAll(): void {
    try {
      this.jobs.forEach((task, name) => {
        task.stop();
        logger.info(`Stopped sentiment job: ${name}`);
      });
      
      logger.info(`Stopped ${this.jobs.size} sentiment analysis jobs`);
    } catch (error) {
      logger.error('Failed to stop sentiment jobs:', error);
    }
  }

  /**
   * Start specific job
   */
  public startJob(name: string): boolean {
    const task = this.jobs.get(name);
    if (task) {
      task.start();
      logger.info(`Started sentiment job: ${name}`);
      return true;
    }
    return false;
  }

  /**
   * Stop specific job
   */
  public stopJob(name: string): boolean {
    const task = this.jobs.get(name);
    if (task) {
      task.stop();
      logger.info(`Stopped sentiment job: ${name}`);
      return true;
    }
    return false;
  }

  /**
   * Manually trigger a job
   */
  public async triggerJob(name: string): Promise<boolean> {
    try {
      const jobFunctions: Record<string, () => Promise<void>> = {
        'sentiment-processing': this.processSentiment.bind(this),
        'sentiment-health-check': this.performHealthCheck.bind(this)
      };

      const jobFunction = jobFunctions[name];
      if (jobFunction) {
        await this.executeJob(name, jobFunction);
        return true;
      }
      
      logger.warn(`Sentiment job not found: ${name}`);
      return false;
    } catch (error) {
      logger.error(`Failed to trigger sentiment job ${name}:`, error);
      return false;
    }
  }

  /**
   * Get status of all jobs
   */
  public getJobStatuses(): SentimentJobStatus[] {
    return Array.from(this.jobStatuses.values());
  }

  /**
   * Get status of specific job
   */
  public getJobStatus(name: string): SentimentJobStatus | null {
    return this.jobStatuses.get(name) || null;
  }

  /**
   * Get next run time for cron expression
   */
  private getNextRunTime(cronExpression: string): Date | null {
    try {
      // This is a simplified implementation
      // In production, use a proper cron parser library
      return new Date(Date.now() + 60000); // Mock: next minute
    } catch (error) {
      logger.error('Failed to calculate next run time:', error);
      return null;
    }
  }

  /**
   * Get scheduler statistics
   */
  public getStatistics(): {
    totalJobs: number;
    runningJobs: number;
    idleJobs: number;
    errorJobs: number;
    lastActivity: Date | null;
    totalArticlesProcessed: number;
  } {
    const statuses = Array.from(this.jobStatuses.values());
    
    return {
      totalJobs: statuses.length,
      runningJobs: statuses.filter(s => s.status === 'running').length,
      idleJobs: statuses.filter(s => s.status === 'idle').length,
      errorJobs: statuses.filter(s => s.status === 'error').length,
      lastActivity: statuses
        .map(s => s.lastRun)
        .filter(Boolean)
        .sort((a, b) => b!.getTime() - a!.getTime())[0] || null,
      totalArticlesProcessed: statuses
        .reduce((sum, s) => sum + (s.articlesProcessed || 0), 0)
    };
  }
}

// Export singleton instance
export default new SentimentJobScheduler();
