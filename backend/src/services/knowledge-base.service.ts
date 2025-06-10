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
  content: string;
  summary: string;
  category: string;
  tags: string[];
  markets: string[];
  embedding: number[];
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
  documents: DocumentProcessingResult[];
  summary: string;
  relatedConcepts: string[];
  confidence: number;
}

/**
 * Real-time Knowledge Base Service using AI for document processing and retrieval
 * Implements semantic search and knowledge graph capabilities
 */
export class KnowledgeBaseService {
  private genAI?: GoogleGenerativeAI;
  private vectorDimension = 1536; // OpenAI embedding dimension
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

      // Generate embedding (mock for now - would use OpenAI or similar)
      const embedding = await this.generateEmbedding(content);

      const processingTime = Date.now() - startTime;

      const result = {
        id: this.generateDocumentId(doc.filename),
        title: analysis.title || doc.filename,
        content,
        summary: analysis.summary,
        category: analysis.category,
        tags: analysis.tags,
        markets: analysis.markets,
        embedding,
        metadata: {
          filename: doc.filename,
          fileSize: stats.size,
          mimeType: this.getMimeType(doc.filename),
          processingTime
        }
      };

      // Store in vector database
      try {
        await vectorDatabaseService.processAndStoreDocument({
          id: result.id,
          title: result.title,
          content: result.content,
          category: result.category,
          markets: result.markets,
          tags: result.tags,
          filename: result.metadata.filename,
        });
        logger.info(`Stored document in vector database: ${result.id}`);
      } catch (error) {
        logger.warn(`Failed to store in vector database: ${error}`);
      }

      // Process for graph database
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
   * Generate document embedding (mock implementation)
   */
  private async generateEmbedding(content: string): Promise<number[]> {
    // This is a mock implementation
    // In production, use OpenAI embeddings or similar
    const hash = this.simpleHash(content);
    const embedding = Array.from({ length: this.vectorDimension }, (_, i) => 
      Math.sin(hash + i) * 0.1
    );
    return embedding;
  }

  /**
   * Simple hash function for mock embeddings
   */
  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash;
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
          originalName: doc.metadata.filename,
          filePath: `knowledge-base/${doc.metadata.filename}`,
          fileSize: doc.metadata.fileSize,
          mimeType: doc.metadata.mimeType,
          content: doc.content,
          summary: doc.summary,
          category: doc.category,
          tags: doc.tags,
          markets: doc.markets,
          embedding: doc.embedding,
          isProcessed: true
        },
        update: {
          title: doc.title,
          content: doc.content,
          summary: doc.summary,
          category: doc.category,
          tags: doc.tags,
          markets: doc.markets,
          embedding: doc.embedding,
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
      const queryEmbedding = await this.generateEmbedding(query.query);
      
      // Build filters
      const where: any = {
        isProcessed: true
      };
      
      if (query.market) {
        where.markets = { has: query.market };
      }
      
      if (query.category) {
        where.category = query.category;
      }
      
      if (query.tags && query.tags.length > 0) {
        where.tags = { hasSome: query.tags };
      }

      // Get documents (simplified semantic search)
      const documents = await prisma.document.findMany({
        where,
        take: query.limit || 10,
        orderBy: { updatedAt: 'desc' }
      });

      // Convert to results format
      const results: DocumentProcessingResult[] = documents.map(doc => ({
        id: doc.id,
        title: doc.title,
        content: doc.content || '',
        summary: doc.summary || '',
        category: doc.category || 'research',
        tags: doc.tags,
        markets: doc.markets,
        embedding: doc.embedding,
        metadata: {
          filename: doc.filename,
          fileSize: doc.fileSize,
          mimeType: doc.mimeType,
          processingTime: 0
        }
      }));

      // Generate summary using AI
      const summary = await this.generateQuerySummary(query.query, results);
      
      return {
        documents: results,
        summary: summary || 'No summary available',
        relatedConcepts: this.extractRelatedConcepts(results),
        confidence: results.length > 0 ? 0.8 : 0.2
      };
    } catch (error) {
      logger.error('Error querying knowledge base:', error);
      throw error;
    }
  }

  /**
   * Generate summary for query results
   */
  private async generateQuerySummary(query: string, results: DocumentProcessingResult[]): Promise<string | null> {
    try {
      if (!this.genAI || results.length === 0) {
        return null;
      }

      const model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
      
      const summaries = results.slice(0, 5).map(doc => 
        `${doc.title}: ${doc.summary}`
      ).join('\n\n');
      
      const prompt = `
        Based on the user query "${query}" and these relevant documents:
        
        ${summaries}
        
        Provide a comprehensive summary that addresses the query using insights from these documents.
        Focus on actionable trading insights and market analysis.
        Keep it concise but informative (2-3 paragraphs).
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
  private generateDocumentId(filename: string): string {
    return `doc_${filename.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
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
}

export default new KnowledgeBaseService();
