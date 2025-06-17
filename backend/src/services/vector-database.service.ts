import { QdrantClient } from '@qdrant/js-client-rest';
import { GoogleGenerativeAI } from '@google/generative-ai';
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
  private genAI?: GoogleGenerativeAI;
  private readonly collectionName = 'documents';
  private readonly vectorSize = 768; // Gemini "text-embedding-004" or similar dimension

  constructor() {
    // Initialize Qdrant client
    this.qdrantClient = new QdrantClient({
      url: config.qdrantUrl, // Use config for Qdrant URL
      apiKey: config.qdrantApiKey,
    });

    // Initialize Google Gemini client
    if (config.geminiApiKey) {
      this.genAI = new GoogleGenerativeAI(config.geminiApiKey);
    } else {
      logger.warn('Gemini API key is not configured. Embedding generation will be mocked.');
      this.useMockImplementation = true;
    }
  }

  /**
   * Stores document chunks and their embeddings in Qdrant.
   * @param documentId The ID of the parent document.
   * @param chunks Array of text chunks with their own optional IDs and metadata.
   * @param documentMetadata Metadata of the parent document (title, category, etc.).
   */
  public async storeDocumentChunks(
    documentId: string,
    chunks: Array<{ text: string; id?: string }>, // id here is chunk's own unique part, if any
    documentMetadata: {
      title: string;
      category: string;
      markets: string[];
      tags: string[];
      filename: string;
      originalDocumentId: string; // Reference to parent document in Prisma
    }
  ): Promise<void> {
    if (this.useMockImplementation) {
      logger.info(`Mock: Would store ${chunks.length} chunks for document ${documentId}`);
      return;
    }

    try {
      const points = [];
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        if (!chunk.text || chunk.text.trim() === "") {
          logger.warn(`Skipping empty chunk for document ${documentId}, index ${i}`);
          continue;
        }

        const embeddingVector = await this.generateEmbedding(chunk.text);
        const chunkPointId = `${documentId}_chunk_${i}`; // Unique ID for the Qdrant point

        points.push({
          id: chunkPointId,
          vector: embeddingVector,
          payload: {
            ...documentMetadata, // Spread parent document's metadata
            chunkText: chunk.text, // Store the actual chunk text
            chunkSequence: i,      // Store the sequence of the chunk
            // documentId field here explicitly links to parent, same as originalDocumentId from metadata
            documentId: documentMetadata.originalDocumentId
          },
        });
      }

      if (points.length > 0) {
        await this.qdrantClient.upsert(this.collectionName, {
          wait: true, // Wait for operation to complete
          points: points,
        });
        logger.info(`Stored ${points.length} chunks with embeddings for document: ${documentId}`);
      } else {
        logger.info(`No valid chunks to store for document: ${documentId}`);
      }
    } catch (error) {
      logger.error(`Failed to store document chunks for document ${documentId}:`, error);
      // Decide if this should throw, or just log. For now, logging.
      // throw error; // Uncomment if you want errors to propagate
    }
  }

  /**
   * Initialize the vector database collection
   */
  async initialize(): Promise<void> {
    try {
      const collections = await this.qdrantClient.getCollections();
      let existingCollectionInfo = collections.collections?.find(
        col => col.name === this.collectionName
      );

      if (existingCollectionInfo) {
        // Fetch detailed info to check vector size
        const detailedInfo = await this.qdrantClient.getCollection(this.collectionName);
        if (detailedInfo.config?.params?.vectors?.size !== this.vectorSize) {
          logger.warn(`Qdrant collection '${this.collectionName}' exists with WRONG vector size (${detailedInfo.config?.params?.vectors?.size} instead of ${this.vectorSize}). Deleting and recreating. THIS WILL WIPE EXISTING DATA IN THE COLLECTION.`);
          await this.qdrantClient.deleteCollection(this.collectionName);
          existingCollectionInfo = undefined; // Reset to ensure creation
        } else {
          logger.info(`Qdrant collection '${this.collectionName}' already exists with correct vector size.`);
        }
      }

      if (!existingCollectionInfo) {
        await this.qdrantClient.createCollection(this.collectionName, {
          vectors: {
            size: this.vectorSize, // Use the updated vectorSize
            distance: 'Cosine',
          },
        });
        logger.info(`Created Qdrant collection: '${this.collectionName}' with vector size ${this.vectorSize}.`);
        await this.createPayloadIndexes(); // Create indexes only for new collections
      } else {
        // If collection existed and was correct, ensure indexes are still attempted (idempotent)
        await this.createPayloadIndexes();
      }
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
    if (this.useMockImplementation || !this.genAI) {
      logger.warn('Gemini client not available or in mock mode, using mock embedding.');
      return this.generateMockEmbedding();
    }
    try {
      // Using "embedding-001" as specified, can be updated to "text-embedding-004" if that's preferred standard
      const model = this.genAI.getGenerativeModel({ model: "embedding-001" });
      // Gemini API might have different input limits, 8000 is a carry-over from OpenAI. Adjust if necessary.
      const result = await model.embedContent(text.substring(0, 8000));
      const embedding = result.embedding;
      if (!embedding || !embedding.values) {
        throw new Error('Invalid embedding response from Gemini');
      }
      return embedding.values;
    } catch (error) {
      logger.warn(`Failed to generate Gemini embedding for text snippet starting with: "${text.substring(0,50)}...", using mock:`, error);
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