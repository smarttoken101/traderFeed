import { GoogleGenerativeAI } from '@google/generative-ai';
import logger from '../utils/logger';
import config from '../config';
import knowledgeBaseService, { KnowledgeQuery } from './knowledge-base.service';
import graphKnowledgeService from './graph-knowledge.service';

export interface MCPRequest {
  method: string;
  params: Record<string, any>;
  id?: string;
}

export interface MCPResponse {
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
  id?: string;
}

export interface AgentContext {
  sessionId: string;
  userId?: string;
  conversation: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
  }>;
  activeTools: string[];
  preferences: Record<string, any>;
  metadata: Record<string, any>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
    }>;
    required: string[];
  };
}

export interface ToolExecutionResult {
  success: boolean;
  data?: any;
  error?: string;
  metadata?: Record<string, any>;
}

/**
 * Context7 MCP (Model Context Protocol) Integration Service
 * Provides advanced AI agent capabilities with context management
 * and tool orchestration for financial analysis
 */
export class Context7MCPService {
  private genAI?: GoogleGenerativeAI;
  private activeContexts = new Map<string, AgentContext>();
  private availableTools: ToolDefinition[] = [];

  constructor() {
    if (config.geminiApiKey) {
      this.genAI = new GoogleGenerativeAI(config.geminiApiKey);
    }
    this.initializeTools();
  }

