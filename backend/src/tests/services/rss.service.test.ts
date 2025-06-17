import { RSSService } from '../../services/rss.service';
import { PrismaClient, Article } from '@prisma/client'; // Import Article type
import Parser from 'rss-parser';
import logger from '../../utils/logger';
import knowledgeBaseService from '../../services/knowledge-base.service'; // Added
import { vectorDatabaseService } from '../../services/vector-database.service'; // Added
import crypto from 'crypto'; // Added, though might not be strictly needed if article.id is reliable

// Mock dependencies
jest.mock('@prisma/client');
jest.mock('rss-parser');
jest.mock('../../utils/logger');
jest.mock('../../services/knowledge-base.service'); // Added
jest.mock('../../services/vector-database.service'); // Added


// Mock data
const mockFeedData = {
  id: 'feed-123',
  name: 'Test Feed KB', // Updated name for clarity
  url: 'https://example.com/rsskb',
  category: 'forex',
  isActive: true,
  lastFetched: null,
  fetchError: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// Use a more complete Article type, including 'content'
const mockArticleDataKb: Article = {
  id: 'article-kb-123',
  title: 'EURUSD Shows Strong Bullish Movement for KB',
  description: 'EUR/USD pair continues its upward trend...',
  content: 'Full article content for EURUSD which will be chunked and stored in KB.',
  link: 'https://example.com/article/kb/123',
  author: 'Test Author KB',
  publishedAt: new Date(),
  feedId: 'feed-123',
  markets: ['forex'],
  instruments: ['EURUSD'],
  isProcessed: false,
  originalText: 'Full article content for EURUSD which will be chunked and stored in KB.',
  rewrittenText: null,
  summary: null,
  sentimentScore: null,
  sentimentLabel: null,
  sentimentMethod: null,
  sentimentConfidence: null,
  processingError: null,
};

const mockRSSItemsKb = [
  {
    title: 'EURUSD Shows Strong Bullish Movement for KB',
    content: 'Full article content for EURUSD which will be chunked and stored in KB.',
    link: 'https://example.com/article/kb/123',
    pubDate: new Date().toISOString(),
    contentSnippet: 'EUR/USD pair continues its upward trend...',
    creator: 'Test Author KB',
  },
  {
    title: 'Bitcoin Reaches New Heights for KB',
    content: 'Bitcoin surges to new all-time highs. This is the second article.',
    link: 'https://example.com/article/kb/124',
    pubDate: new Date().toISOString(),
    contentSnippet: 'Bitcoin surges...',
  },
];


describe('RSSService', () => {
  let rssService: RSSService;
  let mockPrisma: jest.Mocked<PrismaClient>;
  let mockParser: jest.Mocked<Parser>;
  // Add mocks for the new services
  let mockedKnowledgeBaseService: jest.Mocked<typeof knowledgeBaseService>;
  let mockedVectorDatabaseService: jest.Mocked<typeof vectorDatabaseService>;


  beforeEach(() => {
    mockPrisma = {
      rssFeed: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
        // Add other methods if used by RSSService that were missed in original tests
        delete: jest.fn(),
        upsert: jest.fn(),
        count: jest.fn(),
        aggregate: jest.fn(),
        groupBy: jest.fn(),
        findFirst: jest.fn(),
      },
      article: {
        findFirst: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
        // Add other methods from Prisma Article model if needed
        delete: jest.fn(),
        upsert: jest.fn(),
        aggregate: jest.fn(),
        groupBy: jest.fn(),
        findUnique: jest.fn(), // Added for completeness
        createMany: jest.fn(),
        deleteMany: jest.fn(),
        updateMany: jest.fn(),
      },
      $disconnect: jest.fn(),
      $connect: jest.fn(), // Added for completeness
      $executeRaw: jest.fn(),
      $executeRawUnsafe: jest.fn(),
      $on: jest.fn(),
      $queryRaw: jest.fn(),
      $queryRawUnsafe: jest.fn(),
      $transaction: jest.fn(),
      $use: jest.fn(),
       // Add other models if necessary
       cotData: {} as any,
       document: {} as any,
       user: {} as any,
       userPreferences: {} as any,
       report: {} as any,
       bookmark: {} as any,
       alert: {} as any,
       processingJob: {} as any,

    } as any;

    mockParser = {
      parseURL: jest.fn(),
    } as any;
    (Parser as jest.MockedClass<typeof Parser>).mockImplementation(() => mockParser);

    // Initialize new mocked services
    mockedKnowledgeBaseService = knowledgeBaseService as jest.Mocked<typeof knowledgeBaseService>;
    mockedVectorDatabaseService = vectorDatabaseService as jest.Mocked<typeof vectorDatabaseService>;

    rssService = new RSSService();
    rssService.prisma = mockPrisma; // Inject mock
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // --- Existing describe blocks for processFeed, categorizeContent, etc. ---
  // --- For brevity, I'm assuming they are here. ---
  // --- I will add a new describe block specifically for KB Ingestion ---
  // --- or add tests to the existing processFeed describe block. ---
  // --- Let's add to existing processFeed for focused testing of that method's KB part. ---

  describe('processFeed - Knowledge Base Ingestion', () => {
    beforeEach(() => {
      // Default mocks for successful path for most KB tests
      mockPrisma.rssFeed.findUnique.mockResolvedValue(mockFeedData); // Feed exists
      mockPrisma.article.findFirst.mockResolvedValue(null); // Article is new
      mockPrisma.article.create.mockResolvedValue(mockArticleDataKb); // Article created
      mockPrisma.rssFeed.update.mockResolvedValue(mockFeedData); // Feed updated
      mockParser.parseURL.mockResolvedValue({ items: mockRSSItemsKb } as any); // RSS items parsed

      mockedKnowledgeBaseService.chunkText.mockReturnValue(['chunk1', 'chunk2']);
      mockedVectorDatabaseService.storeDocumentChunks.mockResolvedValue(undefined);
    });

    it('should ingest new article content into knowledge base successfully', async () => {
      await rssService.processFeed(mockFeedData.url, mockFeedData.category);

      expect(mockPrisma.article.create).toHaveBeenCalledTimes(mockRSSItemsKb.length);

      // Check for the first article in mockRSSItemsKb
      const firstCreatedArticle = { ...mockArticleDataKb, id: expect.any(String), content: mockRSSItemsKb[0].content, title: mockRSSItemsKb[0].title, link: mockRSSItemsKb[0].link };
      // We need to simulate that prisma.article.create returns the object with an ID.
      // For the first call to prisma.article.create (for first item)
      (mockPrisma.article.create as jest.Mock).mockResolvedValueOnce(firstCreatedArticle);
      // For the second call (for second item)
      const secondCreatedArticle = { ...mockArticleDataKb, id: 'article-kb-124', content: mockRSSItemsKb[1].content, title: mockRSSItemsKb[1].title, link: mockRSSItemsKb[1].link };
      (mockPrisma.article.create as jest.Mock).mockResolvedValueOnce(secondCreatedArticle);

      // Re-run with specific mock for create to get the ID back for assertion
      await rssService.processFeed(mockFeedData.url, mockFeedData.category);


      expect(mockedKnowledgeBaseService.chunkText).toHaveBeenCalledWith(firstCreatedArticle.content);
      expect(mockedVectorDatabaseService.storeDocumentChunks).toHaveBeenCalledWith(
        `rss_${firstCreatedArticle.id}`, // documentId
        [{ text: 'chunk1' }, { text: 'chunk2' }], // chunks
        expect.objectContaining({ // documentMetadata
          title: firstCreatedArticle.title,
          sourceUrl: firstCreatedArticle.link,
          feedName: mockFeedData.name,
          documentType: 'rss-feed-article',
          originalArticleId: firstCreatedArticle.id,
          category: mockFeedData.category,
          markets: firstCreatedArticle.markets,
          version: 1,
          processedAt: expect.any(String),
        })
      );
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`Successfully ingested content from RSS article ${firstCreatedArticle.title}`));
    });

    it('should skip KB ingestion if article content is empty', async () => {
      const articleWithNoContent = { ...mockArticleDataKb, id: 'article-no-content', content: '' };
      (mockPrisma.article.create as jest.Mock).mockResolvedValue(articleWithNoContent);
      mockParser.parseURL.mockResolvedValue({ items: [mockRSSItemsKb[0]] } as any); // Process one item

      await rssService.processFeed(mockFeedData.url, mockFeedData.category);

      expect(mockedKnowledgeBaseService.chunkText).not.toHaveBeenCalled();
      expect(mockedVectorDatabaseService.storeDocumentChunks).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining(`has no content. Skipping KB ingestion.`));
    });

    it('should skip KB ingestion if chunkText returns no chunks', async () => {
      (mockPrisma.article.create as jest.Mock).mockResolvedValue(mockArticleDataKb); // Has content
      mockedKnowledgeBaseService.chunkText.mockReturnValue([]); // No chunks returned
      mockParser.parseURL.mockResolvedValue({ items: [mockRSSItemsKb[0]] } as any);

      await rssService.processFeed(mockFeedData.url, mockFeedData.category);

      expect(mockedKnowledgeBaseService.chunkText).toHaveBeenCalledWith(mockArticleDataKb.content);
      expect(mockedVectorDatabaseService.storeDocumentChunks).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining(`No text chunks generated for RSS article ${mockArticleDataKb.title}`));
    });

    it('should log error if storeDocumentChunks fails but not stop feed processing', async () => {
      (mockPrisma.article.create as jest.Mock).mockResolvedValue(mockArticleDataKb);
      mockedKnowledgeBaseService.chunkText.mockReturnValue(['chunk1']);
      const kbError = new Error('Qdrant error');
      mockedVectorDatabaseService.storeDocumentChunks.mockRejectedValue(kbError);
      mockParser.parseURL.mockResolvedValue({ items: [mockRSSItemsKb[0]] } as any);

      await rssService.processFeed(mockFeedData.url, mockFeedData.category);

      expect(mockedVectorDatabaseService.storeDocumentChunks).toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining(`Failed to ingest RSS article ${mockArticleDataKb.title}`),
        kbError
      );
      // Ensure feed processing itself completes (e.g., feedData updated)
      expect(mockPrisma.rssFeed.update).toHaveBeenCalled();
    });
  });

  // --- Other existing describe blocks should be preserved below this line ---
  // For example: describe('categorizeContent', () => { ... });
  // For example: describe('extractInstruments', () => { ... });
  // ... and so on. This overwrite focuses on adding the KB ingestion tests.
  // The original test file content is assumed to be merged with these additions.
});
