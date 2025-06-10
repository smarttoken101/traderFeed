import request from 'supertest';
import app from '../app';
import Database from '../config/database';
import RedisClient from '../config/redis';
import PerformanceMonitorService from '../services/performance-monitor.service';

describe('Performance Tests', () => {
  beforeAll(async () => {
    await Database.connect();
    await RedisClient.connect();
  });

  afterAll(async () => {
    await Database.disconnect();
    await RedisClient.disconnect();
  });

  describe('API Response Times', () => {
    test('GET /api/articles should respond within 500ms', async () => {
      const startTime = Date.now();
      
      const response = await request(app.app)
        .get('/api/articles')
        .query({ limit: 10 });
      
      const responseTime = Date.now() - startTime;
      
      expect(response.status).toBe(200);
      expect(responseTime).toBeLessThan(500);
    });

    test('GET /api/articles with filters should respond within 1000ms', async () => {
      const startTime = Date.now();
      
      const response = await request(app.app)
        .get('/api/articles')
        .query({
          limit: 20,
          sentiment: 'positive',
          market: 'forex',
          dateFrom: '2025-01-01',
          dateTo: '2025-06-10',
        });
      
      const responseTime = Date.now() - startTime;
      
      expect(response.status).toBe(200);
      expect(responseTime).toBeLessThan(1000);
    });

    test('GET /api/articles/sentiment-stats should respond within 300ms', async () => {
      const startTime = Date.now();
      
      const response = await request(app.app)
        .get('/api/articles/sentiment-stats');
      
      const responseTime = Date.now() - startTime;
      
      expect(response.status).toBe(200);
      expect(responseTime).toBeLessThan(300);
    });

    test('GET /api/cot should respond within 500ms', async () => {
      const startTime = Date.now();
      
      const response = await request(app.app)
        .get('/api/cot')
        .query({ limit: 10 });
      
      const responseTime = Date.now() - startTime;
      
      expect(response.status).toBe(200);
      expect(responseTime).toBeLessThan(500);
    });

    test('GET /api/knowledge/search should respond within 2000ms', async () => {
      const startTime = Date.now();
      
      const response = await request(app.app)
        .get('/api/knowledge/search')
        .query({ query: 'trading', limit: 5 });
      
      const responseTime = Date.now() - startTime;
      
      expect(response.status).toBe(200);
      expect(responseTime).toBeLessThan(2000); // Vector search can be slower
    });
  });

  describe('Cache Performance', () => {
    test('Cached requests should be significantly faster', async () => {
      const endpoint = '/api/articles/categories';
      
      // First request (cache miss)
      const firstStart = Date.now();
      const firstResponse = await request(app.app).get(endpoint);
      const firstTime = Date.now() - firstStart;
      
      expect(firstResponse.status).toBe(200);
      expect(firstResponse.headers['x-cache']).toBe('MISS');
      
      // Second request (cache hit)
      const secondStart = Date.now();
      const secondResponse = await request(app.app).get(endpoint);
      const secondTime = Date.now() - secondStart;
      
      expect(secondResponse.status).toBe(200);
      expect(secondResponse.headers['x-cache']).toBe('HIT');
      expect(secondTime).toBeLessThan(firstTime * 0.5); // Should be at least 50% faster
    });

    test('Cache invalidation should work correctly', async () => {
      const endpoint = '/api/articles/instruments';
      
      // Make initial request
      const response1 = await request(app.app).get(endpoint);
      expect(response1.headers['x-cache']).toBe('MISS');
      
      // Second request should be cached
      const response2 = await request(app.app).get(endpoint);
      expect(response2.headers['x-cache']).toBe('HIT');
      
      // Manually invalidate cache
      const cacheKey = response2.headers['x-cache-key'];
      await RedisClient.del(cacheKey);
      
      // Third request should be cache miss again
      const response3 = await request(app.app).get(endpoint);
      expect(response3.headers['x-cache']).toBe('MISS');
    });
  });

  describe('Concurrent Request Handling', () => {
    test('Should handle 50 concurrent requests without significant performance degradation', async () => {
      const concurrentRequests = 50;
      const endpoint = '/api/articles';
      
      const startTime = Date.now();
      
      const promises = Array.from({ length: concurrentRequests }, () =>
        request(app.app)
          .get(endpoint)
          .query({ limit: 5 })
      );
      
      const responses = await Promise.all(promises);
      const totalTime = Date.now() - startTime;
      const averageTime = totalTime / concurrentRequests;
      
      // All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
      
      // Average response time should still be reasonable
      expect(averageTime).toBeLessThan(1000);
      expect(totalTime).toBeLessThan(5000); // Total time for all requests
    });

    test('Should handle concurrent database queries efficiently', async () => {
      const concurrentQueries = 20;
      
      const startTime = Date.now();
      
      const promises = Array.from({ length: concurrentQueries }, (_, i) =>
        PerformanceMonitorService.monitorDatabaseQuery(
          `test-query-${i}`,
          async () => {
            const prisma = Database.getInstance();
            return prisma.article.count();
          }
        )
      );
      
      const results = await Promise.all(promises);
      const totalTime = Date.now() - startTime;
      
      // All queries should return the same count
      const firstResult = results[0];
      results.forEach(result => {
        expect(result).toBe(firstResult);
      });
      
      // Should complete within reasonable time
      expect(totalTime).toBeLessThan(3000);
    });
  });

  describe('Memory Usage', () => {
    test('Should not have significant memory leaks during heavy usage', async () => {
      const initialMemory = process.memoryUsage();
      
      // Simulate heavy usage
      for (let i = 0; i < 100; i++) {
        await request(app.app)
          .get('/api/articles')
          .query({ limit: 10, page: Math.floor(Math.random() * 10) + 1 });
      }
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      
      // Memory increase should not exceed 50MB
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    });
  });

  describe('Database Performance', () => {
    test('Database connection pool should be healthy', async () => {
      const prisma = Database.getInstance();
      
      // Test multiple concurrent database operations
      const operations = Array.from({ length: 10 }, () =>
        prisma.article.count()
      );
      
      const startTime = Date.now();
      const results = await Promise.all(operations);
      const duration = Date.now() - startTime;
      
      // All operations should succeed
      expect(results).toHaveLength(10);
      
      // Should complete quickly with connection pooling
      expect(duration).toBeLessThan(1000);
    });

    test('Complex queries should be optimized', async () => {
      const prisma = Database.getInstance();
      
      const startTime = Date.now();
      
      const complexQuery = await prisma.article.findMany({
        where: {
          publishedAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
          },
          sentimentLabel: {
            in: ['positive', 'negative'],
          },
          markets: {
            hasSome: ['forex', 'crypto'],
          },
        },
        include: {
          feed: {
            select: {
              name: true,
              category: true,
            },
          },
        },
        orderBy: [
          { publishedAt: 'desc' },
          { sentimentScore: 'desc' },
        ],
        take: 50,
      });
      
      const duration = Date.now() - startTime;
      
      expect(Array.isArray(complexQuery)).toBe(true);
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
    });
  });

  describe('Rate Limiting', () => {
    test('Should enforce rate limits correctly', async () => {
      const requests = Array.from({ length: 110 }, () =>
        request(app.app).get('/api/articles')
      );
      
      const responses = await Promise.allSettled(requests);
      
      const successfulRequests = responses.filter(
        (result): result is PromiseFulfilledResult<any> =>
          result.status === 'fulfilled' && result.value.status === 200
      );
      
      const rateLimitedRequests = responses.filter(
        (result): result is PromiseFulfilledResult<any> =>
          result.status === 'fulfilled' && result.value.status === 429
      );
      
      // Should have some successful requests (within limit)
      expect(successfulRequests.length).toBeGreaterThan(0);
      expect(successfulRequests.length).toBeLessThanOrEqual(100);
      
      // Should have some rate-limited requests
      expect(rateLimitedRequests.length).toBeGreaterThan(0);
    });
  });

  describe('Performance Monitoring', () => {
    test('Performance metrics should be collected', async () => {
      // Make some requests to generate metrics
      await request(app.app).get('/api/articles');
      await request(app.app).get('/api/articles/sentiment-stats');
      
      // Wait a bit for metrics to be stored
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const metrics = await PerformanceMonitorService.getOverallMetrics(60000); // Last minute
      
      expect(typeof metrics).toBe('object');
      expect(Object.keys(metrics).length).toBeGreaterThan(0);
      
      // Check that metrics have the expected structure
      Object.values(metrics).forEach((metric: any) => {
        expect(typeof metric.averageResponseTime).toBe('number');
        expect(typeof metric.requestCount).toBe('number');
        expect(typeof metric.successRate).toBe('number');
        expect(metric.successRate).toBeGreaterThanOrEqual(0);
        expect(metric.successRate).toBeLessThanOrEqual(100);
      });
    });

    test('Performance report should be generated', async () => {
      const report = await PerformanceMonitorService.generatePerformanceReport(60000);
      
      expect(report).toHaveProperty('reportGeneratedAt');
      expect(report).toHaveProperty('apiMetrics');
      expect(report).toHaveProperty('summary');
      
      expect(typeof report.summary.totalEndpoints).toBe('number');
      expect(typeof report.summary.totalRequests).toBe('number');
      expect(typeof report.summary.averageResponseTime).toBe('number');
      expect(typeof report.summary.overallSuccessRate).toBe('number');
    });
  });
});
