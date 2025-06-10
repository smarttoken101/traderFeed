import VectorDatabaseService, { vectorDatabaseService } from '../../services/vector-database.service';
import { QdrantClient } from '@qdrant/js-client-rest';
import OpenAI from 'openai';
import logger from '../../utils/logger';

// Mock external dependencies
jest.mock('@qdrant/js-client-rest');
jest.mock('openai');
jest.mock('../../utils/logger');

// Mock environment variables
const originalEnv = process.env;
beforeAll(() => {
  process.env = {
    ...originalEnv,
    QDRANT_URL: 'http://localhost:6333',
    QDRANT_API_KEY: 'test-qdrant-key',
    OPENAI_API_KEY: 'test-openai-key'
  };
});

afterAll(() => {
  process.env = originalEnv;
});

describe('VectorDatabaseService', () => {
  let vectorService: VectorDatabaseService;
  let mockQdrantClient: jest.Mocked<QdrantClient>;
  let mockOpenAI: jest.Mocked<OpenAI>;
  let mockEmbeddings: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock QdrantClient
    mockQdrantClient = {
      getCollections: jest.fn(),
      createCollection: jest.fn(),
      createPayloadIndex: jest.fn(),
      upsert: jest.fn(),
      search: jest.fn(),
      retrieve: jest.fn(),
      delete: jest.fn(),
      scroll: jest.fn()
    } as any;
    (QdrantClient as jest.Mock).mockImplementation(() => mockQdrantClient);

    // Mock OpenAI
    mockEmbeddings = {
      create: jest.fn()
    };
    mockOpenAI = {
      embeddings: mockEmbeddings
    } as any;
    (OpenAI as unknown as jest.Mock).mockImplementation(() => mockOpenAI);

    vectorService = new VectorDatabaseService();
  });

  describe('initialize', () => {
    it('should create collection when it does not exist', async () => {
      mockQdrantClient.getCollections.mockResolvedValue({
        collections: []
      });
      mockQdrantClient.createCollection.mockResolvedValue({} as any);
      mockQdrantClient.createPayloadIndex.mockResolvedValue({} as any);

      await vectorService.initialize();

      expect(mockQdrantClient.createCollection).toHaveBeenCalledWith('documents', {
        vectors: {
          size: 1536,
          distance: 'Cosine'
        }
      });
      expect(logger.info).toHaveBeenCalledWith('Created Qdrant collection: documents');
    });

    it('should skip creation when collection already exists', async () => {
      mockQdrantClient.getCollections.mockResolvedValue({
        collections: [{ name: 'documents' }]
      });
      mockQdrantClient.createPayloadIndex.mockResolvedValue({} as any);

      await vectorService.initialize();

      expect(mockQdrantClient.createCollection).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('Qdrant collection already exists: documents');
    });

    it('should handle initialization errors and fall back to mock implementation', async () => {
      mockQdrantClient.getCollections.mockRejectedValue(new Error('Connection failed'));

      await vectorService.initialize();

      expect(logger.error).toHaveBeenCalledWith('Failed to initialize vector database:', expect.any(Error));
    });

    it('should create payload indexes', async () => {
      mockQdrantClient.getCollections.mockResolvedValue({
        collections: [{ name: 'documents' }]
      });
      mockQdrantClient.createPayloadIndex.mockResolvedValue({} as any);

      await vectorService.initialize();

      expect(mockQdrantClient.createPayloadIndex).toHaveBeenCalledWith('documents', {
        field_name: 'category',
        field_schema: 'keyword'
      });
      expect(mockQdrantClient.createPayloadIndex).toHaveBeenCalledWith('documents', {
        field_name: 'markets',
        field_schema: 'keyword'
      });
    });
  });

  describe('generateEmbedding', () => {
    it('should generate OpenAI embeddings successfully', async () => {
      const testText = 'Federal Reserve announces interest rate decision';
      const mockEmbedding = Array.from({ length: 1536 }, (_, i) => i / 1536);
      
      mockEmbeddings.create.mockResolvedValue({
        data: [{ embedding: mockEmbedding }]
      });

      const result = await vectorService.generateEmbedding(testText);

      expect(result).toEqual(mockEmbedding);
      expect(mockEmbeddings.create).toHaveBeenCalledWith({
        model: 'text-embedding-ada-002',
        input: testText
      });
    });

    it('should truncate long text input to 8000 characters', async () => {
      const longText = 'A'.repeat(10000);
      const mockEmbedding = Array.from({ length: 1536 }, () => 0.1);
      
      mockEmbeddings.create.mockResolvedValue({
        data: [{ embedding: mockEmbedding }]
      });

      await vectorService.generateEmbedding(longText);

      expect(mockEmbeddings.create).toHaveBeenCalledWith({
        model: 'text-embedding-ada-002',
        input: longText.substring(0, 8000)
      });
    });

    it('should fall back to mock embedding when OpenAI fails', async () => {
      const testText = 'Test text';
      mockEmbeddings.create.mockRejectedValue(new Error('API rate limit exceeded'));

      const result = await vectorService.generateEmbedding(testText);

      expect(result).toHaveLength(1536);
      expect(result.every(val => typeof val === 'number')).toBe(true);
      expect(logger.warn).toHaveBeenCalledWith('Failed to generate OpenAI embedding, using mock:', expect.any(Error));
    });

    it('should generate mock embedding with correct dimensions', async () => {
      // Force mock implementation
      mockQdrantClient.getCollections.mockRejectedValue(new Error('Not available'));
      await vectorService.initialize();

      const result = await vectorService.generateEmbedding('test');

      expect(result).toHaveLength(1536);
      expect(result.every(val => val >= -1 && val <= 1)).toBe(true);
    });
  });

  describe('storeDocumentEmbedding', () => {
    it('should store document embedding successfully', async () => {
      const mockDocument = {
        id: 'doc-123',
        vector: Array.from({ length: 1536 }, () => 0.1),
        payload: {
          title: 'Fed Policy Update',
          content: 'Federal Reserve announces new monetary policy...',
          category: 'monetary-policy',
          markets: ['forex', 'bonds'],
          tags: ['fed', 'rates', 'policy'],
          filename: 'fed-policy-update.pdf',
          createdAt: '2025-06-10T10:00:00Z'
        }
      };

      mockQdrantClient.upsert.mockResolvedValue({} as any);

      await vectorService.storeDocumentEmbedding(mockDocument);

      expect(mockQdrantClient.upsert).toHaveBeenCalledWith('documents', {
        wait: true,
        points: [{
          id: mockDocument.id,
          vector: mockDocument.vector,
          payload: mockDocument.payload
        }]
      });
    });

    it('should handle storage errors gracefully', async () => {
      const mockDocument = {
        id: 'doc-123',
        vector: Array.from({ length: 1536 }, () => 0.1),
        payload: {
          title: 'Test Document',
          content: 'Test content',
          category: 'test',
          markets: ['forex'],
          tags: ['test'],
          filename: 'test.pdf',
          createdAt: '2025-06-10T10:00:00Z'
        }
      };

      mockQdrantClient.upsert.mockRejectedValue(new Error('Storage failed'));

      await expect(vectorService.storeDocumentEmbedding(mockDocument))
        .rejects.toThrow('Storage failed');
      expect(logger.error).toHaveBeenCalledWith('Failed to store document embedding:', expect.any(Error));
    });

    it('should use mock implementation when Qdrant is not available', async () => {
      // Force mock implementation
      mockQdrantClient.getCollections.mockRejectedValue(new Error('Not available'));
      await vectorService.initialize();

      const mockDocument = {
        id: 'doc-123',
        vector: Array.from({ length: 1536 }, () => 0.1),
        payload: {
          title: 'Test Document',
          content: 'Test content',
          category: 'test',
          markets: ['forex'],
          tags: ['test'],
          filename: 'test.pdf',
          createdAt: '2025-06-10T10:00:00Z'
        }
      };

      await vectorService.storeDocumentEmbedding(mockDocument);

      expect(logger.info).toHaveBeenCalledWith('Mock: Stored embedding for document doc-123');
      expect(mockQdrantClient.upsert).not.toHaveBeenCalled();
    });
  });

  describe('searchSimilarDocuments', () => {
    it('should perform vector similarity search successfully', async () => {
      const queryText = 'Federal Reserve interest rate policy';
      const mockEmbedding = Array.from({ length: 1536 }, () => 0.2);
      const mockSearchResults = [
        {
          id: 'doc-1',
          version: 1,
          score: 0.95,
          payload: {
            title: 'ECB Rate Decision',
            content: 'European Central Bank raises rates...',
            category: 'monetary-policy',
            markets: ['forex'],
            tags: ['ecb', 'rates']
          }
        },
        {
          id: 'doc-2',
          version: 1,
          score: 0.87,
          payload: {
            title: 'Fed Minutes Released',
            content: 'Federal Reserve meeting minutes...',
            category: 'monetary-policy',
            markets: ['forex', 'bonds'],
            tags: ['fed', 'minutes']
          }
        }
      ];

      mockEmbeddings.create.mockResolvedValue({
        data: [{ embedding: mockEmbedding }]
      });
      mockQdrantClient.search.mockResolvedValue(mockSearchResults);

      const results = await vectorService.searchSimilarDocuments(queryText, {
        limit: 10,
        threshold: 0.8
      });

      expect(results).toHaveLength(2);
      expect(results[0].score).toBe(0.95);
      expect(results[0].payload.title).toBe('ECB Rate Decision');
      expect(mockQdrantClient.search).toHaveBeenCalledWith('documents', {
        vector: mockEmbedding,
        limit: 10,
        score_threshold: 0.8,
        with_payload: true
      });
    });

    it('should search with category filter', async () => {
      const queryText = 'gold market analysis';
      const mockEmbedding = Array.from({ length: 1536 }, () => 0.3);
      const mockSearchResults = [
        {
          id: 'doc-1',
          version: 1,
          score: 0.92,
          payload: {
            title: 'Gold Market Analysis',
            category: 'commodities',
            markets: ['commodities']
          }
        }
      ];

      mockEmbeddings.create.mockResolvedValue({
        data: [{ embedding: mockEmbedding }]
      });
      mockQdrantClient.search.mockResolvedValue(mockSearchResults);

      const results = await vectorService.searchSimilarDocuments(queryText, {
        limit: 5,
        filter: {
          must: [
            {
              key: 'category',
              match: { value: 'commodities' }
            }
          ]
        }
      });

      expect(mockQdrantClient.search).toHaveBeenCalledWith('documents', {
        vector: mockEmbedding,
        limit: 5,
        with_payload: true,
        filter: {
          must: [
            {
              key: 'category',
              match: { value: 'commodities' }
            }
          ]
        }
      });
    });

    it('should search with market filter', async () => {
      const queryText = 'forex trading analysis';
      const mockEmbedding = Array.from({ length: 1536 }, () => 0.4);
      
      mockEmbeddings.create.mockResolvedValue({
        data: [{ embedding: mockEmbedding }]
      });
      mockQdrantClient.search.mockResolvedValue([]);

      await vectorService.searchSimilarDocuments(queryText, {
        filter: {
          must: [
            {
              key: 'markets',
              match: { any: ['forex', 'crypto'] }
            }
          ]
        }
      });

      expect(mockQdrantClient.search).toHaveBeenCalledWith('documents', {
        vector: mockEmbedding,
        limit: 10,
        with_payload: true,
        filter: {
          must: [
            {
              key: 'markets',
              match: { any: ['forex', 'crypto'] }
            }
          ]
        }
      });
    });

    it('should handle search errors gracefully', async () => {
      const queryText = 'market analysis';
      mockEmbeddings.create.mockResolvedValue({
        data: [{ embedding: Array.from({ length: 1536 }, () => 0.1) }]
      });
      mockQdrantClient.search.mockRejectedValue(new Error('Search failed'));

      const results = await vectorService.searchSimilarDocuments(queryText);

      // Should return mock results as fallback
      expect(results).toEqual(expect.any(Array));
      expect(logger.error).toHaveBeenCalledWith('Failed to search similar documents:', expect.any(Error));
    });

    it('should return mock results when in mock mode', async () => {
      // Force mock implementation
      mockQdrantClient.getCollections.mockRejectedValue(new Error('Not available'));
      await vectorService.initialize();

      const queryText = 'financial analysis';
      const results = await vectorService.searchSimilarDocuments(queryText);

      expect(results).toEqual(expect.any(Array));
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('deleteDocument', () => {
    it('should delete document successfully', async () => {
      const documentId = 'doc-123';
      mockQdrantClient.delete.mockResolvedValue({} as any);

      await vectorService.deleteDocument(documentId);

      expect(mockQdrantClient.delete).toHaveBeenCalledWith('documents', {
        wait: true,
        points: [documentId]
      });
    });

    it('should handle deletion errors', async () => {
      const documentId = 'doc-123';
      mockQdrantClient.delete.mockRejectedValue(new Error('Deletion failed'));

      await expect(vectorService.deleteDocument(documentId))
        .rejects.toThrow('Deletion failed');
      expect(logger.error).toHaveBeenCalledWith('Failed to delete document:', expect.any(Error));
    });
  });

  describe('getCollectionStats', () => {
    it('should retrieve collection statistics', async () => {
      const mockStats = {
        status: 'green',
        vectors_count: 1500,
        indexed_vectors_count: 1500,
        points_count: 1500
      };

      // Mock collection info call
      (mockQdrantClient as any).getCollection = jest.fn().mockResolvedValue(mockStats);

      const stats = await vectorService.getCollectionStats();

      expect(stats).toEqual(mockStats);
    });

    it('should handle stats retrieval errors', async () => {
      (mockQdrantClient as any).getCollection = jest.fn().mockRejectedValue(new Error('Stats failed'));

      const stats = await vectorService.getCollectionStats();

      expect(stats.status).toBe('error');
      expect(stats.error).toBe('Stats failed');
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle empty query text', async () => {
      const emptyText = '';
      mockEmbeddings.create.mockResolvedValue({
        data: [{ embedding: Array.from({ length: 1536 }, () => 0) }]
      });
      
      const results = await vectorService.searchSimilarDocuments(emptyText);
      
      expect(results).toEqual(expect.any(Array));
    });

    it('should handle invalid embedding generation', async () => {
      const queryText = 'test query';
      mockEmbeddings.create.mockRejectedValue(new Error('Invalid API key'));

      const results = await vectorService.searchSimilarDocuments(queryText);
      
      // Should return mock results as fallback
      expect(results).toEqual(expect.any(Array));
      expect(logger.warn).toHaveBeenCalledWith('Failed to generate OpenAI embedding, using mock:', expect.any(Error));
    });

    it('should handle network connectivity issues', async () => {
      mockQdrantClient.getCollections.mockRejectedValue(new Error('ECONNREFUSED'));

      await vectorService.initialize();

      expect(logger.error).toHaveBeenCalledWith('Failed to initialize vector database:', expect.any(Error));
    });

    it('should handle OpenAI API key issues', async () => {
      mockEmbeddings.create.mockRejectedValue(new Error('Invalid API key'));

      const result = await vectorService.generateEmbedding('test text');

      expect(result).toHaveLength(1536);
      expect(logger.warn).toHaveBeenCalledWith('Failed to generate OpenAI embedding, using mock:', expect.any(Error));
    });
  });

  describe('Performance and optimization', () => {
    it('should handle batch document storage', async () => {
      const documents = Array.from({ length: 10 }, (_, i) => ({
        id: `doc-${i}`,
        vector: Array.from({ length: 1536 }, () => Math.random()),
        payload: {
          title: `Document ${i}`,
          content: `Content for document ${i}`,
          category: 'test',
          markets: ['forex'],
          tags: ['test'],
          filename: `doc-${i}.pdf`,
          createdAt: new Date().toISOString()
        }
      }));

      mockQdrantClient.upsert.mockResolvedValue({} as any);

      for (const doc of documents) {
        await vectorService.storeDocumentEmbedding(doc);
      }

      expect(mockQdrantClient.upsert).toHaveBeenCalledTimes(10);
    });

    it('should handle large search result sets', async () => {
      const queryText = 'financial market analysis';
      const mockEmbedding = Array.from({ length: 1536 }, () => 0.1);
      const largeResultSet = Array.from({ length: 1000 }, (_, i) => ({
        id: `doc-${i}`,
        version: 1,
        score: 0.9 - (i * 0.0001),
        payload: { title: `Document ${i}` }
      }));

      mockEmbeddings.create.mockResolvedValue({
        data: [{ embedding: mockEmbedding }]
      });
      mockQdrantClient.search.mockResolvedValue(largeResultSet);

      const results = await vectorService.searchSimilarDocuments(queryText, { limit: 1000 });

      expect(results).toHaveLength(1000);
      expect(results[0].score).toBeGreaterThan(results[999].score);
    });
  });
});
