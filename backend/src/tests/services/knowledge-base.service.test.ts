import { KnowledgeBaseService } from '../../services/knowledge-base.service';
import { PrismaClient } from '@prisma/client';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs/promises';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import logger from '../../utils/logger';
import { vectorDatabaseService } from '../../services/vector-database.service';
import { neo4jGraphService } from '../../services/neo4j-graph.service';

// Mock dependencies
jest.mock('@prisma/client');
jest.mock('@google/generative-ai');
jest.mock('fs/promises');
jest.mock('pdf-parse');
jest.mock('mammoth');
jest.mock('../../utils/logger');
jest.mock('../../services/vector-database.service');
jest.mock('../../services/neo4j-graph.service');

// Mock data
const mockDocument = {
  id: 'doc-123',
  title: 'Trading Strategy Analysis',
  filename: 'strategy.pdf',
  originalName: 'strategy.pdf',
  filePath: '/path/to/strategy.pdf',
  fileSize: 1024000,
  mimeType: 'application/pdf',
  content: 'This is a comprehensive trading strategy document...',
  summary: 'A trading strategy focused on forex markets...',
  category: 'strategy',
  tags: ['forex', 'trading', 'analysis'],
  markets: ['forex'],
  embedding: new Array(1536).fill(0.1),
  isProcessed: true,
  processingError: null,
  uploadedBy: null,
  isPublic: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockProcessingResult = {
  id: 'doc-123',
  title: 'Trading Strategy Analysis',
  content: 'This is a comprehensive trading strategy document...',
  summary: 'A trading strategy focused on forex markets...',
  category: 'strategy',
  tags: ['forex', 'trading', 'analysis'],
  markets: ['forex'],
  embedding: new Array(1536).fill(0.1),
  metadata: {
    filename: 'strategy.pdf',
    fileSize: 1024000,
    mimeType: 'application/pdf',
    processingTime: 1500,
  },
};

const mockKnowledgeResult = {
  documents: [mockProcessingResult],
  summary: 'Found relevant trading strategy documents...',
  relatedConcepts: ['forex', 'technical analysis', 'risk management'],
  confidence: 0.85,
};

describe('KnowledgeBaseService', () => {
  let knowledgeBaseService: KnowledgeBaseService;
  let mockPrisma: jest.Mocked<PrismaClient>;
  let mockGenAI: jest.Mocked<GoogleGenerativeAI>;

  beforeEach(() => {
    // Setup mocks
    mockPrisma = {
      document: {
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      $disconnect: jest.fn(),
    } as any;

    mockGenAI = {
      getGenerativeModel: jest.fn().mockReturnValue({
        generateContent: jest.fn(),
      }),
    } as any;

    // Mock GoogleGenerativeAI constructor
    (GoogleGenerativeAI as jest.MockedClass<typeof GoogleGenerativeAI>).mockImplementation(() => mockGenAI);

    // Mock file system operations
    (fs.readdir as jest.Mock).mockResolvedValue([]);
    (fs.readFile as jest.Mock).mockResolvedValue(Buffer.from('test content'));
    (fs.stat as jest.Mock).mockResolvedValue({ size: 1024000 });

    // Mock PDF parsing
    (pdfParse as jest.Mock).mockResolvedValue({
      text: 'This is extracted PDF content',
      numpages: 10,
      info: {},
    });

    // Mock Word document parsing
    (mammoth.extractRawText as jest.Mock).mockResolvedValue({
      value: 'This is extracted Word content',
      messages: [],
    });

    // Mock vector database service
    (vectorDatabaseService.addDocument as jest.Mock).mockResolvedValue({ id: 'vector-123' });
    (vectorDatabaseService.searchSimilarDocuments as jest.Mock).mockResolvedValue([
      { id: 'doc-123', score: 0.9, metadata: {} }
    ]);

    // Mock Neo4j service
    (neo4jGraphService.addEntity as jest.Mock).mockResolvedValue(true);
    (neo4jGraphService.createRelationship as jest.Mock).mockResolvedValue(true);

    knowledgeBaseService = new KnowledgeBaseService();
    (knowledgeBaseService as any).prisma = mockPrisma;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('processAllDocuments', () => {
    it('should process all documents in the knowledge base', async () => {
      // Setup mocks
      const mockDocuments = [
        { filename: 'doc1.pdf', filePath: '/path/doc1.pdf' },
        { filename: 'doc2.pdf', filePath: '/path/doc2.pdf' },
      ];

      jest.spyOn(knowledgeBaseService as any, 'scanKnowledgeBase').mockResolvedValue(mockDocuments);
      jest.spyOn(knowledgeBaseService as any, 'processDocument').mockResolvedValue(mockProcessingResult);
      jest.spyOn(knowledgeBaseService as any, 'storeDocument').mockResolvedValue(mockDocument);

      // Execute
      const result = await knowledgeBaseService.processAllDocuments();

      // Verify
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(mockProcessingResult);
      expect(logger.info).toHaveBeenCalledWith('Starting knowledge base processing...');
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Processed 2 documents'));
    });

    it('should handle document processing errors gracefully', async () => {
      // Setup mocks
      const mockDocuments = [
        { filename: 'good.pdf', filePath: '/path/good.pdf' },
        { filename: 'bad.pdf', filePath: '/path/bad.pdf' },
      ];

      jest.spyOn(knowledgeBaseService as any, 'scanKnowledgeBase').mockResolvedValue(mockDocuments);
      jest.spyOn(knowledgeBaseService as any, 'processDocument')
        .mockResolvedValueOnce(mockProcessingResult)
        .mockRejectedValueOnce(new Error('Processing failed'));
      jest.spyOn(knowledgeBaseService as any, 'storeDocument').mockResolvedValue(mockDocument);

      // Execute
      const result = await knowledgeBaseService.processAllDocuments();

      // Verify
      expect(result).toHaveLength(1);
      expect(logger.error).toHaveBeenCalledWith(
        'Error processing document bad.pdf:',
        expect.any(Error)
      );
    });
  });

  describe('scanKnowledgeBase', () => {
    it('should scan and return supported document files', async () => {
      // Setup mock directory structure
      const mockEntries = [
        { name: 'doc1.pdf', isDirectory: () => false, isFile: () => true },
        { name: 'doc2.docx', isDirectory: () => false, isFile: () => true },
        { name: 'image.jpg', isDirectory: () => false, isFile: () => true }, // unsupported
        { name: 'subfolder', isDirectory: () => true, isFile: () => false },
      ];

      const mockSubEntries = [
        { name: 'subdoc.pdf', isDirectory: () => false, isFile: () => true },
      ];

      (fs.readdir as jest.Mock)
        .mockResolvedValueOnce(mockEntries)
        .mockResolvedValueOnce(mockSubEntries);

      // Execute
      const result = await (knowledgeBaseService as any).scanKnowledgeBase();

      // Verify
      expect(result).toHaveLength(3); // Only supported files
      expect(result).toContainEqual({
        filename: 'doc1.pdf',
        filePath: expect.stringContaining('doc1.pdf'),
      });
      expect(result).toContainEqual({
        filename: 'doc2.docx',
        filePath: expect.stringContaining('doc2.docx'),
      });
      expect(result).toContainEqual({
        filename: 'subdoc.pdf',
        filePath: expect.stringContaining('subdoc.pdf'),
      });
    });

    it('should handle directory scanning errors', async () => {
      // Setup mock error
      (fs.readdir as jest.Mock).mockRejectedValue(new Error('Permission denied'));

      // Execute
      const result = await (knowledgeBaseService as any).scanKnowledgeBase();

      // Verify
      expect(result).toEqual([]);
      expect(logger.error).toHaveBeenCalledWith(
        'Error scanning knowledge base:',
        expect.any(Error)
      );
    });
  });

  describe('isSupportedFormat', () => {
    it('should return true for supported file formats', () => {
      const supportedFiles = [
        'document.pdf',
        'report.doc',
        'analysis.docx',
        'notes.txt',
        'readme.md',
      ];

      supportedFiles.forEach(filename => {
        expect((knowledgeBaseService as any).isSupportedFormat(filename)).toBe(true);
      });
    });

    it('should return false for unsupported file formats', () => {
      const unsupportedFiles = [
        'image.jpg',
        'video.mp4',
        'archive.zip',
        'executable.exe',
        'stylesheet.css',
      ];

      unsupportedFiles.forEach(filename => {
        expect((knowledgeBaseService as any).isSupportedFormat(filename)).toBe(false);
      });
    });

    it('should be case insensitive', () => {
      expect((knowledgeBaseService as any).isSupportedFormat('DOCUMENT.PDF')).toBe(true);
      expect((knowledgeBaseService as any).isSupportedFormat('Report.DOC')).toBe(true);
      expect((knowledgeBaseService as any).isSupportedFormat('image.JPG')).toBe(false);
    });
  });

  describe('extractContent', () => {
    it('should extract content from PDF files', async () => {
      const result = await (knowledgeBaseService as any).extractContent('/path/document.pdf');

      expect(pdfParse).toHaveBeenCalled();
      expect(result).toBe('This is extracted PDF content');
    });

    it('should extract content from Word documents', async () => {
      const result = await (knowledgeBaseService as any).extractContent('/path/document.docx');

      expect(mammoth.extractRawText).toHaveBeenCalled();
      expect(result).toBe('This is extracted Word content');
    });

    it('should extract content from text files', async () => {
      const result = await (knowledgeBaseService as any).extractContent('/path/document.txt');

      expect(fs.readFile).toHaveBeenCalledWith('/path/document.txt', 'utf-8');
      expect(result).toBe('test content');
    });

    it('should handle extraction errors', async () => {
      (pdfParse as jest.Mock).mockRejectedValue(new Error('PDF parsing failed'));

      const result = await (knowledgeBaseService as any).extractContent('/path/document.pdf');

      expect(result).toBe('');
      expect(logger.error).toHaveBeenCalledWith(
        'Error extracting content from /path/document.pdf:',
        expect.any(Error)
      );
    });
  });

  describe('queryKnowledge', () => {
    it('should perform hybrid search and return results', async () => {
      // Setup mocks
      mockPrisma.document.findMany.mockResolvedValue([mockDocument]);

      const mockModel = {
        generateContent: jest.fn().mockResolvedValue({
          response: {
            text: () => 'This is a summary of trading strategies...'
          }
        })
      };

      mockGenAI.getGenerativeModel.mockReturnValue(mockModel as any);

      const query = {
        query: 'forex trading strategies',
        market: 'forex',
        limit: 5,
      };

      // Execute
      const result = await knowledgeBaseService.queryKnowledge(query);

      // Verify
      expect(vectorDatabaseService.searchSimilarDocuments).toHaveBeenCalledWith(
        'forex trading strategies',
        5,
        0.7
      );
      expect(mockPrisma.document.findMany).toHaveBeenCalled();
      expect(result.documents).toHaveLength(1);
      expect(result.summary).toContain('trading strategies');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should handle queries without results', async () => {
      // Setup mocks for no results
      (vectorDatabaseService.searchSimilarDocuments as jest.Mock).mockResolvedValue([]);
      mockPrisma.document.findMany.mockResolvedValue([]);

      const query = {
        query: 'nonexistent topic',
        limit: 5,
      };

      // Execute
      const result = await knowledgeBaseService.queryKnowledge(query);

      // Verify
      expect(result.documents).toHaveLength(0);
      expect(result.confidence).toBe(0);
    });
  });

  describe('categorizeDocument', () => {
    it('should categorize forex-related documents', () => {
      const content = 'EUR/USD trading strategy and forex market analysis';
      const filename = 'forex_strategy.pdf';

      const result = (knowledgeBaseService as any).categorizeDocument(content, filename);

      expect(result.category).toBe('strategy');
      expect(result.markets).toContain('forex');
      expect(result.tags).toContain('forex');
    });

    it('should categorize research documents', () => {
      const content = 'Market research and economic analysis of global trends';
      const filename = 'market_research.pdf';

      const result = (knowledgeBaseService as any).categorizeDocument(content, filename);

      expect(result.category).toBe('research');
      expect(result.tags).toContain('research');
    });

    it('should extract multiple markets from content', () => {
      const content = 'Analysis of forex, crypto, and futures markets with trading strategies';
      const filename = 'multi_market_analysis.pdf';

      const result = (knowledgeBaseService as any).categorizeDocument(content, filename);

      expect(result.markets).toContain('forex');
      expect(result.markets).toContain('crypto');
      expect(result.markets).toContain('futures');
    });
  });

  describe('generateSummary', () => {
    it('should generate AI-powered summary', async () => {
      const mockModel = {
        generateContent: jest.fn().mockResolvedValue({
          response: {
            text: () => 'This document discusses forex trading strategies...'
          }
        })
      };

      mockGenAI.getGenerativeModel.mockReturnValue(mockModel as any);

      const content = 'Long document content about forex trading...';

      const result = await (knowledgeBaseService as any).generateSummary(content);

      expect(mockModel.generateContent).toHaveBeenCalled();
      expect(result).toContain('forex trading strategies');
    });

    it('should handle AI generation errors', async () => {
      const mockModel = {
        generateContent: jest.fn().mockRejectedValue(new Error('AI service unavailable'))
      };

      mockGenAI.getGenerativeModel.mockReturnValue(mockModel as any);

      const content = 'Document content...';

      const result = await (knowledgeBaseService as any).generateSummary(content);

      expect(result).toBe('Summary could not be generated.');
      expect(logger.error).toHaveBeenCalledWith(
        'Error generating summary:',
        expect.any(Error)
      );
    });
  });

  describe('storeDocument', () => {
    it('should store document in database and vector store', async () => {
      mockPrisma.document.create.mockResolvedValue(mockDocument);

      await (knowledgeBaseService as any).storeDocument(mockProcessingResult);

      expect(mockPrisma.document.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          title: mockProcessingResult.title,
          content: mockProcessingResult.content,
          summary: mockProcessingResult.summary,
          category: mockProcessingResult.category,
          tags: mockProcessingResult.tags,
          markets: mockProcessingResult.markets,
          embedding: mockProcessingResult.embedding,
        })
      });

      expect(vectorDatabaseService.addDocument).toHaveBeenCalled();
      expect(neo4jGraphService.addEntity).toHaveBeenCalled();
    });

    it('should handle storage errors', async () => {
      mockPrisma.document.create.mockRejectedValue(new Error('Database error'));

      await expect(
        (knowledgeBaseService as any).storeDocument(mockProcessingResult)
      ).rejects.toThrow('Database error');

      expect(logger.error).toHaveBeenCalledWith(
        'Error storing document:',
        expect.any(Error)
      );
    });
  });
});
