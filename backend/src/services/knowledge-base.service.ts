import { PrismaClient } from '@prisma/client';
import { GoogleGenerativeAI } from '@google/generative-ai';
import path from 'path';
import fs from 'fs/promises';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import logger from '../utils/logger';
import config from '../config';
import { vectorDatabaseService } from './vector-database.service';
import { neo4jGraphService } from './neo4j-graph.service';

const prisma = new PrismaClient();

export interface DocumentProcessingResult {
  id: string;
  title: string;
  content: string; // Full content, might be very long
  summary: string;
  category: string;
  tags: string[];
  markets: string[];
  embedding?: number[]; // Embedding for the whole doc, if generated, now optional
  metadata: {
    filename: string;
    fileSize: number;
    mimeType: string;
    processingTime: number;
  };
}

export interface KnowledgeQuery {
  query: string;
  market?: string;
  category?: string;
  tags?: string[];
  limit?: number;
  threshold?: number;
}

export interface KnowledgeResult {
  query: string; // The original search query
  matchedChunks: MatchedChunk[];
  documents: DocumentProcessingResult[]; // Parent documents, perhaps unique set from matchedChunks
  summary?: string; // AI-generated summary of results
  relatedConcepts?: string[];
  confidence?: number;
}

export interface MatchedChunk {
  chunkId: string; // e.g., documentId_chunk_index
  text: string;
  score: number;
  originalDocumentId: string; // ID of the parent document/article
  documentTitle?: string; // Title of the parent document
  // Potentially other metadata from the chunk's Qdrant payload like category, markets, etc.
  category?: string;
  markets?: string[];
  tags?: string[];
  sourceUrl?: string;
  feedName?: string;
  documentType?: string;
  publishedAt?: string;
}

/**
 * Real-time Knowledge Base Service using AI for document processing and retrieval
 * Implements semantic search and knowledge graph capabilities
 */
export class KnowledgeBaseService {
  private genAI?: GoogleGenerativeAI;
  // private vectorDimension = 1536; // No longer needed here
  private knowledgeBasePath: string;

  constructor() {
    if (config.geminiApiKey) {
      this.genAI = new GoogleGenerativeAI(config.geminiApiKey);
    }
    this.knowledgeBasePath = path.join(process.cwd(), '../knowledge-base');
  }

  /**
   * Process all documents in the knowledge base
   */
  async processAllDocuments(): Promise<DocumentProcessingResult[]> {
    try {
      logger.info('Starting knowledge base processing...');
      const startTime = Date.now();
      
      const documents = await this.scanKnowledgeBase();
      const results: DocumentProcessingResult[] = [];
      
      for (const doc of documents) {
        try {
          const result = await this.processDocument(doc);
          if (result) {
            results.push(result);
            await this.storeDocument(result);
          }
        } catch (error) {
          logger.error(`Error processing document ${doc.filename}:`, error);
        }
      }
      
      const processingTime = Date.now() - startTime;
      logger.info(`Processed ${results.length} documents in ${processingTime}ms`);
      
      return results;
    } catch (error) {
      logger.error('Error processing knowledge base:', error);
      throw error;
    }
  }

