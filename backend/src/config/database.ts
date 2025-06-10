import { PrismaClient } from '@prisma/client';
import logger from '../utils/logger';

class Database {
  private static instance: PrismaClient;

  public static getInstance(): PrismaClient {
    if (!Database.instance) {
      Database.instance = new PrismaClient({
        log: [
          {
            emit: 'event',
            level: 'query',
          },
          {
            emit: 'event',
            level: 'error',
          },
          {
            emit: 'event',
            level: 'info',
          },
          {
            emit: 'event',
            level: 'warn',
          },
        ],
      });

      // Log database events
      Database.instance.$on('error' as never, (e: any) => {
        logger.error('Database error:', e);
      });

      Database.instance.$on('warn' as never, (e: any) => {
        logger.warn('Database warning:', e);
      });

      Database.instance.$on('info' as never, (e: any) => {
        logger.info('Database info:', e);
      });

      // Log slow queries in development
      if (process.env.NODE_ENV === 'development') {
        Database.instance.$on('query' as never, (e: any) => {
          if (e.duration > 100) { // Log queries taking more than 100ms
            logger.warn(`Slow query detected: ${e.query} (${e.duration}ms)`);
          }
        });
      }
    }

    return Database.instance;
  }

  public static async connect(): Promise<void> {
    try {
      const prisma = Database.getInstance();
      await prisma.$connect();
      logger.info('Database connected successfully');
    } catch (error) {
      logger.error('Failed to connect to database:', error);
      throw error;
    }
  }

  public static async disconnect(): Promise<void> {
    try {
      const prisma = Database.getInstance();
      await prisma.$disconnect();
      logger.info('Database disconnected successfully');
    } catch (error) {
      logger.error('Failed to disconnect from database:', error);
      throw error;
    }
  }

  public static async healthCheck(): Promise<boolean> {
    try {
      const prisma = Database.getInstance();
      await prisma.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      logger.error('Database health check failed:', error);
      return false;
    }
  }
}

export default Database;
