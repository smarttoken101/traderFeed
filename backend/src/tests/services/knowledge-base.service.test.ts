import { KnowledgeBaseService, DocumentProcessingResult, MatchedChunk, KnowledgeResult, KnowledgeQuery } from '../../services/knowledge-base.service';
import { PrismaClient } from '@prisma/client';
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import fs from 'fs/promises';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import { vectorDatabaseService } from '../../services/vector-database.service';
import { neo4jGraphService } from '../../services/neo4j-graph.service';
import config from '../../config';
import logger from '../../utils/logger';
import path from 'path'; // Import path for knowledgeBasePath

// --- MOCKS ---
jest.mock('fs/promises');
jest.mock('pdf-parse');
jest.mock('mammoth');
jest.mock('@google/generative-ai');
jest.mock('../../services/vector-database.service', () => ({
  vectorDatabaseService: {
    storeDocumentChunks: jest.fn(),
    searchSimilarDocuments: jest.fn(),
    processAndStoreDocument: jest.fn(),
  }
}));
jest.mock('../../services/neo4j-graph.service', () => ({
  neo4jGraphService: {
    processDocumentForGraph: jest.fn(),
  }
}));

const mockPrismaClient = {
  document: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    upsert: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    groupBy: jest.fn(),
  },
};
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => mockPrismaClient),
}));

jest.mock('../../config', () => ({
  __esModule: true,
  default: {
    geminiApiKey: 'test-gemini-key',
  },
}));
jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

// Typed Mocks
const mockedFs = fs as jest.Mocked<typeof fs>;
const mockedPdfParse = pdfParse as jest.MockedFunction<typeof pdfParse>;
const mockedMammoth = mammoth as jest.Mocked<typeof mammoth>;
const mockedVectorDatabaseService = vectorDatabaseService as jest.Mocked<typeof vectorDatabaseService>;
const mockedNeo4jGraphService = neo4jGraphService as jest.Mocked<typeof neo4jGraphService>;
const MockedGoogleGenerativeAI = GoogleGenerativeAI as jest.MockedClass<typeof GoogleGenerativeAI>;
const mockGenerateContent = jest.fn();
const mockGetGenerativeModel = jest.fn(() => ({
  generateContent: mockGenerateContent,
}));