  /**
   * Initialize available tools for the MCP server
   */
  private initializeTools(): void {
    this.availableTools = [
      {
        name: 'query_knowledge_base',
        description: 'Search and query the financial knowledge base documents',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'The search query for knowledge base'
            },
            market: {
              type: 'string',
              description: 'Filter by market type',
              enum: ['forex', 'crypto', 'futures', 'stocks', 'bonds', 'commodities']
            },
            category: {
              type: 'string', 
              description: 'Filter by document category',
              enum: ['strategy', 'research', 'analysis', 'market-outlook', 'economic-data', 'technical-analysis']
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results to return'
            }
          },
          required: ['query']
        }
      },
      {
        name: 'analyze_market_sentiment',
        description: 'Analyze current market sentiment from recent news articles',
        parameters: {
          type: 'object',
          properties: {
            asset: {
              type: 'string',
              description: 'Specific asset to analyze (e.g., USD, Gold, Bitcoin)'
            },
            timeframe: {
              type: 'string',
              description: 'Time period for analysis',
              enum: ['24h', '7d', '30d']
            },
            market: {
              type: 'string',
              description: 'Market type to focus on',
              enum: ['forex', 'crypto', 'futures', 'stocks', 'commodities']
            }
          },
          required: []
        }
      },
      {
        name: 'get_contextual_insights',
        description: 'Get AI-powered insights using knowledge graph and contextual analysis',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'The question or topic to analyze'
            },
            market: {
              type: 'string',
              description: 'Market context for the analysis',
              enum: ['forex', 'crypto', 'futures', 'stocks', 'commodities']
            }
          },
          required: ['query']
        }
      },
      {
        name: 'analyze_correlations',
        description: 'Analyze correlations between different financial instruments or markets',
        parameters: {
          type: 'object',
          properties: {
            primary_asset: {
              type: 'string',
              description: 'Primary asset to analyze'
            },
            comparison_assets: {
              type: 'array',
              description: 'List of assets to compare with'
            },
            timeframe: {
              type: 'string',
              description: 'Time period for correlation analysis',
              enum: ['24h', '7d', '30d', '90d']
            }
          },
          required: ['primary_asset']
        }
      },
      {
        name: 'generate_trading_report',
        description: 'Generate comprehensive trading analysis report',
        parameters: {
          type: 'object',
          properties: {
            markets: {
              type: 'array',
              description: 'Markets to include in the report'
            },
            focus_areas: {
              type: 'array',
              description: 'Specific areas to focus on (sentiment, technical, fundamental)'
            },
            timeframe: {
              type: 'string',
              description: 'Report timeframe',
              enum: ['daily', 'weekly', 'monthly']
            }
          },
          required: ['markets']
        }
      }
    ];
  }

  /**
   * Handle MCP request
   */
  async handleMCPRequest(request: MCPRequest, context?: AgentContext): Promise<MCPResponse> {
    try {
      logger.info(`Handling MCP request: ${request.method}`, { params: request.params });

      switch (request.method) {
        case 'tools/list':
          return {
            result: {
              tools: this.availableTools
            },
            id: request.id
          };

        case 'tools/call':
          const toolResult = await this.executeTool(
            request.params.name,
            request.params.arguments,
            context
          );
          return {
            result: toolResult,
            id: request.id
          };

        case 'context/create':
          const newContext = await this.createContext(request.params);
          return {
            result: {
              sessionId: newContext.sessionId,
              status: 'created'
            },
            id: request.id
          };

        case 'context/update':
          await this.updateContext(request.params.sessionId, request.params.updates);
          return {
            result: { status: 'updated' },
            id: request.id
          };

        case 'context/get':
          const contextData = this.getContext(request.params.sessionId);
          return {
            result: contextData,
            id: request.id
          };

        case 'analysis/comprehensive':
          const analysis = await this.performComprehensiveAnalysis(
            request.params.query,
            request.params.options,
            context
          );
          return {
            result: analysis,
            id: request.id
          };

        default:
          return {
            error: {
              code: -32601,
              message: 'Method not found',
              data: { method: request.method }
            },
            id: request.id
          };
      }
    } catch (error) {
      logger.error('Error handling MCP request:', error);
      return {
        error: {
          code: -32603,
          message: 'Internal error',
          data: { error: error instanceof Error ? error.message : 'Unknown error' }
        },
        id: request.id
      };
    }
  }

  /**
   * Execute a specific tool
   */
  private async executeTool(
    toolName: string,
    args: Record<string, any>,
    context?: AgentContext
  ): Promise<ToolExecutionResult> {
    try {
      switch (toolName) {
        case 'query_knowledge_base':
          return await this.executeKnowledgeBaseQuery(args);

        case 'analyze_market_sentiment':
          return await this.executeMarketSentimentAnalysis(args);

        case 'get_contextual_insights':
          return await this.executeContextualInsights(args);

        case 'analyze_correlations':
          return await this.executeCorrelationAnalysis(args);

        case 'generate_trading_report':
          return await this.executeTradingReport(args, context);

        default:
          return {
            success: false,
            error: `Unknown tool: ${toolName}`
          };
      }
    } catch (error) {
      logger.error(`Error executing tool ${toolName}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Execute knowledge base query tool
   */
  private async executeKnowledgeBaseQuery(args: Record<string, any>): Promise<ToolExecutionResult> {
    try {
      const query: KnowledgeQuery = {
        query: args.query,
        market: args.market,
        category: args.category,
        limit: args.limit || 10
      };

      const result = await knowledgeBaseService.queryKnowledgeBase(query);
      
      return {
        success: true,
        data: {
          documents: result.documents.map(doc => ({
            title: doc.title,
            summary: doc.summary,
            category: doc.category,
            markets: doc.markets,
            tags: doc.tags
          })),
          summary: result.summary,
          relatedConcepts: result.relatedConcepts,
          confidence: result.confidence
        }
      };
    } catch (error) {
      return {
        success: false,
        error: `Knowledge base query failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Execute market sentiment analysis tool
   */
  private async executeMarketSentimentAnalysis(args: Record<string, any>): Promise<ToolExecutionResult> {
    try {
      // This would integrate with the existing sentiment service
      // For now, return mock data
      const mockSentiment = {
        asset: args.asset || 'Overall Market',
        timeframe: args.timeframe || '24h',
        sentimentScore: 0.15,
        sentimentLabel: 'slightly_positive',
        confidence: 0.78,
        breakdown: {
          positive: 45,
          neutral: 35,
          negative: 20
        },
        keyFactors: [
          'Federal Reserve policy expectations',
          'Economic data releases',
          'Geopolitical developments'
        ],
        articleCount: 156,
        lastUpdated: new Date().toISOString()
      };

      return {
        success: true,
        data: mockSentiment
      };
    } catch (error) {
      return {
        success: false,
        error: `Sentiment analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Execute contextual insights tool
   */
  private async executeContextualInsights(args: Record<string, any>): Promise<ToolExecutionResult> {
    try {
      const insights = await graphKnowledgeService.getContextualInsights(
        args.query,
        args.market
      );

      return {
        success: true,
        data: insights
      };
    } catch (error) {
      return {
        success: false,
        error: `Contextual insights failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Execute correlation analysis tool
   */
  private async executeCorrelationAnalysis(args: Record<string, any>): Promise<ToolExecutionResult> {
    try {
      // Mock correlation analysis - in production, this would use real data
      const mockCorrelations = {
        primaryAsset: args.primary_asset,
        timeframe: args.timeframe || '30d',
        correlations: [
          {
            asset: 'EUR/USD',
            correlation: 0.65,
            significance: 'high',
            trend: 'increasing'
          },
          {
            asset: 'Gold',
            correlation: -0.42,
            significance: 'moderate',
            trend: 'stable'
          }
        ],
        summary: `${args.primary_asset} shows strong positive correlation with risk-on assets and negative correlation with safe havens`,
        implications: [
          'Consider portfolio diversification effects',
          'Monitor for correlation breakdown signals',
          'Risk management implications for multi-asset strategies'
        ]
      };

      return {
        success: true,
        data: mockCorrelations
      };
    } catch (error) {
      return {
        success: false,
        error: `Correlation analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Execute trading report generation tool
   */
  private async executeTradingReport(
    args: Record<string, any>,
    context?: AgentContext
  ): Promise<ToolExecutionResult> {
    try {
      if (!this.genAI) {
        return {
          success: false,
          error: 'AI model not available for report generation'
        };
      }

      const model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

      // Gather data for report
      const kbQuery: KnowledgeQuery = {
        query: `${args.markets?.join(' ')} market analysis ${args.timeframe || 'daily'}`,
        limit: 15
      };

      const kbResults = await knowledgeBaseService.queryKnowledgeBase(kbQuery);
      
      const prompt = `
        Generate a comprehensive trading report for the following markets: ${args.markets?.join(', ')}
        
        Focus areas: ${args.focus_areas?.join(', ') || 'sentiment, technical, fundamental'}
        Timeframe: ${args.timeframe || 'daily'}
        
        Available research and analysis:
        ${kbResults.documents.slice(0, 5).map(doc => `${doc.title}: ${doc.summary}`).join('\n\n')}
        
        Structure the report with:
        1. Executive Summary
        2. Market Overview
        3. Key Developments
        4. Technical Analysis
        5. Risk Factors
        6. Trading Recommendations
        7. Outlook
        
        Make it actionable for traders and risk managers.
      `;

      const result = await model.generateContent(prompt);
      const reportContent = result.response.text();

      const report = {
        title: `${args.timeframe || 'Daily'} Trading Report - ${new Date().toLocaleDateString()}`,
        markets: args.markets || [],
        focusAreas: args.focus_areas || [],
        content: reportContent,
        sources: kbResults.documents.map(doc => doc.title),
        generatedAt: new Date().toISOString(),
        confidence: kbResults.confidence,
        metadata: {
          documentCount: kbResults.documents.length,
          userId: context?.userId,
          sessionId: context?.sessionId
        }
      };

      return {
        success: true,
        data: report
      };
    } catch (error) {
      return {
        success: false,
        error: `Report generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Create new agent context
   */
  private async createContext(params: Record<string, any>): Promise<AgentContext> {
    const sessionId = `ctx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const context: AgentContext = {
      sessionId,
      userId: params.userId,
      conversation: [],
      activeTools: params.tools || [],
      preferences: params.preferences || {},
      metadata: {
        createdAt: new Date(),
        ...params.metadata
      }
    };

    this.activeContexts.set(sessionId, context);
    
    // Clean up old contexts (simple LRU)
    if (this.activeContexts.size > 100) {
      const oldestKey = this.activeContexts.keys().next().value;
      if (oldestKey) {
        this.activeContexts.delete(oldestKey);
      }
    }

    return context;
  }

  /**
   * Update existing context
   */
  private async updateContext(sessionId: string, updates: Record<string, any>): Promise<void> {
    const context = this.activeContexts.get(sessionId);
    if (!context) {
      throw new Error(`Context not found: ${sessionId}`);
    }

    if (updates.conversation) {
      context.conversation.push(...updates.conversation);
    }

    if (updates.preferences) {
      context.preferences = { ...context.preferences, ...updates.preferences };
    }

    if (updates.metadata) {
      context.metadata = { ...context.metadata, ...updates.metadata };
    }

    if (updates.activeTools) {
      context.activeTools = updates.activeTools;
    }

    this.activeContexts.set(sessionId, context);
  }

  /**
   * Get context data
   */
  private getContext(sessionId: string): AgentContext | null {
    return this.activeContexts.get(sessionId) || null;
  }

  /**
   * Perform comprehensive analysis using multiple tools
   */
  private async performComprehensiveAnalysis(
    query: string,
    options: Record<string, any> = {},
    context?: AgentContext
  ): Promise<any> {
    try {
      const results: Record<string, any> = {};

      // 1. Query knowledge base
      if (options.includeKnowledgeBase !== false) {
        const kbResult = await this.executeKnowledgeBaseQuery({
          query,
          market: options.market,
          limit: 10
        });
        results.knowledgeBase = kbResult.data;
      }

      // 2. Get contextual insights
      if (options.includeInsights !== false) {
        const insightsResult = await this.executeContextualInsights({
          query,
          market: options.market
        });
        results.insights = insightsResult.data;
      }

      // 3. Analyze sentiment if relevant
      if (options.includeSentiment !== false) {
        const sentimentResult = await this.executeMarketSentimentAnalysis({
          asset: options.asset,
          market: options.market,
          timeframe: options.timeframe || '24h'
        });
        results.sentiment = sentimentResult.data;
      }

      // 4. Generate AI summary
      if (this.genAI && options.generateSummary !== false) {
        const model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
        
        const prompt = `
          Provide a comprehensive analysis summary for: "${query}"
          
          Knowledge Base Results: ${JSON.stringify(results.knowledgeBase?.summary || 'No data')}
          Contextual Insights: ${JSON.stringify(results.insights?.marketImpact || 'No data')}
          Market Sentiment: ${JSON.stringify(results.sentiment?.sentimentLabel || 'No data')}
          
          Create a cohesive analysis that synthesizes all available information.
          Focus on actionable insights for traders and investors.
        `;

        const summaryResult = await model.generateContent(prompt);
        results.aiSummary = summaryResult.response.text();
      }

      return {
        query,
        timestamp: new Date().toISOString(),
        results,
        confidence: this.calculateOverallConfidence(results),
        recommendations: await this.generateRecommendations(query, results),
        metadata: {
          sessionId: context?.sessionId,
          toolsUsed: Object.keys(results),
          processingTime: Date.now()
        }
      };
    } catch (error) {
      logger.error('Error in comprehensive analysis:', error);
      throw error;
    }
  }

  /**
   * Calculate overall confidence score
   */
  private calculateOverallConfidence(results: Record<string, any>): number {
    const confidenceScores: number[] = [];
    
    if (results.knowledgeBase?.confidence) {
      confidenceScores.push(results.knowledgeBase.confidence);
    }
    
    if (results.insights?.confidence) {
      confidenceScores.push(results.insights.confidence);
    }
    
    if (results.sentiment?.confidence) {
      confidenceScores.push(results.sentiment.confidence);
    }

    return confidenceScores.length > 0 
      ? confidenceScores.reduce((sum, score) => sum + score, 0) / confidenceScores.length
      : 0.5;
  }

  /**
   * Generate recommendations based on analysis
   */
  private async generateRecommendations(
    query: string,
    results: Record<string, any>
  ): Promise<string[]> {
    try {
      if (!this.genAI) {
        return ['Advanced analysis requires AI model configuration'];
      }

      const model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
      
      const prompt = `
        Based on this comprehensive analysis of "${query}":
        
        Results: ${JSON.stringify(results, null, 2)}
        
        Generate 3-5 specific, actionable recommendations for traders/investors.
        Format as a JSON array of strings.
        
        Focus on:
        - Risk management
        - Market positioning
        - Timing considerations
        - Monitoring points
      `;

      const result = await model.generateContent(prompt);
      const responseText = result.response.text();
      
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      
      return ['Review analysis results and consider market conditions'];
    } catch (error) {
      logger.error('Error generating recommendations:', error);
      return ['Error generating recommendations - review analysis manually'];
    }
  }

  /**
   * Get service statistics
   */
  async getStatistics(): Promise<{
    activeContexts: number;
    totalToolCalls: number;
    popularTools: Record<string, number>;
    averageResponseTime: number;
  }> {
    return {
      activeContexts: this.activeContexts.size,
      totalToolCalls: 0, // Would track this in production
      popularTools: {
        'query_knowledge_base': 45,
        'analyze_market_sentiment': 32,
        'get_contextual_insights': 28,
        'generate_trading_report': 15,
        'analyze_correlations': 12
      },
      averageResponseTime: 1250 // milliseconds
    };
  }
}

export default new Context7MCPService();
