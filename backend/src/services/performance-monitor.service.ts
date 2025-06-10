import { Request, Response, NextFunction } from 'express';
import RedisClient from '../config/redis';
import logger from '../utils/logger';

interface PerformanceMetrics {
  endpoint: string;
  method: string;
  duration: number;
  statusCode: number;
  timestamp: number;
  userAgent?: string;
  ip?: string;
}

interface AggregatedMetrics {
  averageResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  requestCount: number;
  errorCount: number;
  successRate: number;
}

class PerformanceMonitorService {
  private static readonly METRICS_KEY_PREFIX = 'metrics:';
  private static readonly METRICS_RETENTION_DAYS = 7;

  /**
   * Express middleware to monitor API performance
   */
  public static monitor() {
    return (req: Request, res: Response, next: NextFunction) => {
      const startTime = Date.now();
      
      // Store original end method
      const originalEnd = res.end.bind(res);
      
      res.end = function(this: Response, chunk?: any, encoding?: any) {
        const duration = Date.now() - startTime;
        
        // Create performance metric
        const metric: PerformanceMetrics = {
          endpoint: `${req.method} ${req.route?.path || req.path}`,
          method: req.method,
          duration,
          statusCode: res.statusCode,
          timestamp: startTime,
          userAgent: req.get('User-Agent'),
          ip: req.ip || req.connection.remoteAddress,
        };

        // Log slow requests
        if (duration > 1000) {
          logger.warn(`Slow request detected: ${metric.endpoint} took ${duration}ms`);
        }

        // Store metric asynchronously
        PerformanceMonitorService.storeMetric(metric).catch(error => {
          logger.error('Failed to store performance metric:', error);
        });

        // Call original end method and return its result
        return originalEnd(chunk, encoding);
      } as any;

      next();
    };
  }

  /**
   * Store performance metric in Redis
   */
  private static async storeMetric(metric: PerformanceMetrics): Promise<void> {
    try {
      const client = RedisClient.getInstance();
      const key = `${this.METRICS_KEY_PREFIX}${metric.endpoint}:${metric.timestamp}`;
      
      await client.setEx(
        key,
        this.METRICS_RETENTION_DAYS * 24 * 60 * 60, // TTL in seconds
        JSON.stringify(metric)
      );

      // Also store in a time-series list for easy aggregation
      const timeSeriesKey = `${this.METRICS_KEY_PREFIX}timeseries:${metric.endpoint}`;
      await client.lPush(timeSeriesKey, JSON.stringify(metric));
      
      // Keep only last 1000 entries per endpoint
      await client.lTrim(timeSeriesKey, 0, 999);
      await client.expire(timeSeriesKey, this.METRICS_RETENTION_DAYS * 24 * 60 * 60);

    } catch (error) {
      logger.error('Failed to store performance metric:', error);
    }
  }

  /**
   * Get aggregated metrics for an endpoint
   */
  public static async getEndpointMetrics(
    endpoint: string,
    timeRange: number = 3600000 // 1 hour in milliseconds
  ): Promise<AggregatedMetrics | null> {
    try {
      const client = RedisClient.getInstance();
      const timeSeriesKey = `${this.METRICS_KEY_PREFIX}timeseries:${endpoint}`;
      
      const metricsData = await client.lRange(timeSeriesKey, 0, -1);
      const currentTime = Date.now();
      
      const recentMetrics = metricsData
        .map(data => JSON.parse(data) as PerformanceMetrics)
        .filter(metric => currentTime - metric.timestamp <= timeRange);

      if (recentMetrics.length === 0) {
        return null;
      }

      const durations = recentMetrics.map(m => m.duration);
      const errorCount = recentMetrics.filter(m => m.statusCode >= 400).length;

      return {
        averageResponseTime: Math.round(durations.reduce((a, b) => a + b, 0) / durations.length),
        minResponseTime: Math.min(...durations),
        maxResponseTime: Math.max(...durations),
        requestCount: recentMetrics.length,
        errorCount,
        successRate: Math.round(((recentMetrics.length - errorCount) / recentMetrics.length) * 100),
      };
    } catch (error) {
      logger.error('Failed to get endpoint metrics:', error);
      return null;
    }
  }

  /**
   * Get overall API performance metrics
   */
  public static async getOverallMetrics(
    timeRange: number = 3600000 // 1 hour in milliseconds
  ): Promise<{ [endpoint: string]: AggregatedMetrics }> {
    try {
      const client = RedisClient.getInstance();
      const pattern = `${this.METRICS_KEY_PREFIX}timeseries:*`;
      const keys = await client.keys(pattern);

      const allMetrics: { [endpoint: string]: AggregatedMetrics } = {};

      for (const key of keys) {
        const endpoint = key.replace(`${this.METRICS_KEY_PREFIX}timeseries:`, '');
        const metrics = await this.getEndpointMetrics(endpoint, timeRange);
        
        if (metrics) {
          allMetrics[endpoint] = metrics;
        }
      }

      return allMetrics;
    } catch (error) {
      logger.error('Failed to get overall metrics:', error);
      return {};
    }
  }

  /**
   * Get top slowest endpoints
   */
  public static async getSlowestEndpoints(
    limit: number = 10,
    timeRange: number = 3600000
  ): Promise<Array<{ endpoint: string; averageResponseTime: number }>> {
    try {
      const allMetrics = await this.getOverallMetrics(timeRange);
      
      return Object.entries(allMetrics)
        .map(([endpoint, metrics]) => ({
          endpoint,
          averageResponseTime: metrics.averageResponseTime,
        }))
        .sort((a, b) => b.averageResponseTime - a.averageResponseTime)
        .slice(0, limit);
    } catch (error) {
      logger.error('Failed to get slowest endpoints:', error);
      return [];
    }
  }

