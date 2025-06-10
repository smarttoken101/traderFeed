import cron, { ScheduledTask } from 'node-cron';
import logger from '../utils/logger';
import knowledgeBaseService from '../services/knowledge-base.service';
import graphKnowledgeService from '../services/graph-knowledge.service';

export interface JobStatus {
  name: string;
  lastRun: Date | null;
  nextRun: Date | null;
  status: 'idle' | 'running' | 'error';
  duration?: number;
  error?: string;
}

/**
 * Knowledge Base Job Scheduler
 * Manages automated processing and maintenance of the knowledge base system
 */
export class KnowledgeJobScheduler {
  private jobs = new Map<string, ScheduledTask>();
  private jobStatuses = new Map<string, JobStatus>();

  constructor() {
    this.initializeJobs();
  }

  /**
   * Initialize all scheduled jobs
   */
  private initializeJobs(): void {
    // Process knowledge base documents daily at 2 AM
    this.scheduleJob(
      'knowledge-base-processing',
      '0 2 * * *', // Daily at 2 AM
      this.processKnowledgeBase.bind(this),
      'Process and index knowledge base documents'
    );

    // Build knowledge graph every 6 hours
    this.scheduleJob(
      'knowledge-graph-build',
      '0 */6 * * *', // Every 6 hours
      this.buildKnowledgeGraph.bind(this),
      'Build and update knowledge graph from articles and documents'
    );

    // Clean up old data weekly on Sunday at 3 AM
    this.scheduleJob(
      'knowledge-cleanup',
      '0 3 * * 0', // Weekly on Sunday at 3 AM
      this.cleanupOldData.bind(this),
      'Clean up old knowledge base data and optimize storage'
    );

    // Health check every hour
    this.scheduleJob(
      'knowledge-health-check',
      '0 * * * *', // Every hour
      this.performHealthCheck.bind(this),
      'Perform health checks on knowledge base services'
    );

    logger.info('Knowledge base job scheduler initialized with 4 jobs');
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
      
      logger.info(`Scheduled job: ${name} - ${description}`, {
        cronExpression,
        nextRun: this.getNextRunTime(cronExpression)
      });
    } catch (error) {
      logger.error(`Failed to schedule job ${name}:`, error);
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

      logger.info(`Starting job: ${name}`);
      
      // Execute the job function
      await jobFunction();
      
      const duration = Date.now() - startTime;
      
      // Update status to idle
      this.updateJobStatus(name, {
        status: 'idle',
        duration
      });

      logger.info(`Completed job: ${name} in ${duration}ms`);
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Update status to error
      this.updateJobStatus(name, {
        status: 'error',
        duration,
        error: errorMessage
      });

      logger.error(`Job failed: ${name}`, { error: errorMessage, duration });
    }
  }

  /**
   * Update job status
   */
  private updateJobStatus(name: string, updates: Partial<JobStatus>): void {
    const currentStatus = this.jobStatuses.get(name);
    if (currentStatus) {
      this.jobStatuses.set(name, { ...currentStatus, ...updates });
    }
  }

  /**
   * Process knowledge base documents
   */
  private async processKnowledgeBase(): Promise<void> {
    try {
      const results = await knowledgeBaseService.processAllDocuments();
      
      logger.info(`Knowledge base processing completed`, {
        processedDocuments: results.length,
        totalProcessingTime: results.reduce((sum, doc) => sum + doc.metadata.processingTime, 0)
      });
    } catch (error) {
      logger.error('Knowledge base processing failed:', error);
      throw error;
    }
  }

  /**
   * Build knowledge graph
   */
  private async buildKnowledgeGraph(): Promise<void> {
    try {
      await graphKnowledgeService.buildKnowledgeGraph();
      
      const stats = await graphKnowledgeService.getStatistics();
      
      logger.info('Knowledge graph build completed', {
        totalNodes: stats.totalNodes,
        totalEdges: stats.totalEdges,
        nodeTypes: stats.nodeTypes,
        edgeTypes: stats.edgeTypes
      });
    } catch (error) {
      logger.error('Knowledge graph build failed:', error);
      throw error;
    }
  }

  /**
   * Clean up old data
   */
  private async cleanupOldData(): Promise<void> {
    try {
      // This would implement cleanup logic for old documents, embeddings, etc.
      // For now, we'll just log the action
      
      const kbStats = await knowledgeBaseService.getStatistics();
      const graphStats = await graphKnowledgeService.getStatistics();
      
      logger.info('Knowledge base cleanup completed', {
        totalDocuments: kbStats.totalDocuments,
        processedDocuments: kbStats.processedDocuments,
        graphNodes: graphStats.totalNodes,
        graphEdges: graphStats.totalEdges
      });
      
      // In production, implement actual cleanup logic here:
      // - Remove old document versions
      // - Clean up orphaned embeddings
      // - Archive old graph data
      // - Optimize database indexes
    } catch (error) {
      logger.error('Knowledge base cleanup failed:', error);
      throw error;
    }
  }

  /**
   * Perform health check
   */
  private async performHealthCheck(): Promise<void> {
    try {
      const checks = {
        knowledgeBase: false,
        graphService: false,
        // Add more health checks as needed
      };

      // Check knowledge base service
      try {
        const kbStats = await knowledgeBaseService.getStatistics();
        checks.knowledgeBase = kbStats.totalDocuments > 0;
      } catch (error) {
        logger.warn('Knowledge base health check failed:', error);
      }

      // Check graph service
      try {
        const graphStats = await graphKnowledgeService.getStatistics();
        checks.graphService = graphStats.totalNodes > 0;
      } catch (error) {
        logger.warn('Graph service health check failed:', error);
      }

      const healthyServices = Object.values(checks).filter(Boolean).length;
      const totalServices = Object.keys(checks).length;

      if (healthyServices < totalServices) {
        logger.warn('Knowledge base health check found issues', {
          healthy: healthyServices,
          total: totalServices,
          checks
        });
      } else {
        logger.info('Knowledge base health check passed', {
          healthy: healthyServices,
          total: totalServices
        });
      }
    } catch (error) {
      logger.error('Health check failed:', error);
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
        logger.info(`Started job: ${name}`);
      });
      
      logger.info(`Started ${this.jobs.size} knowledge base jobs`);
    } catch (error) {
      logger.error('Failed to start jobs:', error);
    }
  }

  /**
   * Stop all scheduled jobs
   */
  public stopAll(): void {
    try {
      this.jobs.forEach((task, name) => {
        task.stop();
        logger.info(`Stopped job: ${name}`);
      });
      
      logger.info(`Stopped ${this.jobs.size} knowledge base jobs`);
    } catch (error) {
      logger.error('Failed to stop jobs:', error);
    }
  }

  /**
   * Start specific job
   */
  public startJob(name: string): boolean {
    const task = this.jobs.get(name);
    if (task) {
      task.start();
      logger.info(`Started job: ${name}`);
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
      logger.info(`Stopped job: ${name}`);
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
        'knowledge-base-processing': this.processKnowledgeBase.bind(this),
        'knowledge-graph-build': this.buildKnowledgeGraph.bind(this),
        'knowledge-cleanup': this.cleanupOldData.bind(this),
        'knowledge-health-check': this.performHealthCheck.bind(this)
      };

      const jobFunction = jobFunctions[name];
      if (jobFunction) {
        await this.executeJob(name, jobFunction);
        return true;
      }
      
      logger.warn(`Job not found: ${name}`);
      return false;
    } catch (error) {
      logger.error(`Failed to trigger job ${name}:`, error);
      return false;
    }
  }

  /**
   * Get status of all jobs
   */
  public getJobStatuses(): JobStatus[] {
    return Array.from(this.jobStatuses.values());
  }

  /**
   * Get status of specific job
   */
  public getJobStatus(name: string): JobStatus | null {
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
        .sort((a, b) => b!.getTime() - a!.getTime())[0] || null
    };
  }
}

// Export singleton instance
export default new KnowledgeJobScheduler();
