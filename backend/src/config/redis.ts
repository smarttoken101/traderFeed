import { createClient } from 'redis';
import config from '.';
import logger from '../utils/logger';

class RedisClient {
  private static instance: ReturnType<typeof createClient>;

  public static getInstance(): ReturnType<typeof createClient> {
    if (!RedisClient.instance) {
      RedisClient.instance = createClient({
        url: config.redisUrl,
      });

      RedisClient.instance.on('error', (error) => {
        logger.error('Redis error:', error);
      });

      RedisClient.instance.on('connect', () => {
        logger.info('Redis connected');
      });

      RedisClient.instance.on('disconnect', () => {
        logger.warn('Redis disconnected');
      });
    }

    return RedisClient.instance;
  }

  public static async connect(): Promise<void> {
    try {
      const client = RedisClient.getInstance();
      await client.connect();
      logger.info('Redis connected successfully');
    } catch (error) {
      logger.error('Failed to connect to Redis:', error);
      throw error;
    }
  }

  public static async disconnect(): Promise<void> {
    try {
      const client = RedisClient.getInstance();
      await client.disconnect();
      logger.info('Redis disconnected successfully');
    } catch (error) {
      logger.error('Failed to disconnect from Redis:', error);
      throw error;
    }
  }

  public static async healthCheck(): Promise<boolean> {
    try {
      const client = RedisClient.getInstance();
      const result = await client.ping();
      return result === 'PONG';
    } catch (error) {
      logger.error('Redis health check failed:', error);
      return false;
    }
  }

  // Utility methods for common cache operations
  public static async get(key: string): Promise<string | null> {
    try {
      const client = RedisClient.getInstance();
      return await client.get(key);
    } catch (error) {
      logger.error(`Failed to get key ${key} from Redis:`, error);
      return null;
    }
  }

  public static async set(key: string, value: string, ttl?: number): Promise<boolean> {
    try {
      const client = RedisClient.getInstance();
      if (ttl) {
        await client.setEx(key, ttl, value);
      } else {
        await client.set(key, value);
      }
      return true;
    } catch (error) {
      logger.error(`Failed to set key ${key} in Redis:`, error);
      return false;
    }
  }

  public static async del(key: string): Promise<boolean> {
    try {
      const client = RedisClient.getInstance();
      await client.del(key);
      return true;
    } catch (error) {
      logger.error(`Failed to delete key ${key} from Redis:`, error);
      return false;
    }
  }
}

export default RedisClient;