  /**
   * Get endpoints with high error rates
   */
  public static async getHighErrorEndpoints(
    minErrorRate: number = 10, // Minimum 10% error rate
    timeRange: number = 3600000
  ): Promise<Array<{ endpoint: string; errorRate: number; requestCount: number }>> {
    try {
      const allMetrics = await this.getOverallMetrics(timeRange);
      
      return Object.entries(allMetrics)
        .map(([endpoint, metrics]) => ({
          endpoint,
          errorRate: 100 - metrics.successRate,
          requestCount: metrics.requestCount,
        }))
        .filter(item => item.errorRate >= minErrorRate && item.requestCount >= 10)
        .sort((a, b) => b.errorRate - a.errorRate);
    } catch (error) {
      logger.error('Failed to get high error endpoints:', error);
      return [];
    }
  }

  /**
   * Database query performance monitor
   */
  public static async monitorDatabaseQuery<T>(
    queryName: string,
    queryFn: () => Promise<T>
  ): Promise<T> {
    const startTime = Date.now();
    
    try {
      const result = await queryFn();
      const duration = Date.now() - startTime;
      
      // Log slow queries
      if (duration > 500) {
        logger.warn(`Slow database query: ${queryName} took ${duration}ms`);
      }

      // Store query performance metric
      await this.storeQueryMetric(queryName, duration, true);
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error(`Database query failed: ${queryName} took ${duration}ms`, error);
      
      // Store failed query metric
      await this.storeQueryMetric(queryName, duration, false);
      
      throw error;
    }
  }

  /**
   * Store database query performance metric
   */
  private static async storeQueryMetric(
    queryName: string,
    duration: number,
    success: boolean
  ): Promise<void> {
    try {
      const client = RedisClient.getInstance();
      const metric = {
        queryName,
        duration,
        success,
        timestamp: Date.now(),
      };

      const key = `${this.METRICS_KEY_PREFIX}db:${queryName}:${metric.timestamp}`;
      
      await client.setEx(
        key,
        this.METRICS_RETENTION_DAYS * 24 * 60 * 60,
        JSON.stringify(metric)
      );

      // Time series for aggregation
      const timeSeriesKey = `${this.METRICS_KEY_PREFIX}db:timeseries:${queryName}`;
      await client.lPush(timeSeriesKey, JSON.stringify(metric));
      await client.lTrim(timeSeriesKey, 0, 999);
      await client.expire(timeSeriesKey, this.METRICS_RETENTION_DAYS * 24 * 60 * 60);

    } catch (error) {
      logger.error('Failed to store database query metric:', error);
    }
  }

  /**
   * Get database query performance metrics
   */
  public static async getDatabaseMetrics(
    queryName?: string,
    timeRange: number = 3600000
  ): Promise<any> {
    try {
      const client = RedisClient.getInstance();
      const pattern = queryName 
        ? `${this.METRICS_KEY_PREFIX}db:timeseries:${queryName}`
        : `${this.METRICS_KEY_PREFIX}db:timeseries:*`;
      
      const keys = await client.keys(pattern);
      const currentTime = Date.now();
      const results: any = {};

      for (const key of keys) {
        const queryName = key.replace(`${this.METRICS_KEY_PREFIX}db:timeseries:`, '');
        const metricsData = await client.lRange(key, 0, -1);
        
        const recentMetrics = metricsData
          .map(data => JSON.parse(data))
          .filter(metric => currentTime - metric.timestamp <= timeRange);

        if (recentMetrics.length > 0) {
          const durations = recentMetrics.map(m => m.duration);
          const successCount = recentMetrics.filter(m => m.success).length;

          results[queryName] = {
            averageResponseTime: Math.round(durations.reduce((a, b) => a + b, 0) / durations.length),
            minResponseTime: Math.min(...durations),
            maxResponseTime: Math.max(...durations),
            queryCount: recentMetrics.length,
            successRate: Math.round((successCount / recentMetrics.length) * 100),
          };
        }
      }

      return results;
    } catch (error) {
      logger.error('Failed to get database metrics:', error);
      return {};
    }
  }

  /**
   * Generate performance report
   */
  public static async generatePerformanceReport(
    timeRange: number = 3600000
  ): Promise<any> {
    try {
      const [
        overallMetrics,
        slowestEndpoints,
        highErrorEndpoints,
        databaseMetrics
      ] = await Promise.all([
        this.getOverallMetrics(timeRange),
        this.getSlowestEndpoints(5, timeRange),
        this.getHighErrorEndpoints(5, timeRange),
        this.getDatabaseMetrics(undefined, timeRange)
      ]);

      return {
        reportGeneratedAt: new Date().toISOString(),
        timeRangeHours: timeRange / 3600000,
        apiMetrics: {
          overallMetrics,
          slowestEndpoints,
          highErrorEndpoints,
        },
        databaseMetrics,
        summary: {
          totalEndpoints: Object.keys(overallMetrics).length,
          totalRequests: Object.values(overallMetrics).reduce((sum, m) => sum + m.requestCount, 0),
          averageResponseTime: Math.round(
            Object.values(overallMetrics).reduce((sum, m) => sum + m.averageResponseTime, 0) / 
            Object.keys(overallMetrics).length
          ),
          overallSuccessRate: Math.round(
            Object.values(overallMetrics).reduce((sum, m) => sum + m.successRate, 0) / 
            Object.keys(overallMetrics).length
          ),
        },
      };
    } catch (error) {
      logger.error('Failed to generate performance report:', error);
      throw error;
    }
  }
}

export default PerformanceMonitorService;
