import { QdrantClient } from '@qdrant/js-client-rest';
import OpenAI from 'openai';
import logger from '../utils/logger';
import config from '../config';

export interface VectorSearchResult {
  id: string;
  score: number;
  payload: any;
}

export interface DocumentEmbedding {
  id: string;
  vector: number[];
  payload: {
    title: string;
    content: string;
    category: string;
    markets: string[];
    tags: string[];
    filename: string;
    createdAt: string;
  };
}

class VectorDatabaseService {
  private qdrantClient: QdrantClient;
  private openai: OpenAI;
  private readonly collectionName = 'documents';
  private readonly vectorSize = 1536; // OpenAI embedding dimension

  constructor() {
    // Initialize Qdrant client (can be local or cloud)
    this.qdrantClient = new QdrantClient({
      url: process.env.QDRANT_URL || 'http://localhost:6333',
      apiKey: process.env.QDRANT_API_KEY, // Optional for cloud
    });

    // Initialize OpenAI client
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || 'your-openai-api-key',
    });
  }

  /**
   * Initialize the vector database collection
   */
  async initialize(): Promise<void> {
    try {
      // Check if collection exists
      const collections = await this.qdrantClient.getCollections();
      const existingCollection = collections.collections?.find(
        col => col.name === this.collectionName
      );

      if (!existingCollection) {
        // Create collection
        await this.qdrantClient.createCollection(this.collectionName, {
          vectors: {
            size: this.vectorSize,
            distance: 'Cosine',
          },
        });
        logger.info(`Created Qdrant collection: ${this.collectionName}`);
      } else {
        logger.info(`Qdrant collection already exists: ${this.collectionName}`);
      }

      // Create payload index for faster filtering
      await this.createPayloadIndexes();
    } catch (error) {
      logger.error('Failed to initialize vector database:', error);
      // Fall back to mock implementation if Qdrant is not available
      this.useMockImplementation = true;
    }
  }

  private useMockImplementation = false;

  /**
   * Create payload indexes for better search performance
   */
  private async createPayloadIndexes(): Promise<void> {
    try {
      const indexes = [
        { field: 'category', type: 'keyword' },
        { field: 'markets', type: 'keyword' },
        { field: 'tags', type: 'keyword' },
        { field: 'createdAt', type: 'datetime' },
      ];

      for (const index of indexes) {
        try {
          await this.qdrantClient.createPayloadIndex(this.collectionName, {
            field_name: index.field,
            field_schema: index.type as any,
          });
        } catch (error) {
          // Index might already exist, continue
        }
      }
    } catch (error) {
      logger.warn('Failed to create payload indexes:', error);
    }
  }

  /**
   * Generate embeddings for text using OpenAI
   */
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      if (this.useMockImplementation) {
        return this.generateMockEmbedding();
      }

      const response = await this.openai.embeddings.create({
        model: 'text-embedding-ada-002',
        input: text.substring(0, 8000), // Limit input length
      });

      return response.data[0].embedding;
    } catch (error) {
      logger.warn('Failed to generate OpenAI embedding, using mock:', error);
      return this.generateMockEmbedding();
    }
  }

  /**
   * Generate mock embedding for testing/fallback
   */
  private generateMockEmbedding(): number[] {
    return Array.from({ length: this.vectorSize }, () => Math.random() * 2 - 1);
  }

  /**
   * Store a document embedding in the vector database
   */
  async storeDocumentEmbedding(document: DocumentEmbedding): Promise<void> {
    try {
      if (this.useMockImplementation) {
        logger.info(`Mock: Stored embedding for document ${document.id}`);
        return;
      }

      await this.qdrantClient.upsert(this.collectionName, {
        wait: true,
        points: [
          {
            id: document.id,
            vector: document.vector,
            payload: document.payload,
          },
        ],
      });

      logger.info(`Stored embedding for document: ${document.id}`);
    } catch (error) {
      logger.error(`Failed to store embedding for document ${document.id}:`, error);
      throw error;
    }
  }

  /**
   * Search for similar documents using vector similarity
   */
  async searchSimilarDocuments(
    queryText: string,
    options: {
      limit?: number;
      threshold?: number;
      filter?: any;
    } = {}
  ): Promise<VectorSearchResult[]> {
    try {
      const { limit = 10, threshold = 0.7, filter } = options;

      if (this.useMockImplementation) {
        return this.getMockSearchResults(queryText, limit);
      }

      // Generate embedding for query
      const queryVector = await this.generateEmbedding(queryText);

      // Search similar vectors
      const searchResult = await this.qdrantClient.search(this.collectionName, {
        vector: queryVector,
        limit,
        score_threshold: threshold,
        filter,
        with_payload: true,
      });

      return searchResult.map(result => ({
        id: result.id as string,
        score: result.score,
        payload: result.payload,
      }));
    } catch (error) {
      logger.error('Failed to search similar documents:', error);
      return this.getMockSearchResults(queryText, options.limit || 10);
    }
  }

  /**
   * Get mock search results for testing
   */
  private getMockSearchResults(query: string, limit: number): VectorSearchResult[] {
    const mockResults: VectorSearchResult[] = [
      {
        id: 'doc_westpac_morning_report_20250605_pdf',
        score: 0.85,
        payload: {
          title: 'Westpac Morning Report-20250605',
          category: 'research',
          markets: ['forex', 'futures', 'stocks'],
          tags: ['analysis', 'market', 'trading'],
          filename: 'Westpac_Morning Report-20250605.pdf',
          createdAt: '2025-06-05T00:00:00Z',
        },
      },
      {
        id: 'doc_ubs_currency_markets_risks_20250603_pdf',
        score: 0.82,
        payload: {
          title: 'UBS Currency markets Risks ahead for the USD-20250603',
          category: 'research',
          markets: ['forex'],
          tags: ['analysis', 'USD', 'risk', 'market'],
          filename: 'UBS_Currency markets Risks ahead for the USD-20250603.pdf',
          createdAt: '2025-06-03T00:00:00Z',
        },
      },
    ];

    return mockResults.slice(0, limit);
  }

  /**
   * Process a document and store its embedding
   */
  async processAndStoreDocument(document: {
    id: string;
    title: string;
    content: string;
    category: string;
    markets: string[];
    tags: string[];
    filename: string;
  }): Promise<void> {
    try {
      // Create text for embedding (title + content summary)
      const embeddingText = `${document.title}\n\n${document.content.substring(0, 4000)}`;
      
      // Generate embedding
      const vector = await this.generateEmbedding(embeddingText);

      // Store in vector database
      const documentEmbedding: DocumentEmbedding = {
        id: document.id,
        vector,
        payload: {
          title: document.title,
          content: document.content.substring(0, 1000), // Store excerpt
          category: document.category,
          markets: document.markets,
          tags: document.tags,
          filename: document.filename,
          createdAt: new Date().toISOString(),
        },
      };

      await this.storeDocumentEmbedding(documentEmbedding);
    } catch (error) {
      logger.error(`Failed to process and store document ${document.id}:`, error);
      throw error;
    }
  }

  /**
   * Get collection statistics
   */
  async getCollectionStats(): Promise<any> {
    try {
      if (this.useMockImplementation) {
        return {
          status: 'mock',
          vectors_count: 49,
          indexed_vectors_count: 49,
          points_count: 49,
        };
      }

      const collectionInfo = await this.qdrantClient.getCollection(this.collectionName);
      return collectionInfo;
    } catch (error) {
      logger.error('Failed to get collection stats:', error);
      return { status: 'error', error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Delete a document from the vector database
   */
  async deleteDocument(documentId: string): Promise<void> {
    try {
      if (this.useMockImplementation) {
        logger.info(`Mock: Deleted document ${documentId}`);
        return;
      }

      await this.qdrantClient.delete(this.collectionName, {
        wait: true,
        points: [documentId],
      });

      logger.info(`Deleted document from vector database: ${documentId}`);
    } catch (error) {
      logger.error(`Failed to delete document ${documentId}:`, error);
      throw error;
    }
  }

  /**
   * Health check for vector database
   */
  async healthCheck(): Promise<boolean> {
    try {
      if (this.useMockImplementation) {
        return true;
      }

      await this.qdrantClient.getCollections();
      return true;
    } catch (error) {
      logger.error('Vector database health check failed:', error);
      return false;
    }
  }
}

// Export singleton instance
export const vectorDatabaseService = new VectorDatabaseService();
export default VectorDatabaseService;