  /**
   * Scan knowledge base directory for documents
   */
  private async scanKnowledgeBase(): Promise<Array<{filename: string; filePath: string}>> {
    const documents: Array<{filename: string; filePath: string}> = [];
    
    try {
      const entries = await fs.readdir(this.knowledgeBasePath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const subDir = path.join(this.knowledgeBasePath, entry.name);
          const subEntries = await fs.readdir(subDir, { withFileTypes: true });
          
          for (const subEntry of subEntries) {
            if (subEntry.isFile() && this.isSupportedFormat(subEntry.name)) {
              documents.push({
                filename: subEntry.name,
                filePath: path.join(subDir, subEntry.name)
              });
            }
          }
        } else if (entry.isFile() && this.isSupportedFormat(entry.name)) {
          documents.push({
            filename: entry.name,
            filePath: path.join(this.knowledgeBasePath, entry.name)
          });
        }
      }
      
      return documents;
    } catch (error) {
      logger.error('Error scanning knowledge base:', error);
      return [];
    }
  }

  /**
   * Check if file format is supported
   */
  private isSupportedFormat(filename: string): boolean {
    const supportedExtensions = ['.pdf', '.doc', '.docx', '.txt', '.md'];
    return supportedExtensions.some(ext => filename.toLowerCase().endsWith(ext));
  }

  /**
   * Process a single document
   */
  private async processDocument(doc: {filename: string; filePath: string}): Promise<DocumentProcessingResult | null> {
    try {
      const startTime = Date.now();
      logger.info(`Processing document: ${doc.filename}`);
      
      // Extract content based on file type
      const content = await this.extractContent(doc.filePath);
      if (!content || content.length < 100) {
        logger.warn(`Document ${doc.filename} has insufficient content`);
        return null;
      }

      // Get file stats
      const stats = await fs.stat(doc.filePath);
      
      // Analyze document with AI
      const analysis = await this.analyzeDocument(content, doc.filename);
      if (!analysis) {
        logger.warn(`Failed to analyze document: ${doc.filename}`);
        return null;
      }

      // const embedding = await this.generateEmbedding(content); // Old embedding logic removed

      const processingTime = Date.now() - startTime;

      // Determine document version
      const existingDocument = await prisma.document.findFirst({
        where: { filename: doc.filename },
        orderBy: { version: 'desc' },
      });
      const currentVersion = existingDocument ? existingDocument.version + 1 : 1;
      const documentId = this.generateDocumentId(doc.filename, currentVersion);

      const result: DocumentProcessingResult = { // Type assertion
        id: documentId, // Use versioned ID
        title: analysis.title || doc.filename,
        content, // Full content stored in Prisma
        summary: analysis.summary,
        category: analysis.category,
        tags: analysis.tags,
        markets: analysis.markets,
        // embedding: undefined, // Embedding for whole doc is no longer primary
        metadata: {
          filename: doc.filename,
          fileSize: stats.size,
          mimeType: this.getMimeType(doc.filename),
          processingTime
        }
      };

      // Chunk content and store chunks in vector database
      try {
        const textChunks = this.chunkText(content); // Default chunk size and overlap
        if (textChunks.length > 0) {
          await vectorDatabaseService.storeDocumentChunks(
            result.id,
            textChunks.map((chunkText, index) => ({
              // id: `${result.id}_chunk_${index}`, // Qdrant point ID is handled by vectorDB service
              text: chunkText,
            })),
            { // Document-level metadata for each chunk
              title: result.title,
              category: result.category,
              markets: result.markets,
              tags: result.tags,
              filename: result.metadata.filename,
              originalDocumentId: result.id, // This is the versioned ID
              version: currentVersion, // Add version to chunk metadata
            }
          );
          logger.info(`Stored ${textChunks.length} chunks for document ${result.id} (v${currentVersion}) in vector database.`);
        } else {
          logger.warn(`No text chunks generated for document ${result.id}. Content length: ${content.length}`);
        }
      } catch (error) {
        logger.warn(`Failed to store document chunks in vector database for ${result.id}: ${error}`);
      }

      // Process for graph database (can use result.summary or first few chunks if content is too long)
      try {
        await neo4jGraphService.processDocumentForGraph({
          id: result.id,
          title: result.title,
          content: result.content,
          category: result.category,
          markets: result.markets,
          tags: result.tags,
          filename: result.metadata.filename,
        });
        logger.info(`Processed document for graph database: ${result.id}`);
      } catch (error) {
        logger.warn(`Failed to process for graph database: ${error}`);
      }

      return result;
    } catch (error) {
      logger.error(`Error processing document ${doc.filename}:`, error);
      return null;
    }
  }

  /**
   * Extract content from document based on file type
   */
  private async extractContent(filePath: string): Promise<string> {
    const ext = path.extname(filePath).toLowerCase();
    
    try {
      switch (ext) {
        case '.pdf':
          const pdfBuffer = await fs.readFile(filePath);
          const pdfData = await pdfParse(pdfBuffer);
          return pdfData.text;
          
        case '.doc':
        case '.docx':
          const docBuffer = await fs.readFile(filePath);
          const docResult = await mammoth.extractRawText({ buffer: docBuffer });
          return docResult.value;
          
        case '.txt':
        case '.md':
          return await fs.readFile(filePath, 'utf-8');
          
        default:
          throw new Error(`Unsupported file type: ${ext}`);
      }
    } catch (error) {
      logger.error(`Error extracting content from ${filePath}:`, error);
      throw error;
    }
  }

  /**
   * Analyze document content using AI
   */
  private async analyzeDocument(content: string, filename: string): Promise<{
    title: string;
    summary: string;
    category: string;
    tags: string[];
    markets: string[];
  } | null> {
    try {
      if (!this.genAI) {
        // Fallback analysis without AI
        return this.fallbackAnalysis(content, filename);
      }

      const model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
      
      const prompt = `
        Analyze this financial document and extract key information:
        
        Filename: ${filename}
        Content: ${content.substring(0, 3000)}...
        
        Please provide:
        1. A descriptive title (if not clear from filename)
        2. A concise summary (2-3 sentences)
        3. Primary category (strategy, research, analysis, market-outlook, economic-data, technical-analysis)
        4. Relevant tags (max 10)
        5. Financial markets mentioned (forex, crypto, futures, stocks, bonds, commodities)
        
        Respond in this JSON format:
        {
          "title": "Document title",
          "summary": "Brief summary...",
          "category": "category",
          "tags": ["tag1", "tag2", "tag3"],
          "markets": ["market1", "market2"]
        }
      `;

      const result = await model.generateContent(prompt);
      const responseText = result.response.text();
      
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return this.fallbackAnalysis(content, filename);
      }

      const parsed = JSON.parse(jsonMatch[0]);
      return {
        title: parsed.title || filename,
        summary: parsed.summary || 'No summary available',
        category: parsed.category || 'research',
        tags: Array.isArray(parsed.tags) ? parsed.tags : [],
        markets: Array.isArray(parsed.markets) ? parsed.markets : []
      };
    } catch (error) {
      logger.error('Error analyzing document with AI:', error);
      return this.fallbackAnalysis(content, filename);
    }
  }

  /**
   * Fallback analysis without AI
   */
  private fallbackAnalysis(content: string, filename: string): {
    title: string;
    summary: string;
    category: string;
    tags: string[];
    markets: string[];
  } {
    const title = filename.replace(/\.[^/.]+$/, "");
    const summary = content.substring(0, 200) + "...";
    
    // Basic keyword detection
    const lowerContent = content.toLowerCase();
    const markets: string[] = [];
    
    if (lowerContent.includes('forex') || lowerContent.includes('fx') || lowerContent.includes('currency')) {
      markets.push('forex');
    }
    if (lowerContent.includes('crypto') || lowerContent.includes('bitcoin') || lowerContent.includes('ethereum')) {
      markets.push('crypto');
    }
    if (lowerContent.includes('futures') || lowerContent.includes('commodities') || lowerContent.includes('oil')) {
      markets.push('futures');
    }
    if (lowerContent.includes('stock') || lowerContent.includes('equity') || lowerContent.includes('s&p')) {
      markets.push('stocks');
    }

    const tags = this.extractBasicTags(content);
    
    return {
      title,
      summary,
      category: 'research',
      tags,
      markets
    };
  }

  /**
   * Extract basic tags from content
   */
  private extractBasicTags(content: string): string[] {
    const commonTerms = [
      'strategy', 'analysis', 'outlook', 'market', 'trading', 'risk',
      'volatility', 'trend', 'support', 'resistance', 'bullish', 'bearish',
      'technical', 'fundamental', 'economic', 'data', 'report'
    ];
    
    const lowerContent = content.toLowerCase();
    return commonTerms.filter(term => lowerContent.includes(term));
  }

  /**
   * Helper method to chunk text into smaller pieces.
   * @param text The input text.
   * @param chunkSize Approximate size of each chunk in characters.
   * @param overlap Number of characters to overlap between chunks.
   * @returns An array of text chunks.
   */
  public chunkText(text: string, chunkSize: number = 1000, overlap: number = 100): string[] {
    const chunks: string[] = [];
    if (!text) return chunks;

    let startIndex = 0;
    while (startIndex < text.length) {
      const endIndex = Math.min(startIndex + chunkSize, text.length);
      chunks.push(text.substring(startIndex, endIndex));
      startIndex += chunkSize - overlap;
      if (startIndex + overlap >= text.length && endIndex === text.length) { // Ensure last part is captured
          break;
      }
    }
    return chunks.filter(chunk => chunk.trim().length > 0); // Remove empty chunks
  }

  /**
   * Store processed document in database
   */
  private async storeDocument(doc: DocumentProcessingResult): Promise<void> {
    try {
      await prisma.document.upsert({
        where: { id: doc.id },
        create: {
          id: doc.id,
          title: doc.title,
          filename: doc.metadata.filename,
          originalName: doc.metadata.filename, // Assuming originalName is same as filename for file-based docs
          filePath: `knowledge-base/${doc.metadata.filename}`, // This might need adjustment if path depends on version
          fileSize: doc.metadata.fileSize,
          mimeType: doc.metadata.mimeType,
          content: doc.content,
          summary: doc.summary,
          category: doc.category,
          tags: doc.tags,
          markets: doc.markets,
          version: currentVersion, // Store the version
          // embedding: undefined, // Already optional and not set
          isProcessed: true
        },
        update: { // This block might not be strictly necessary if ID is always unique (filename + version)
          title: doc.title,
          content: doc.content,
          summary: doc.summary,
          category: doc.category,
          tags: doc.tags,
          markets: doc.markets,
          version: currentVersion, // Update version here too
          isProcessed: true,
          updatedAt: new Date()
        }
      });
      
      logger.info(`Stored document: ${doc.title}`);
    } catch (error) {
      logger.error(`Error storing document ${doc.title}:`, error);
      throw error;
    }
  }

  /**
   * Query knowledge base
   */
  async queryKnowledgeBase(query: KnowledgeQuery): Promise<KnowledgeResult> {
    try {
      const qdrantFilterConditions: any[] = [];
      if (query.category) {
        qdrantFilterConditions.push({ key: 'category', match: { value: query.category } });
      }
      if (query.market) {
        // Assuming 'markets' in Qdrant payload is an array of strings.
        // Qdrant's keyword match on an array checks if the value is one of the elements.
        qdrantFilterConditions.push({ key: 'markets', match: { keyword: query.market } });
      }
      if (query.tags && query.tags.length > 0) {
        query.tags.forEach(tag => {
          qdrantFilterConditions.push({ key: 'tags', match: { keyword: tag } });
        });
      }
      // Add a filter for documentType if you want to distinguish between 'rss-feed-article' and other types
      // qdrantFilterConditions.push({ key: 'documentType', match: { value: 'rss-feed-article' } });


      const qdrantFilter: any = { must: qdrantFilterConditions };
      if (qdrantFilterConditions.length === 0) {
        // delete qdrantFilter.must; // Qdrant might not like an empty must array, or pass undefined for filter
      }


      const vectorSearchResults = await vectorDatabaseService.searchSimilarDocuments(
        query.query,
        {
          limit: query.limit || 10,
          threshold: query.threshold || 0.70, // Adjusted threshold slightly
          filter: qdrantFilterConditions.length > 0 ? qdrantFilter : undefined,
        }
      );

      const matchedChunks: MatchedChunk[] = vectorSearchResults.map(res => ({
        chunkId: res.id, // This is the Qdrant point ID, e.g., documentId_chunk_index
        text: res.payload.chunkText || '',
        score: res.score,
        originalDocumentId: res.payload.originalDocumentId || res.payload.documentId,
        documentTitle: res.payload.title,
        category: res.payload.category,
        markets: res.payload.markets,
        tags: res.payload.tags,
        sourceUrl: res.payload.sourceUrl,
        feedName: res.payload.feedName,
        documentType: res.payload.documentType,
        publishedAt: res.payload.publishedAt,
      }));

      const parentDocumentIds = [...new Set(matchedChunks.map(chunk => chunk.originalDocumentId).filter(id => id))];
      let parentDocuments: DocumentProcessingResult[] = [];

      if (parentDocumentIds.length > 0) {
        const prismaDocs = await prisma.document.findMany({
          where: { id: { in: parentDocumentIds } },
        });
        parentDocuments = prismaDocs.map(doc => ({
          id: doc.id,
          title: doc.title,
          content: doc.content || '', // Full content might be too large for response, consider summary
          summary: doc.summary || '',
          category: doc.category || 'unknown',
          tags: doc.tags,
          markets: doc.markets,
          metadata: {
            filename: doc.filename,
            fileSize: doc.fileSize,
            mimeType: doc.mimeType,
            processingTime: 0, // This was from original processing, may not be relevant here
          },
        }));
      }
      
      const summary = await this.generateQuerySummary(query.query, matchedChunks);
      const relatedConcepts = this.extractRelatedConcepts(parentDocuments); // Or from chunks

      return {
        query: query.query,
        matchedChunks,
        documents: parentDocuments,
        summary: summary || undefined,
        relatedConcepts,
        confidence: matchedChunks.length > 0 ? (matchedChunks.reduce((sum, chunk) => sum + chunk.score, 0) / matchedChunks.length) : 0.1,
      };
    } catch (error) {
      logger.error('Error querying knowledge base:', error);
      // Return a structured error or rethrow
      return {
        query: query.query,
        matchedChunks: [],
        documents: [],
        summary: 'Error performing search.',
        confidence: 0,
        relatedConcepts: [],
      };
    }
  }

  /**
   * Generate summary for query results based on matched chunks
   */
  private async generateQuerySummary(query: string, matchedChunks: MatchedChunk[]): Promise<string | null> {
    try {
      if (!this.genAI || matchedChunks.length === 0) {
        return null;
      }

      const model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' }); // Ensure this is an appropriate model
      
      const contextForSummary = matchedChunks
        .slice(0, 5) // Use top N chunks for summary context
        .map(chunk => `Source Document: ${chunk.documentTitle || chunk.originalDocumentId}\nChunk: "${chunk.text}"`)
        .join('\n\n---\n\n');
      
      const prompt = `
        User Query: "${query}"
        
        Relevant Information Extracted (multiple chunks from potentially different documents):
        ---
        ${contextForSummary}
        ---
        
        Based *only* on the provided relevant information and the user query, synthesize a comprehensive answer.
        If the information is insufficient to answer the query, state that clearly.
        Focus on actionable trading insights and market analysis if the query and context allow.
        Keep the summary concise (2-3 paragraphs). Do not invent information not present in the chunks.
      `;

      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (error) {
      logger.error('Error generating query summary:', error);
      return null;
    }
  }

  /**
   * Extract related concepts from results
   */
  private extractRelatedConcepts(results: DocumentProcessingResult[]): string[] {
    const allTags = results.flatMap(doc => doc.tags);
    const tagCounts = allTags.reduce((acc, tag) => {
      acc[tag] = (acc[tag] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    return Object.entries(tagCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([tag]) => tag);
  }

  /**
   * Get knowledge base statistics
   */
  async getStatistics(): Promise<{
    totalDocuments: number;
    processedDocuments: number;
    categories: Record<string, number>;
    markets: Record<string, number>;
    lastProcessed: Date | null;
  }> {
    try {
      const [total, processed, categories, markets, lastProcessed] = await Promise.all([
        prisma.document.count(),
        prisma.document.count({ where: { isProcessed: true } }),
        prisma.document.groupBy({
          by: ['category'],
          where: { isProcessed: true },
          _count: { category: true }
        }),
        prisma.document.findMany({
          where: { isProcessed: true },
          select: { markets: true }
        }),
        prisma.document.findFirst({
          where: { isProcessed: true },
          orderBy: { updatedAt: 'desc' },
          select: { updatedAt: true }
        })
      ]);

      // Count markets
      const marketCounts: Record<string, number> = {};
      markets.forEach(doc => {
        doc.markets.forEach(market => {
          marketCounts[market] = (marketCounts[market] || 0) + 1;
        });
      });

      // Count categories
      const categoryCounts = categories.reduce((acc, cat) => {
        acc[cat.category || 'unknown'] = cat._count.category;
        return acc;
      }, {} as Record<string, number>);

      return {
        totalDocuments: total,
        processedDocuments: processed,
        categories: categoryCounts,
        markets: marketCounts,
        lastProcessed: lastProcessed?.updatedAt || null
      };
    } catch (error) {
      logger.error('Error getting knowledge base statistics:', error);
      throw error;
    }
  }

  /**
   * Helper methods
   */
  private generateDocumentId(filename: string, version?: number): string {
    const baseId = `doc_${filename.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    return version ? `${baseId}_v${version}` : baseId;
  }

  private getMimeType(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.txt': 'text/plain',
      '.md': 'text/markdown'
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }

  private extractKeyPhrasesForContext(text: string, wordCount: number = 50): string {
    if (!text) return '';
    return text.split(' ').slice(0, wordCount).join(' ');
  }

  async rewriteArticleWithKnowledge(
    articleIdOrText: { id?: string; text?: string },
    rewriteInstructions: string
  ): Promise<{ rewrittenText: string; originalArticleId?: string; sources?: MatchedChunk[]; error?: string }> {
    if (!this.genAI) {
      logger.error('Gemini AI client is not initialized. Cannot rewrite article.');
      return { error: 'AI service not available.' };
    }

    let originalText: string | undefined | null;
    let originalArticleId: string | undefined;

    if (articleIdOrText.id) {
      originalArticleId = articleIdOrText.id;
      try {
        const document = await prisma.document.findUnique({ where: { id: originalArticleId } });
        if (!document || !document.content) {
          return { error: "Original article not found or has no content.", originalArticleId };
        }
        originalText = document.content;
      } catch (dbError) {
        logger.error(`Error fetching document ${originalArticleId} from Prisma:`, dbError);
        return { error: "Failed to fetch original article.", originalArticleId };
      }
    } else if (articleIdOrText.text) {
      originalText = articleIdOrText.text;
    } else {
      return { error: "Article ID or text must be provided." };
    }

    if (!originalText) { // Should be caught by earlier checks, but as a safeguard
        return { error: "Original article content is missing." };
    }

    let contextResult: KnowledgeResult | null = null;
    let additionalContext = "No additional context found.";
    try {
        const contextQuery = this.extractKeyPhrasesForContext(originalText);
        if (contextQuery) {
            contextResult = await this.queryKnowledgeBase({ query: contextQuery, limit: 3, threshold: 0.7 });
            if (contextResult && contextResult.matchedChunks && contextResult.matchedChunks.length > 0) {
                additionalContext = contextResult.matchedChunks.map(chunk => chunk.text).join('\n\n---\n\n');
            }
        }
    } catch (contextError) {
        logger.warn("Failed to retrieve additional context for rewriting, proceeding without it:", contextError);
        // Proceed without additional context if this step fails
    }

    const prompt = `
      Original Article Text:
      ---
      ${originalText.substring(0, 15000)}
      ---

      Rewrite Instructions: "${rewriteInstructions}"

      Additional Context from Knowledge Base (use this to enrich the rewrite if relevant, but prioritize the rewrite instructions and original article's core information):
      ---
      ${additionalContext}
      ---

      Please provide only the rewritten article text:
    `;

    try {
      const model = this.genAI.getGenerativeModel({ model: "gemini-pro" });
      const llmResult = await model.generateContent(prompt);
      const rewrittenText = llmResult.response.text();
      return { rewrittenText, originalArticleId, sources: contextResult?.matchedChunks || [] };
    } catch (llmError) {
      logger.error('Error calling Gemini API for rewriting article:', llmError);
      return { error: "Failed to rewrite article due to an LLM API error.", originalArticleId };
    }
  }

  async answerQueryWithKnowledge(
    userQuery: string,
    filters?: { market?: string; category?: string; tags?: string[] }
  ): Promise<{ answer: string; sources: MatchedChunk[]; query: string } | { error: string; query: string }> {
    if (!this.genAI) {
      logger.error('Gemini AI client is not initialized. Cannot answer query.');
      return { error: 'AI service not available.', query: userQuery };
    }

    try {
      const searchResults = await this.queryKnowledgeBase({
        query: userQuery,
        ...filters,
        limit: 5, // Use a fixed limit for context gathering
        threshold: 0.7, // Ensure decent relevance for context
      });

      if (!searchResults.matchedChunks || searchResults.matchedChunks.length === 0) {
        return { error: "Could not find relevant information in the knowledge base to answer this query.", query: userQuery };
      }

      const contextForAnswering = searchResults.matchedChunks
        .map(chunk => `Source Document: ${chunk.documentTitle || chunk.originalDocumentId}\nRelevant Text: "${chunk.text}"`)
        .join('\n\n---\n\n');

      const prompt = `
        User Query: "${userQuery}"

        Based *only* on the following context from the knowledge base, provide a comprehensive answer to the user query.
        If the context does not contain enough information to answer the query directly, state that and explain what information is missing. Do not use any external knowledge.

        Context:
        ---
        ${contextForAnswering}
        ---

        Answer:
      `;

      const model = this.genAI.getGenerativeModel({ model: "gemini-pro" });
      const llmResult = await model.generateContent(prompt);
      const answer = llmResult.response.text();

      return { answer, sources: searchResults.matchedChunks, query: userQuery };

    } catch (error) {
      logger.error('Error answering query with knowledge base:', error);
      return { error: 'Failed to generate an answer using the knowledge base.', query: userQuery };
    }
  }
}

export default new KnowledgeBaseService();
