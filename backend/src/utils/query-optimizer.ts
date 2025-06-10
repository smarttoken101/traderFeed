import { PrismaClient } from '@prisma/client';
import logger from './logger';

interface QueryOptions {
  select?: any;
  include?: any;
  where?: any;
  orderBy?: any;
  skip?: number;
  take?: number;
}

interface OptimizedQuery {
  query: any;
  cacheKey?: string;
  cacheTTL?: number;
}

class QueryOptimizer {
  private static readonly DEFAULT_PAGE_SIZE = 20;
  private static readonly MAX_PAGE_SIZE = 100;

  /**
   * Optimize article queries with proper indexing and selective fields
   */
  public static optimizeArticleQuery(options: QueryOptions = {}): OptimizedQuery {
    const { skip = 0, take = this.DEFAULT_PAGE_SIZE, where = {}, orderBy, select, include } = options;

    // Limit page size to prevent performance issues
    const limitedTake = Math.min(take, this.MAX_PAGE_SIZE);

    // Optimized select for articles - only essential fields by default
    const optimizedSelect = select || {
      id: true,
      title: true,
      description: true,
      link: true,
      publishedAt: true,
      sentimentScore: true,
      sentimentLabel: true,
      markets: true,
      feedId: true,
      createdAt: true,
      // Exclude heavy fields like content and originalText by default
      ...(include?.content && { content: true }),
      ...(include?.originalText && { originalText: true }),
    };

    // Optimize orderBy for database performance
    const optimizedOrderBy = orderBy || [
      { publishedAt: 'desc' },
      { id: 'desc' }, // Secondary sort for consistency
    ];

    const query = {
      select: optimizedSelect,
      where: this.optimizeWhereClause(where),
      orderBy: optimizedOrderBy,
      skip,
      take: limitedTake,
    };

    return {
      query,
      cacheKey: this.generateCacheKey('articles', { where, orderBy, skip, take: limitedTake }),
      cacheTTL: 300, // 5 minutes
    };
  }

  /**
   * Optimize COT data queries
   */
  public static optimizeCOTQuery(options: QueryOptions = {}): OptimizedQuery {
    const { skip = 0, take = this.DEFAULT_PAGE_SIZE, where = {}, orderBy, select } = options;

    const optimizedSelect = select || {
      id: true,
      reportDate: true,
      market: true,
      commercialLong: true,
      commercialShort: true,
      nonCommercialLong: true,
      nonCommercialShort: true,
      netPositions: true,
      percentiles: true,
      createdAt: true,
    };

    const optimizedOrderBy = orderBy || [
      { reportDate: 'desc' },
      { market: 'asc' },
    ];

    const query = {
      select: optimizedSelect,
      where: this.optimizeWhereClause(where),
      orderBy: optimizedOrderBy,
      skip,
      take: Math.min(take, this.MAX_PAGE_SIZE),
    };

    return {
      query,
      cacheKey: this.generateCacheKey('cot', { where, orderBy, skip, take }),
      cacheTTL: 3600, // 1 hour (COT data updates weekly)
    };
  }

  /**
   * Optimize knowledge base document queries
   */
  public static optimizeKnowledgeQuery(options: QueryOptions = {}): OptimizedQuery {
    const { skip = 0, take = this.DEFAULT_PAGE_SIZE, where = {}, orderBy, select } = options;

    const optimizedSelect = select || {
      id: true,
      title: true,
      filename: true,
      category: true,
      tags: true,
      uploadedAt: true,
      fileSize: true,
      // Exclude heavy content fields by default
      metadata: true,
    };

    const optimizedOrderBy = orderBy || [
      { uploadedAt: 'desc' },
      { id: 'desc' },
    ];

    const query = {
      select: optimizedSelect,
      where: this.optimizeWhereClause(where),
      orderBy: optimizedOrderBy,
      skip,
      take: Math.min(take, this.MAX_PAGE_SIZE),
    };

    return {
      query,
      cacheKey: this.generateCacheKey('knowledge', { where, orderBy, skip, take }),
      cacheTTL: 600, // 10 minutes
    };
  }

  /**
   * Optimize feed queries
   */
  public static optimizeFeedQuery(options: QueryOptions = {}): OptimizedQuery {
    const { where = {}, orderBy, select } = options;

    const optimizedSelect = select || {
      id: true,
      name: true,
      url: true,
      market: true,
      isActive: true,
      lastFetched: true,
      articleCount: true,
      errorCount: true,
      createdAt: true,
    };

    const optimizedOrderBy = orderBy || [
      { isActive: 'desc' },
      { lastFetched: 'desc' },
    ];

    const query = {
      select: optimizedSelect,
      where: this.optimizeWhereClause(where),
      orderBy: optimizedOrderBy,
    };

    return {
      query,
      cacheKey: this.generateCacheKey('feeds', { where, orderBy }),
      cacheTTL: 1800, // 30 minutes
    };
  }