describe('KnowledgeBaseService', () => {
  let knowledgeBaseServiceInstance: KnowledgeBaseService;
  // This is just for type hinting, the actual mock is above.
  let mockPrisma: jest.Mocked<PrismaClient>;


  beforeEach(() => {
    jest.clearAllMocks();
    (MockedGoogleGenerativeAI as jest.Mock).mockImplementation(() => ({
      getGenerativeModel: mockGetGenerativeModel,
    }) as any);

    knowledgeBaseServiceInstance = new KnowledgeBaseService();
    // Assign the auto-mocked prisma client instance for type-safety if needed in tests directly
    // However, typically you'd use mockPrismaClient.document.* for assertions.
    mockPrisma = new PrismaClient() as any;
  });

  describe('Constructor', () => {
    it('should initialize GoogleGenerativeAI if geminiApiKey is present in config', () => {
      // Config is mocked to have geminiApiKey
      const service = new KnowledgeBaseService(); // Instantiation triggers constructor
      expect(MockedGoogleGenerativeAI).toHaveBeenCalledWith('test-gemini-key');
      expect((service as any).genAI).toBeDefined();
    });

    it('should not initialize GoogleGenerativeAI if geminiApiKey is missing', () => {
      const originalApiKey = config.geminiApiKey;
      (config as any).geminiApiKey = undefined;
      const service = new KnowledgeBaseService();
      expect((service as any).genAI).toBeUndefined();
      (config as any).geminiApiKey = originalApiKey; // Restore
    });

    it('should set knowledgeBasePath correctly', () => {
      expect((knowledgeBaseServiceInstance as any).knowledgeBasePath).toEqual(path.join(process.cwd(), '../knowledge-base'));
    });
  });

  describe('chunkText', () => {
    it('should return empty array for empty text', () => {
      expect(knowledgeBaseServiceInstance.chunkText('')).toEqual([]);
    });
    it('should return single chunk if text is shorter than chunk size', () => {
      const text = "Short text.";
      expect(knowledgeBaseServiceInstance.chunkText(text, 100, 10)).toEqual([text]);
    });
    it('should create multiple chunks for longer text with overlap', () => {
      const text = "This is a longer text that needs to be chunked properly for testing purposes. We need to ensure overlap works as expected.";
      const chunks = knowledgeBaseServiceInstance.chunkText(text, 30, 10);
      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks[0]).toBe("This is a longer text that ne");
      expect(chunks[1]).toBe(" text that needs to be chunked");
    });
  });

  describe('processDocument', () => {
    const mockDoc = { filename: 'test.pdf', filePath: '/fake/path/test.pdf' };
    const mockFileStats = { size: 1024 };
    const mockPdfText = 'This is PDF content. It is long enough for processing.';
    const mockAiAnalysis = {
      title: 'Test PDF Title', summary: 'Summary of PDF.', category: 'research',
      tags: ['pdf', 'test'], markets: ['general'],
    };
    const versionedDocIdV1 = 'doc_test_pdf_v1';

    beforeEach(() => {
      mockedFs.stat.mockResolvedValue(mockFileStats as any);
      mockedPdfParse.mockResolvedValue({ text: mockPdfText } as any);
      mockGenerateContent.mockResolvedValue({ response: { text: () => JSON.stringify(mockAiAnalysis) } });
      mockedVectorDatabaseService.storeDocumentChunks.mockResolvedValue(undefined);
      mockedNeo4jGraphService.processDocumentForGraph.mockResolvedValue(undefined);
      (mockPrismaClient.document.findFirst as jest.Mock).mockResolvedValue(null); // Default to new document
      (mockPrismaClient.document.upsert as jest.Mock).mockResolvedValue({ id: versionedDocIdV1 } as any);
    });

    it('successfully processes a new PDF document', async () => {
      const result = await (knowledgeBaseServiceInstance as any).processDocument(mockDoc);
      expect(mockedPdfParse).toHaveBeenCalled();
      expect(mockGenerateContent).toHaveBeenCalled(); // AI analysis
      expect(mockedVectorDatabaseService.storeDocumentChunks).toHaveBeenCalledWith(
        versionedDocIdV1, expect.any(Array),
        expect.objectContaining({ title: mockAiAnalysis.title, version: 1, originalDocumentId: versionedDocIdV1 })
      );
      expect(mockPrismaClient.document.upsert).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: versionedDocIdV1 }, create: expect.objectContaining({ version: 1 })
      }));
      expect(result?.id).toBe(versionedDocIdV1);
    });

    it('correctly increments version for an existing document', async () => {
      (mockPrismaClient.document.findFirst as jest.Mock).mockResolvedValue({ filename: mockDoc.filename, version: 1, id:'doc_test_pdf_v1' });
      const versionedDocIdV2 = 'doc_test_pdf_v2';
      (mockPrismaClient.document.upsert as jest.Mock).mockResolvedValue({ id: versionedDocIdV2 } as any);

      const result = await (knowledgeBaseServiceInstance as any).processDocument(mockDoc);
      expect(mockedVectorDatabaseService.storeDocumentChunks).toHaveBeenCalledWith(
        versionedDocIdV2, expect.any(Array), expect.objectContaining({ version: 2, originalDocumentId: versionedDocIdV2 })
      );
      expect(mockPrismaClient.document.upsert).toHaveBeenCalledWith(expect.objectContaining({
         where: { id: versionedDocIdV2 }, create: expect.objectContaining({ version: 2 })
      }));
      expect(result?.id).toBe(versionedDocIdV2);
    });

    // Add tests for DOCX, TXT, content extraction failure, AI analysis failure, insufficient content...
  });

  describe('processAllDocuments', () => {
    it('should process all documents found by scanKnowledgeBase', async () => {
        const mockScanResults = [
            { filename: 'file1.pdf', filePath: 'path/to/file1.pdf' },
            { filename: 'file2.txt', filePath: 'path/to/file2.txt' },
        ];
        (mockedFs.readdir as jest.Mock).mockImplementation((dirPath) => {
            if (dirPath === (knowledgeBaseServiceInstance as any).knowledgeBasePath) {
                return Promise.resolve(mockScanResults.map(f => ({ name: f.filename, isFile: () => true, isDirectory: () => false })));
            }
            return Promise.resolve([]);
        });

        const processDocumentSpy = jest.spyOn(knowledgeBaseServiceInstance as any, 'processDocument')
            .mockResolvedValueOnce(createMockDocResult('id1', 'file1.pdf', 'content1'))
            .mockResolvedValueOnce(createMockDocResult('id2', 'file2.txt', 'content2'));

        const storeDocumentSpy = jest.spyOn(knowledgeBaseServiceInstance as any, 'storeDocument').mockResolvedValue(undefined);

        await knowledgeBaseServiceInstance.processAllDocuments();

        expect(processDocumentSpy).toHaveBeenCalledTimes(mockScanResults.length);
        expect(storeDocumentSpy).toHaveBeenCalledTimes(mockScanResults.length);
    });
  });


  describe('queryKnowledgeBase', () => {
    const query: KnowledgeQuery = { query: 'test query', category: 'research', limit: 5 };
    const mockQdrantChunks = [
      { id: 'doc1_v1_chunk_0', score: 0.9, payload: { chunkText: 'text1', originalDocumentId: 'doc1_v1', title: 'Doc 1', category: 'research' } },
    ];
    const mockPrismaDocs = [{ id: 'doc1_v1', title: 'Doc 1', content: 'full content', summary:'s1', filename:'f1.pdf', fileSize:1, mimeType:'app/pdf', tags:[], markets:[], category:'research', version: 1, isProcessed: true, originalName: 'f1.pdf', filePath: 'path/f1.pdf', createdAt: new Date(), updatedAt: new Date(), processingError: null, uploadedBy: null, isPublic: false, embedding: null }];


    it('should query vector DB, fetch parent docs, and generate summary', async () => {
      mockedVectorDatabaseService.searchSimilarDocuments.mockResolvedValue(mockQdrantChunks as any);
      (mockPrismaClient.document.findMany as jest.Mock).mockResolvedValue(mockPrismaDocs);
      mockGenerateContent.mockResolvedValue({ response: { text: () => 'AI summary for query' } });

      const result = await knowledgeBaseServiceInstance.queryKnowledgeBase(query);
      expect(mockedVectorDatabaseService.searchSimilarDocuments).toHaveBeenCalledWith(
        query.query, expect.objectContaining({ filter: { must: [{ key: 'category', match: { value: 'research' }}] }})
      );
      expect(mockPrismaClient.document.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: ['doc1_v1'] } } }));
      expect(mockGenerateContent).toHaveBeenCalled(); // For summary
      expect(result.matchedChunks.length).toBe(1);
      expect(result.documents.length).toBe(1);
      expect(result.summary).toBe('AI summary for query');
    });
  });

  describe('answerQueryWithKnowledge', () => {
    const userQuery = 'What is fintech?';
    const mockContextChunks: MatchedChunk[] = [
      { chunkId: 'doc_fin_v1_chunk_0', text: 'Fintech is financial technology.', score: 0.88, originalDocumentId: 'doc_fin_v1', documentTitle: 'Fintech Explained' }
    ];

    it('should generate an answer using context from knowledge base', async () => {
      // Mock queryKnowledgeBase to return some chunks
      jest.spyOn(knowledgeBaseServiceInstance, 'queryKnowledgeBase').mockResolvedValue({
        query: userQuery, matchedChunks: mockContextChunks, documents: [], confidence: 0.88
      });
      mockGenerateContent.mockResolvedValue({ response: { text: () => 'Fintech is the new tech for finance.' } });

      const result = await knowledgeBaseServiceInstance.answerQueryWithKnowledge(userQuery);
      expect(knowledgeBaseServiceInstance.queryKnowledgeBase).toHaveBeenCalledWith(expect.objectContaining({ query: userQuery }));
      expect(mockGenerateContent).toHaveBeenCalledWith(expect.stringContaining('Fintech is financial technology.'));
      expect(result).toEqual({ answer: 'Fintech is the new tech for finance.', sources: mockContextChunks, query: userQuery });
    });
  });

  describe('rewriteArticleWithKnowledge', () => {
    const articleId = 'doc_rewrite_v1';
    const originalContent = 'This is an article about market trends. It is quite long.';
    const instructions = 'Summarize this for a busy executive.';
    const rewrittenText = 'Market trends summarized for executives.';

    it('should rewrite article by ID, using KB context', async () => {
        (mockPrismaClient.document.findUnique as jest.Mock).mockResolvedValue({ id: articleId, content: originalContent, title: 'Market Trends' });
        jest.spyOn(knowledgeBaseServiceInstance, 'queryKnowledgeBase').mockResolvedValue({
            query: expect.any(String),
            matchedChunks: [{ chunkId: 'ctx_chunk_0', text: 'Some related context.', score: 0.8, originalDocumentId: 'ctx_doc', documentTitle: 'Context Doc' }],
            documents: []
        });
        mockGenerateContent.mockResolvedValue({ response: { text: () => rewrittenText }});

        const result = await knowledgeBaseServiceInstance.rewriteArticleWithKnowledge({ id: articleId }, instructions);
        expect(mockPrismaClient.document.findUnique).toHaveBeenCalledWith({ where: { id: articleId }});
        expect(knowledgeBaseServiceInstance.queryKnowledgeBase).toHaveBeenCalled();
        expect(mockGenerateContent).toHaveBeenCalledWith(expect.stringContaining(originalContent) && expect.stringContaining(instructions) && expect.stringContaining('Some related context.'));
        expect(result.rewrittenText).toBe(rewrittenText);
        expect(result.sources?.length).toBe(1);
    });
  });

  describe('getStatistics', () => {
    it('should aggregate and return statistics from Prisma', async () => {
        (mockPrismaClient.document.count as jest.Mock).mockResolvedValueOnce(100).mockResolvedValueOnce(95); // Total, Processed
        (mockPrismaClient.document.groupBy as jest.Mock).mockResolvedValue([ { category: 'research', _count: { category: 50 } }, { category: 'news', _count: { category: 45 } } ]);
        (mockPrismaClient.document.findMany as jest.Mock).mockResolvedValue([ { markets: ['forex', 'stocks'] }, { markets: ['forex', 'crypto'] } ]);
        const testDate = new Date();
        (mockPrismaClient.document.findFirst as jest.Mock).mockResolvedValue({ updatedAt: testDate });

        const stats = await knowledgeBaseServiceInstance.getStatistics();
        expect(stats.totalDocuments).toBe(100);
        expect(stats.processedDocuments).toBe(95);
        expect(stats.categories).toEqual({ research: 50, news: 45 });
        expect(stats.markets).toEqual({ forex: 2, stocks: 1, crypto: 1 });
        expect(stats.lastProcessed).toEqual(testDate);
    });
  });

});

// Helper to create mock DocumentProcessingResult for tests
function createMockDocResult(id: string, filename: string, content: string): DocumentProcessingResult {
    return {
        id,
        title: `Title for ${filename}`,
        content,
        summary: `Summary for ${filename}`,
        category: 'test-category',
        tags: ['test'],
        markets: ['test-market'],
        metadata: {
            filename,
            fileSize: 1234,
            mimeType: 'application/pdf', // example
            processingTime: 100,
        }
    };
}
