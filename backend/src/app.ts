import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import config from './config';
import logger from './utils/logger';
import Database from './config/database';
import RedisClient from './config/redis';

// Import middleware
import PerformanceMonitorService from './services/performance-monitor.service';

// Import routes
import articleRoutes from './controllers/articles.controller';
import feedRoutes from './controllers/feeds.controller';
import cotRoutes from './controllers/cot.controller';
import assetRoutes from './controllers/assets.controller';
import knowledgeRoutes from './routes/knowledge.routes';

// Import monitoring services
import rssMonitorJob from './jobs/rss-monitor.job';
import assetMonitorService from './services/asset-monitor.service';
import knowledgeJobScheduler from './jobs/knowledge-scheduler.job';

class App {
  public app: Express;

  constructor() {
    this.app = express();
    this.initializeMiddleware();
    this.initializeRoutes();
    this.initializeErrorHandling();
  }

  private initializeMiddleware(): void {
    // Performance monitoring (should be first to capture all requests)
    this.app.use(PerformanceMonitorService.monitor());

    // Security middleware
    this.app.use(helmet());
    
    // CORS configuration
    this.app.use(cors({
      origin: config.nodeEnv === 'production' ? false : true, // Configure this properly for production
      credentials: true,
    }));

    // Compression
    this.app.use(compression());

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Logging
    if (config.nodeEnv === 'development') {
      this.app.use(morgan('dev'));
    } else {
      this.app.use(morgan('combined', {
        stream: { write: (message) => logger.info(message.trim()) }
      }));
    }

    // Rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // limit each IP to 100 requests per windowMs
      message: 'Too many requests from this IP, please try again later.',
    });
    this.app.use('/api', limiter);
  }

  private initializeRoutes(): void {
    // Health check endpoint
    this.app.get('/health', async (req: Request, res: Response) => {
      const dbHealth = await Database.healthCheck();
      const redisHealth = await RedisClient.healthCheck();
      
      const status = dbHealth && redisHealth ? 'healthy' : 'unhealthy';
      const statusCode = status === 'healthy' ? 200 : 503;

      res.status(statusCode).json({
        status,
        timestamp: new Date().toISOString(),
        services: {
          database: dbHealth ? 'healthy' : 'unhealthy',
          redis: redisHealth ? 'healthy' : 'unhealthy',
        },
      });
    });

    // API base route
    this.app.get('/api', (req: Request, res: Response) => {
      res.json({
        message: 'TradeFeed API is running!',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
      });
    });

    // Performance metrics endpoint
    this.app.get('/api/metrics/performance', async (req: Request, res: Response) => {
      try {
        const timeRange = parseInt(req.query.timeRange as string) || 3600000; // 1 hour default
        const report = await PerformanceMonitorService.generatePerformanceReport(timeRange);
        res.json(report);
      } catch (error) {
        logger.error('Failed to generate performance report:', error);
        res.status(500).json({ error: 'Failed to generate performance report' });
      }
    });

    // API Routes
    this.app.use('/api/articles', articleRoutes);
    this.app.use('/api/feeds', feedRoutes);
    this.app.use('/api/cot', cotRoutes);
    this.app.use('/api/assets', assetRoutes);
    this.app.use('/api/knowledge', knowledgeRoutes);

    // 404 handler
    this.app.use('*', (req: Request, res: Response) => {
      res.status(404).json({
        error: 'Not Found',
        message: `Route ${req.originalUrl} not found`,
      });
    });
  }

  private initializeErrorHandling(): void {
    // Global error handler
    this.app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
      logger.error('Unhandled error:', error);

      const status = 500;
      const message = config.nodeEnv === 'production' 
        ? 'Internal Server Error' 
        : error.message;

      res.status(status).json({
        error: 'Internal Server Error',
        message,
        ...(config.nodeEnv !== 'production' && { stack: error.stack }),
      });
    });
  }

  public async start(): Promise<void> {
    try {
      // Connect to databases
      await Database.connect();
      await RedisClient.connect();

      // Initialize RSS feeds from CSV
      await assetMonitorService.initializeFeedsFromCSV();

      // Start monitoring jobs
      rssMonitorJob.startMonitoring();
      
      // Start knowledge base jobs
      knowledgeJobScheduler.startAll();

      // Start server
      this.app.listen(config.port, () => {
        logger.info(`TradeFeed API server is running on port ${config.port}`);
        logger.info(`Environment: ${config.nodeEnv}`);
        logger.info(`Health check: http://localhost:${config.port}/health`);
      });
    } catch (error) {
      logger.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  public async stop(): Promise<void> {
    try {
      await Database.disconnect();
      await RedisClient.disconnect();
      
      // Stop monitoring jobs
      rssMonitorJob.stopMonitoring();
      
      // Stop knowledge base jobs
      knowledgeJobScheduler.stopAll();

      logger.info('Server stopped gracefully');
    } catch (error) {
      logger.error('Error during server shutdown:', error);
    }
  }
}

export default App;