  /**
   * Optimize where clauses for better database performance
   */
  private static optimizeWhereClause(where: any): any {
    if (!where || typeof where !== 'object') {
      return where;
    }

    const optimized = { ...where };

    // Optimize date range queries
    if (optimized.publishedAt || optimized.reportDate || optimized.createdAt) {
      const dateField = optimized.publishedAt || optimized.reportDate || optimized.createdAt;
      
      if (dateField && typeof dateField === 'object') {
        // Ensure date queries use proper indexing
        if (dateField.gte && dateField.lte) {
          // Date range query - good for indexing
        } else if (dateField.gte || dateField.gt) {
          // Open-ended date query - still good
        } else if (dateField.lte || dateField.lt) {
          // Add a reasonable lower bound to improve performance
          const oneYearAgo = new Date();
          oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
          
          if (optimized.publishedAt) {
            optimized.publishedAt = { ...dateField, gte: oneYearAgo };
          } else if (optimized.reportDate) {
            optimized.reportDate = { ...dateField, gte: oneYearAgo };
          } else if (optimized.createdAt) {
            optimized.createdAt = { ...dateField, gte: oneYearAgo };
          }
        }
      }
    }

    // Optimize text search queries
    if (optimized.title?.contains || optimized.description?.contains) {
      // Ensure case-insensitive search is optimized
      if (optimized.title?.contains) {
        optimized.title = {
          contains: optimized.title.contains,
          mode: 'insensitive',
        };
      }
      if (optimized.description?.contains) {
        optimized.description = {
          contains: optimized.description.contains,
          mode: 'insensitive',
        };
      }
    }

    return optimized;
  }

  /**
   * Generate cache key for queries
   */
  private static generateCacheKey(entity: string, params: any): string {
    const paramsStr = JSON.stringify(params, Object.keys(params).sort());
    return `query:${entity}:${Buffer.from(paramsStr).toString('base64')}`;
  }

  /**
   * Get pagination metadata
   */
  public static async getPaginationMetadata(
    prisma: PrismaClient,
    entity: string,
    where: any,
    currentPage: number,
    pageSize: number
  ): Promise<{
    currentPage: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  }> {
    try {
      let totalItems: number;
      
      // Get total count based on entity type
      switch (entity) {
        case 'articles':
          totalItems = await prisma.article.count({ where });
          break;
        case 'cot':
          totalItems = await prisma.cotData.count({ where });
          break;
        case 'knowledge':
          totalItems = await prisma.document.count({ where });
          break;
        case 'feeds':
          totalItems = await prisma.rssFeed.count({ where });
          break;
        default:
          throw new Error(`Unknown entity: ${entity}`);
      }

      const totalPages = Math.ceil(totalItems / pageSize);
      
      return {
        currentPage,
        pageSize,
        totalItems,
        totalPages,
        hasNextPage: currentPage < totalPages,
        hasPreviousPage: currentPage > 1,
      };
    } catch (error) {
      logger.error('Error getting pagination metadata:', error);
      throw error;
    }
  }

  /**
   * Optimize bulk operations
   */
  public static optimizeBulkOperation<T>(
    items: T[],
    batchSize: number = 100
  ): T[][] {
    const batches: T[][] = [];
    
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    
    return batches;
  }

  /**
   * Create database indexes recommendations
   */
  public static getDatabaseIndexRecommendations(): string[] {
    return [
      // Articles table indexes
      'CREATE INDEX IF NOT EXISTS idx_articles_published_at ON "Article"("publishedAt" DESC);',
      'CREATE INDEX IF NOT EXISTS idx_articles_market ON "Article"("market");',
      'CREATE INDEX IF NOT EXISTS idx_articles_sentiment ON "Article"("sentiment");',
      'CREATE INDEX IF NOT EXISTS idx_articles_feed_id ON "Article"("feedId");',
      'CREATE INDEX IF NOT EXISTS idx_articles_composite ON "Article"("market", "publishedAt" DESC);',
      
      // COT data indexes
      'CREATE INDEX IF NOT EXISTS idx_cot_report_date ON "COTData"("reportDate" DESC);',
      'CREATE INDEX IF NOT EXISTS idx_cot_market ON "COTData"("market");',
      'CREATE INDEX IF NOT EXISTS idx_cot_composite ON "COTData"("market", "reportDate" DESC);',
      
      // Documents indexes
      'CREATE INDEX IF NOT EXISTS idx_documents_uploaded_at ON "Document"("uploadedAt" DESC);',
      'CREATE INDEX IF NOT EXISTS idx_documents_category ON "Document"("category");',
      'CREATE INDEX IF NOT EXISTS idx_documents_title ON "Document"("title");',
      
      // Feeds indexes
      'CREATE INDEX IF NOT EXISTS idx_feeds_market ON "Feed"("market");',
      'CREATE INDEX IF NOT EXISTS idx_feeds_active ON "Feed"("isActive");',
      'CREATE INDEX IF NOT EXISTS idx_feeds_last_fetched ON "Feed"("lastFetched" DESC);',
    ];
  }
}

export default QueryOptimizer;
