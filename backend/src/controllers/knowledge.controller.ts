import { Request, Response } from 'express';
import knowledgeBaseService from '../services/knowledge-base.service';
import graphKnowledgeService from '../services/graph-knowledge.service';
import context7MCPService from '../services/context7-mcp.service';
import logger from '../utils/logger';

/**
 * Knowledge Base Controller
 * Handles API endpoints for document processing, search, and knowledge management
 */
export class KnowledgeBaseController {
  /**
   * Process all documents in knowledge base
   */
  async processDocuments(req: Request, res: Response): Promise<void> {
    try {
      logger.info('Starting knowledge base processing request');
      
      const results = await knowledgeBaseService.processAllDocuments();
      
      res.json({
        success: true,
        data: {
          processedCount: results.length,
          documents: results.map(doc => ({
            id: doc.id,
            title: doc.title,
            category: doc.category,
            markets: doc.markets,
            tags: doc.tags,
            processingTime: doc.metadata.processingTime
          }))
        },
        message: `Successfully processed ${results.length} documents`
      });
    } catch (error) {
      logger.error('Error processing documents:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to process documents',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Query knowledge base
   */
  async queryKnowledgeBase(req: Request, res: Response): Promise<void> {
    try {
      const {
        query,
        market,
        category,
        tags,
        limit = 10,
        threshold = 0.5
      } = req.body;

      if (!query) {
        res.status(400).json({
          success: false,
          error: 'Query parameter is required'
        });
        return;
      }

      const results = await knowledgeBaseService.queryKnowledgeBase({
        query,
        market,
        category,
        tags: tags ? (Array.isArray(tags) ? tags : [tags]) : undefined,
        limit: Math.min(limit, 50), // Cap at 50 results
        threshold
      });

      res.json({
        success: true,
        data: results
      });
    } catch (error) {
      logger.error('Error querying knowledge base:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to query knowledge base',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get knowledge base statistics
   */
  async getStatistics(req: Request, res: Response): Promise<void> {
    try {
      const stats = await knowledgeBaseService.getStatistics();
      
      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      logger.error('Error getting knowledge base statistics:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get statistics',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Search documents by filters
   */
  async searchDocuments(req: Request, res: Response): Promise<void> {
    try {
      const {
        search,
        market,
        category,
        tags,
        limit = 20,
        offset = 0
      } = req.query;

      // Build query for knowledge base
      const kbQuery = {
        query: search as string || '',
        market: market as string,
        category: category as string,
        tags: tags ? (Array.isArray(tags) ? tags as string[] : [tags as string]) : undefined,
        limit: Math.min(Number(limit), 50)
      };

      const results = await knowledgeBaseService.queryKnowledgeBase(kbQuery);

      res.json({
        success: true,
        data: {
          documents: results.documents.map(doc => ({
            id: doc.id,
            title: doc.title,
            summary: doc.summary,
            category: doc.category,
            markets: doc.markets,
            tags: doc.tags,
            filename: doc.metadata.filename,
            fileSize: doc.metadata.fileSize
          })),
          summary: results.summary,
          relatedConcepts: results.relatedConcepts,
          confidence: results.confidence,
          total: results.documents.length
        }
      });
    } catch (error) {
      logger.error('Error searching documents:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to search documents',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get document by ID
   */
  async getDocument(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      
      // Query with specific document ID
      const results = await knowledgeBaseService.queryKnowledgeBase({
        query: id,
        limit: 1
      });

      if (results.documents.length === 0) {
        res.status(404).json({
          success: false,
          error: 'Document not found'
        });
        return;
      }

      const document = results.documents[0];
      
      res.json({
        success: true,
        data: {
          id: document.id,
          title: document.title,
          content: document.content.substring(0, 5000), // Limit content for API response
          summary: document.summary,
          category: document.category,
          markets: document.markets,
          tags: document.tags,
          metadata: document.metadata
        }
      });
    } catch (error) {
      logger.error('Error getting document:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get document',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}

/**
 * Graph Knowledge Controller
 * Handles API endpoints for knowledge graph operations
 */
export class GraphKnowledgeController {
  /**
   * Build knowledge graph
   */
  async buildGraph(req: Request, res: Response): Promise<void> {
    try {
      logger.info('Starting knowledge graph build request');
      
      await graphKnowledgeService.buildKnowledgeGraph();
      
      res.json({
        success: true,
        message: 'Knowledge graph built successfully'
      });
    } catch (error) {
      logger.error('Error building knowledge graph:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to build knowledge graph',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Query knowledge graph
   */
  async queryGraph(req: Request, res: Response): Promise<void> {
    try {
      const {
        centerNode,
        nodeTypes,
        maxDepth = 2,
        minConfidence = 0.5,
        timeframe,
        limit = 50
      } = req.query;

      const query = {
        centerNode: centerNode as string,
        nodeTypes: nodeTypes ? (Array.isArray(nodeTypes) ? nodeTypes as string[] : [nodeTypes as string]) : undefined,
        maxDepth: Number(maxDepth),
        minConfidence: Number(minConfidence),
        timeframe: timeframe ? {
          from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Default 7 days
          to: new Date()
        } : undefined,
        limit: Math.min(Number(limit), 100)
      };

      const results = await graphKnowledgeService.queryGraph(query);
      
      res.json({
        success: true,
        data: results
      });
    } catch (error) {
      logger.error('Error querying knowledge graph:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to query knowledge graph',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get contextual insights
   */
  async getContextualInsights(req: Request, res: Response): Promise<void> {
    try {
      const { query, market } = req.body;

      if (!query) {
        res.status(400).json({
          success: false,
          error: 'Query parameter is required'
        });
        return;
      }

      const insights = await graphKnowledgeService.getContextualInsights(query, market);
      
      res.json({
        success: true,
        data: insights
      });
    } catch (error) {
      logger.error('Error getting contextual insights:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get contextual insights',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get graph statistics
   */
  async getGraphStatistics(req: Request, res: Response): Promise<void> {
    try {
      const stats = await graphKnowledgeService.getStatistics();
      
      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      logger.error('Error getting graph statistics:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get graph statistics',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}

/**
 * MCP (Model Context Protocol) Controller
 * Handles API endpoints for AI agent interactions
 */
export class MCPController {
  /**
   * Handle MCP request
   */
  async handleRequest(req: Request, res: Response): Promise<void> {
    try {
      const mcpRequest = req.body;
      
      // Validate MCP request structure
      if (!mcpRequest.method) {
        res.status(400).json({
          error: {
            code: -32600,
            message: 'Invalid Request',
            data: 'Method is required'
          }
        });
        return;
      }

      // Get or create context from session
      const sessionId = req.headers['x-session-id'] as string;
      let context;
      
      if (sessionId) {
        try {
          const contextResult = await context7MCPService.handleMCPRequest({
            method: 'context/get',
            params: { sessionId }
          });
          context = contextResult.result;
        } catch (error) {
          // Context not found, will create new one if needed
        }
      }

      const response = await context7MCPService.handleMCPRequest(mcpRequest, context);
      
      res.json(response);
    } catch (error) {
      logger.error('Error handling MCP request:', error);
      res.status(500).json({
        error: {
          code: -32603,
          message: 'Internal error',
          data: error instanceof Error ? error.message : 'Unknown error'
        }
      });
    }
  }

  /**
   * Create new MCP context/session
   */
  async createContext(req: Request, res: Response): Promise<void> {
    try {
      const { userId, tools, preferences, metadata } = req.body;

      const response = await context7MCPService.handleMCPRequest({
        method: 'context/create',
        params: {
          userId,
          tools,
          preferences,
          metadata
        }
      });

      res.json({
        success: true,
        data: response.result
      });
    } catch (error) {
      logger.error('Error creating MCP context:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create context',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Perform comprehensive analysis
   */
  async comprehensiveAnalysis(req: Request, res: Response): Promise<void> {
    try {
      const { query, options } = req.body;

      if (!query) {
        res.status(400).json({
          success: false,
          error: 'Query parameter is required'
        });
        return;
      }

      // Get context if session ID provided
      const sessionId = req.headers['x-session-id'] as string;
      let context;
      
      if (sessionId) {
        try {
          const contextResult = await context7MCPService.handleMCPRequest({
            method: 'context/get',
            params: { sessionId }
          });
          context = contextResult.result;
        } catch (error) {
          // Continue without context
        }
      }

      const response = await context7MCPService.handleMCPRequest({
        method: 'analysis/comprehensive',
        params: { query, options }
      }, context);

      res.json({
        success: true,
        data: response.result
      });
    } catch (error) {
      logger.error('Error performing comprehensive analysis:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to perform analysis',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get available tools
   */
  async getTools(req: Request, res: Response): Promise<void> {
    try {
      const response = await context7MCPService.handleMCPRequest({
        method: 'tools/list',
        params: {}
      });

      res.json({
        success: true,
        data: response.result
      });
    } catch (error) {
      logger.error('Error getting tools:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get tools',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get MCP service statistics
   */
  async getStatistics(req: Request, res: Response): Promise<void> {
    try {
      const stats = await context7MCPService.getStatistics();
      
      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      logger.error('Error getting MCP statistics:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get statistics',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}

// Export controller instances
export const knowledgeBaseController = new KnowledgeBaseController();
export const graphKnowledgeController = new GraphKnowledgeController();
export const mcpController = new MCPController();
