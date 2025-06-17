import VectorDatabaseServiceDefaultExport, { VectorDatabaseService } from '../../services/vector-database.service'; // Import both default and named
import { QdrantClient } from '@qdrant/js-client-rest';
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import config from '../../config';
import logger from '../../utils/logger';

jest.mock('@qdrant/js-client-rest');
jest.mock('@google/generative-ai');

// Mock config directly here as per instructions
jest.mock('../../config', () => ({
  __esModule: true, // This is important for ES6 modules
  default: { // Assuming 'config' is a default export from '../../config'
    geminiApiKey: 'test-gemini-key',
    qdrantUrl: 'http://test-qdrant-url',
    qdrantApiKey: 'test-qdrant-key',
  },
}));

jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));


describe('VectorDatabaseService', () => {
  let vectorDBService: VectorDatabaseService;
  let mockQdrantClientInstance: jest.Mocked<QdrantClient>;
  let mockGenAIInstance: jest.Mocked<GoogleGenerativeAI>;
  let mockGenModelInstance: jest.Mocked<GenerativeModel>;

  const TEST_COLLECTION_NAME = 'documents'; // Match the service's private readonly collectionName
  const CORRECT_VECTOR_SIZE = 768; // Match the service's private readonly vectorSize

  beforeEach(() => {
    // Reset and reconfigure mocks for QdrantClient
    mockQdrantClientInstance = {
      getCollections: jest.fn(),
      createCollection: jest.fn(),
      getCollection: jest.fn(),
      deleteCollection: jest.fn(),
      createPayloadIndex: jest.fn(),
      upsert: jest.fn(),
      search: jest.fn(),
    } as any;
    (QdrantClient as jest.Mock).mockImplementation(() => mockQdrantClientInstance);

    // Reset and reconfigure mocks for GoogleGenerativeAI
    mockGenModelInstance = {
      embedContent: jest.fn(),
    } as any;
    mockGenAIInstance = {
      getGenerativeModel: jest.fn().mockReturnValue(mockGenModelInstance),
    } as any;
    (GoogleGenerativeAI as jest.Mock).mockImplementation(() => mockGenAIInstance);

    // Instantiate the service, it will use the mocked clients above
    vectorDBService = new VectorDatabaseService();
    jest.clearAllMocks();
  });

  describe('Constructor & Initialize', () => {
    it('should initialize QdrantClient and GoogleGenerativeAI from config', () => {
      expect(QdrantClient).toHaveBeenCalledWith({
        url: 'http://test-qdrant-url',
        apiKey: 'test-qdrant-key',
      });
      expect(GoogleGenerativeAI).toHaveBeenCalledWith('test-gemini-key');
    });

    it('should initialize and create collection if it does not exist', async () => {
      mockQdrantClientInstance.getCollections.mockResolvedValueOnce({ collections: [] });
      mockQdrantClientInstance.createCollection.mockResolvedValueOnce(true);
      mockQdrantClientInstance.createPayloadIndex.mockResolvedValue({} as any); // Simulate success

      await vectorDBService.initialize();

      expect(mockQdrantClientInstance.getCollections).toHaveBeenCalledTimes(1);
      expect(mockQdrantClientInstance.createCollection).toHaveBeenCalledWith(TEST_COLLECTION_NAME, {
        vectors: {
          size: CORRECT_VECTOR_SIZE,
          distance: 'Cosine',
        },
      });
      expect(mockQdrantClientInstance.createPayloadIndex).toHaveBeenCalledTimes(4); // For category, markets, tags, createdAt
      expect(logger.info).toHaveBeenCalledWith(`Created Qdrant collection: '${TEST_COLLECTION_NAME}' with vector size ${CORRECT_VECTOR_SIZE}.`);
    });

    it('should use existing collection if it exists with correct vector size', async () => {
      mockQdrantClientInstance.getCollections.mockResolvedValueOnce({ collections: [{ name: TEST_COLLECTION_NAME, id: 1, points_count: 0, segments_count:0, indexed_vectors_count: 0, vectors_count:0 }] });
      mockQdrantClientInstance.getCollection.mockResolvedValueOnce({
        name: TEST_COLLECTION_NAME,
        config: { params: { vectors: { size: CORRECT_VECTOR_SIZE } } },
      } as any);
       mockQdrantClientInstance.createPayloadIndex.mockResolvedValue({} as any);


      await vectorDBService.initialize();

      expect(mockQdrantClientInstance.getCollection).toHaveBeenCalledWith(TEST_COLLECTION_NAME);
      expect(mockQdrantClientInstance.createCollection).not.toHaveBeenCalled();
      expect(mockQdrantClientInstance.deleteCollection).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(`Qdrant collection '${TEST_COLLECTION_NAME}' already exists with correct vector size.`);
    });

    it('should delete and recreate collection if it exists with incorrect vector size', async () => {
      const INCORRECT_VECTOR_SIZE = 1024;
      mockQdrantClientInstance.getCollections.mockResolvedValueOnce({ collections: [{ name: TEST_COLLECTION_NAME, id:1, points_count:0, segments_count:0, indexed_vectors_count:0, vectors_count:0 }] });
      mockQdrantClientInstance.getCollection.mockResolvedValueOnce({
        name: TEST_COLLECTION_NAME,
        config: { params: { vectors: { size: INCORRECT_VECTOR_SIZE } } },
      } as any);
      mockQdrantClientInstance.deleteCollection.mockResolvedValueOnce(true);
      mockQdrantClientInstance.createCollection.mockResolvedValueOnce(true);
      mockQdrantClientInstance.createPayloadIndex.mockResolvedValue({} as any);

      await vectorDBService.initialize();

      expect(mockQdrantClientInstance.deleteCollection).toHaveBeenCalledWith(TEST_COLLECTION_NAME);
      expect(logger.warn).toHaveBeenCalledWith(
        `Qdrant collection '${TEST_COLLECTION_NAME}' exists with WRONG vector size (${INCORRECT_VECTOR_SIZE} instead of ${CORRECT_VECTOR_SIZE}). Deleting and recreating. THIS WILL WIPE EXISTING DATA IN THE COLLECTION.`
      );
      expect(mockQdrantClientInstance.createCollection).toHaveBeenCalledWith(TEST_COLLECTION_NAME, {
        vectors: { size: CORRECT_VECTOR_SIZE, distance: 'Cosine' },
      });
       expect(logger.info).toHaveBeenCalledWith(`Created Qdrant collection: '${TEST_COLLECTION_NAME}' with vector size ${CORRECT_VECTOR_SIZE}.`);
    });

    it('should fall back to useMockImplementation if Qdrant initialization fails', async () => {
      mockQdrantClientInstance.getCollections.mockRejectedValueOnce(new Error('Qdrant connection error'));
      
      await vectorDBService.initialize();

      expect(logger.error).toHaveBeenCalledWith('Failed to initialize vector database:', expect.any(Error));
      // Access private member for testing - this is generally discouraged but sometimes necessary
      expect((vectorDBService as any).useMockImplementation).toBe(true);
    });
  });

  describe('generateEmbedding', () => {
    const sampleText = 'This is a test text for embedding.';
    const mockEmbeddingValues = Array.from({ length: CORRECT_VECTOR_SIZE }, (_, i) => i * 0.01);

    it('should generate embedding successfully using Gemini', async () => {
      mockGenModelInstance.embedContent.mockResolvedValueOnce({
        embedding: { values: mockEmbeddingValues },
      });

      const embedding = await vectorDBService.generateEmbedding(sampleText);

      expect(mockGenAIInstance.getGenerativeModel).toHaveBeenCalledWith({ model: 'embedding-001' });
      expect(mockGenModelInstance.embedContent).toHaveBeenCalledWith(sampleText.substring(0, 8000));
      expect(embedding).toEqual(mockEmbeddingValues);
    });

    it('should fall back to mock embedding if Gemini API fails', async () => {
      mockGenModelInstance.embedContent.mockRejectedValueOnce(new Error('Gemini API error'));
      const spyOnMockEmbedding = jest.spyOn(vectorDBService as any, 'generateMockEmbedding');

      const embedding = await vectorDBService.generateEmbedding(sampleText);

      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Failed to generate Gemini embedding'), expect.any(Error));
      expect(spyOnMockEmbedding).toHaveBeenCalled();
      expect(embedding.length).toBe(CORRECT_VECTOR_SIZE);
      spyOnMockEmbedding.mockRestore();
    });

    it('should use mock embedding if genAI is not configured', async () => {
        (config as any).geminiApiKey = undefined; // Simulate no API key
        const serviceWithoutKey = new VectorDatabaseService(); // Re-instantiate
        const spyOnMockEmbedding = jest.spyOn(serviceWithoutKey as any, 'generateMockEmbedding');

        const embedding = await serviceWithoutKey.generateEmbedding(sampleText);

        expect(logger.warn).toHaveBeenCalledWith('Gemini client not available or in mock mode, using mock embedding.');
        expect(spyOnMockEmbedding).toHaveBeenCalled();
        expect(embedding.length).toBe(CORRECT_VECTOR_SIZE);
        spyOnMockEmbedding.mockRestore();
        (config as any).geminiApiKey = 'test-gemini-key'; // Restore for other tests
    });

    it('generateMockEmbedding should return array of correct size', () => {
      const mockEmbedding = (vectorDBService as any).generateMockEmbedding();
      expect(mockEmbedding).toBeInstanceOf(Array);
      expect(mockEmbedding.length).toBe(CORRECT_VECTOR_SIZE);
      mockEmbedding.forEach((val: number) => expect(typeof val).toBe('number'));
    });
  });

  describe('storeDocumentChunks', () => {
    const documentId = 'doc123';
    const chunks = [{ text: 'Chunk 1 text' }, { text: 'Chunk 2 text' }];
    const documentMetadata = { title: 'Test Doc', category: 'test', originalDocumentId: 'doc123_orig', tags:[], markets:[], filename: 'test.txt', version: 1 };
    const mockEmbeddings = [
      Array.from({ length: CORRECT_VECTOR_SIZE }, () => 0.1),
      Array.from({ length: CORRECT_VECTOR_SIZE }, () => 0.2),
    ];

    it('should store document chunks successfully', async () => {
      const generateEmbeddingSpy = jest.spyOn(vectorDBService, 'generateEmbedding')
        .mockResolvedValueOnce(mockEmbeddings[0])
        .mockResolvedValueOnce(mockEmbeddings[1]);
      mockQdrantClientInstance.upsert.mockResolvedValueOnce({} as any);

      await vectorDBService.storeDocumentChunks(documentId, chunks, documentMetadata);

      expect(generateEmbeddingSpy).toHaveBeenCalledTimes(chunks.length);
      expect(generateEmbeddingSpy).toHaveBeenCalledWith(chunks[0].text);
      expect(generateEmbeddingSpy).toHaveBeenCalledWith(chunks[1].text);
      expect(mockQdrantClientInstance.upsert).toHaveBeenCalledWith(TEST_COLLECTION_NAME, {
        wait: true,
        points: [
          {
            id: `${documentId}_chunk_0`,
            vector: mockEmbeddings[0],
            payload: { ...documentMetadata, chunkText: chunks[0].text, chunkSequence: 0, documentId: documentMetadata.originalDocumentId },
          },
          {
            id: `${documentId}_chunk_1`,
            vector: mockEmbeddings[1],
            payload: { ...documentMetadata, chunkText: chunks[1].text, chunkSequence: 1, documentId: documentMetadata.originalDocumentId },
          },
        ],
      });
      expect(logger.info).toHaveBeenCalledWith(`Stored ${chunks.length} chunks with embeddings for document: ${documentId}`);
      generateEmbeddingSpy.mockRestore();
    });

    it('should log and not throw if Qdrant upsert fails, as per current implementation', async () => {
        jest.spyOn(vectorDBService, 'generateEmbedding').mockResolvedValue(mockEmbeddings[0]);
        mockQdrantClientInstance.upsert.mockRejectedValueOnce(new Error('Qdrant upsert error'));

        await vectorDBService.storeDocumentChunks(documentId, chunks, documentMetadata);

        expect(logger.error).toHaveBeenCalledWith(`Failed to store document chunks for document ${documentId}:`, expect.any(Error));
    });


    it('should use mock implementation if useMockImplementation is true', async () => {
      (vectorDBService as any).useMockImplementation = true;
      await vectorDBService.storeDocumentChunks(documentId, chunks, documentMetadata);
      expect(logger.info).toHaveBeenCalledWith(`Mock: Would store ${chunks.length} chunks for document ${documentId}`);
      expect(mockQdrantClientInstance.upsert).not.toHaveBeenCalled();
      (vectorDBService as any).useMockImplementation = false; // Reset for other tests
    });
  });

  describe('searchSimilarDocuments', () => {
    const queryText = 'search query';
    const mockQueryEmbedding = Array.from({ length: CORRECT_VECTOR_SIZE }, () => 0.3);
    const mockQdrantResults = [
      { id: 'res1', score: 0.9, payload: { title: 'Result 1' } },
      { id: 'res2', score: 0.8, payload: { title: 'Result 2' } },
    ];

    it('should search for similar documents successfully', async () => {
      jest.spyOn(vectorDBService, 'generateEmbedding').mockResolvedValueOnce(mockQueryEmbedding);
      mockQdrantClientInstance.search.mockResolvedValueOnce(mockQdrantResults as any);

      const options = { limit: 5, threshold: 0.75, filter: { some_key: 'some_value' } };
      const results = await vectorDBService.searchSimilarDocuments(queryText, options);

      expect(vectorDBService.generateEmbedding).toHaveBeenCalledWith(queryText);
      expect(mockQdrantClientInstance.search).toHaveBeenCalledWith(TEST_COLLECTION_NAME, {
        vector: mockQueryEmbedding,
        limit: options.limit,
        score_threshold: options.threshold,
        filter: options.filter,
        with_payload: true,
      });
      expect(results).toEqual(mockQdrantResults.map(r => ({ id: r.id as string, score: r.score, payload: r.payload })));
    });

    it('should fall back to mock search results if Qdrant search fails', async () => {
      jest.spyOn(vectorDBService, 'generateEmbedding').mockResolvedValueOnce(mockQueryEmbedding);
      mockQdrantClientInstance.search.mockRejectedValueOnce(new Error('Qdrant search error'));
      const spyOnMockSearch = jest.spyOn(vectorDBService as any, 'getMockSearchResults');

      const results = await vectorDBService.searchSimilarDocuments(queryText);

      expect(logger.error).toHaveBeenCalledWith('Failed to search similar documents:', expect.any(Error));
      expect(spyOnMockSearch).toHaveBeenCalledWith(queryText, 10); // Default limit
      expect(results.length).toBeGreaterThanOrEqual(0); // Mock results returned
      spyOnMockSearch.mockRestore();
    });

    it('should use mock search if useMockImplementation is true', async () => {
        (vectorDBService as any).useMockImplementation = true;
        const spyOnMockSearch = jest.spyOn(vectorDBService as any, 'getMockSearchResults');

        const results = await vectorDBService.searchSimilarDocuments(queryText);

        expect(spyOnMockSearch).toHaveBeenCalledWith(queryText, 10);
        expect(vectorDBService.generateEmbedding).not.toHaveBeenCalled();
        expect(mockQdrantClientInstance.search).not.toHaveBeenCalled();
        (vectorDBService as any).useMockImplementation = false; // Reset
    });
  });
});
