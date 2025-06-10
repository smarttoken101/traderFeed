import { Request, Response, NextFunction } from 'express';
import RedisClient from '../config/redis';
import logger from '../utils/logger';

interface CacheOptions {
  ttl?: number; // Time to live in seconds
  keyGenerator?: (req: Request) => string;
  condition?: (req: Request) => boolean;
}

class CacheMiddleware {
  /**
   * Create cache middleware for API responses
   */
  public static cache(options: CacheOptions = {}) {
    const { 
      ttl = 300, // 5 minutes default
      keyGenerator = CacheMiddleware.defaultKeyGenerator,
      condition = () => true 
    } = options;

    return async (req: Request, res: Response, next: NextFunction) => {
      // Skip caching if condition is not met
      if (!condition(req)) {
        return next();
      }

      // Skip caching for non-GET requests
      if (req.method !== 'GET') {
        return next();
      }

      try {
        const cacheKey = keyGenerator(req);
        
        // Try to get cached response
        const cachedResponse = await RedisClient.get(cacheKey);
        
        if (cachedResponse) {
          const parsedResponse = JSON.parse(cachedResponse);
          
          // Add cache headers
          res.set({
            'X-Cache': 'HIT',
            'X-Cache-Key': cacheKey,
            'Cache-Control': `max-age=${ttl}`,
          });
          
          logger.debug(`Cache HIT for key: ${cacheKey}`);
          return res.json(parsedResponse);
        }

        // Cache miss - store original json method
        const originalJson = res.json;
        
        res.json = function(body: any) {
          // Store response in cache
          RedisClient.set(cacheKey, JSON.stringify(body), ttl)
            .catch(error => logger.error('Failed to cache response:', error));
          
          // Add cache headers
          res.set({
            'X-Cache': 'MISS',
            'X-Cache-Key': cacheKey,
            'Cache-Control': `max-age=${ttl}`,
          });
          
          logger.debug(`Cache MISS for key: ${cacheKey}`);
          
          // Call original json method
          return originalJson.call(this, body);
        };

        next();
      } catch (error) {
        logger.error('Cache middleware error:', error);
        // Continue without caching on error
        next();
      }
    };
  }

  /**
   * Default cache key generator
   */
  private static defaultKeyGenerator(req: Request): string {
    const baseUrl = req.baseUrl || '';
    const path = req.path || '';
    const query = new URLSearchParams(req.query as any).toString();
    
    return `api:${baseUrl}${path}${query ? `:${query}` : ''}`;
  }

  /**
   * Cache key generator for user-specific data
   */
  public static userCacheKeyGenerator(req: Request): string {
    const userId = (req as any).user?.id || 'anonymous';
    const baseUrl = req.baseUrl || '';
    const path = req.path || '';
    const query = new URLSearchParams(req.query as any).toString();
    
    return `api:user:${userId}:${baseUrl}${path}${query ? `:${query}` : ''}`;
  }

  /**
   * Cache key generator for articles with filters
   */
  public static articleCacheKeyGenerator(req: Request): string {
    const { page, limit, sentiment, market, dateFrom, dateTo, search } = req.query;
    const params = new URLSearchParams({
      ...(page && { page: page as string }),
      ...(limit && { limit: limit as string }),
      ...(sentiment && { sentiment: sentiment as string }),
      ...(market && { market: market as string }),
      ...(dateFrom && { dateFrom: dateFrom as string }),
      ...(dateTo && { dateTo: dateTo as string }),
      ...(search && { search: search as string }),
    }).toString();
    
    return `api:articles:${params}`;
  }

  /**
   * Cache key generator for COT data
   */
  public static cotCacheKeyGenerator(req: Request): string {
    const { market, dateFrom, dateTo, reportType } = req.query;
    const params = new URLSearchParams({
      ...(market && { market: market as string }),
      ...(dateFrom && { dateFrom: dateFrom as string }),
      ...(dateTo && { dateTo: dateTo as string }),
      ...(reportType && { reportType: reportType as string }),
    }).toString();
    
    return `api:cot:${params}`;
  }

  /**
   * Cache key generator for knowledge base searches
   */
  public static knowledgeCacheKeyGenerator(req: Request): string {
    const { query, limit, category, similarityThreshold } = req.query;
    const params = new URLSearchParams({
      ...(query && { query: query as string }),
      ...(limit && { limit: limit as string }),
      ...(category && { category: category as string }),
      ...(similarityThreshold && { similarityThreshold: similarityThreshold as string }),
    }).toString();
    
    return `api:knowledge:search:${params}`;
  }

  /**
   * Invalidate cache by pattern
   */
  public static async invalidateByPattern(pattern: string): Promise<void> {
    try {
      const client = RedisClient.getInstance();
      const keys = await client.keys(pattern);
      
      if (keys.length > 0) {
        await client.del(keys);
        logger.info(`Invalidated ${keys.length} cache entries matching pattern: ${pattern}`);
      }
    } catch (error) {
      logger.error('Failed to invalidate cache by pattern:', error);
    }
  }

  /**
   * Invalidate specific cache key
   */
  public static async invalidate(key: string): Promise<void> {
    try {
      await RedisClient.del(key);
      logger.debug(`Invalidated cache key: ${key}`);
    } catch (error) {
      logger.error('Failed to invalidate cache key:', error);
    }
  }

  /**
   * Get cache statistics
   */
  public static async getStats(): Promise<any> {
    try {
      const client = RedisClient.getInstance();
      const info = await client.info('memory');
      const dbSize = await client.dbSize();
      
      return {
        totalKeys: dbSize,
        memoryUsage: info,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Failed to get cache stats:', error);
      return null;
    }
  }
}

export default CacheMiddleware;
