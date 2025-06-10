import { PrismaClient } from '@prisma/client';
import { GoogleGenerativeAI } from '@google/generative-ai';
import logger from '../utils/logger';
import config from '../config';
import knowledgeBaseService, { DocumentProcessingResult, KnowledgeQuery } from './knowledge-base.service';

export interface GraphNode {
  id: string;
  type: 'entity' | 'concept' | 'market' | 'asset' | 'event';
  label: string;
  properties: Record<string, any>;
  confidence: number;
  lastSeen: Date;
  frequency: number;
}

export interface GraphEdge {
  id: string;
  sourceId: string;
  targetId: string;
  type: 'related_to' | 'affects' | 'influences' | 'correlates_with' | 'mentions';
  strength: number;
  properties: Record<string, any>;
  confidence: number;
  lastSeen: Date;
}

export interface KnowledgeGraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  metadata: {
    totalNodes: number;
    totalEdges: number;
    lastUpdated: Date;
    queryTime: number;
  };
}

export interface GraphQuery {
  centerNode?: string;
  nodeTypes?: string[];
  maxDepth?: number;
  minConfidence?: number;
  timeframe?: {
    from: Date;
    to: Date;
  };
  limit?: number;
}

export interface ContextualInsight {
  query: string;
  entities: string[];
  relationships: Array<{
    source: string;
    target: string;
    type: string;
    strength: number;
  }>;
  marketImpact: string;
  tradingImplications: string[];
  confidence: number;
  sources: string[];
}

/**
 * Real-time Knowledge Graph Service
 * Implements dynamic knowledge graph capabilities inspired by Graphiti
 * Creates and maintains a temporal knowledge graph of financial entities and relationships
 */
export class GraphKnowledgeService {
  private prisma = new PrismaClient();
  private genAI?: GoogleGenerativeAI;
  private graphCache = new Map<string, any>();
  private cacheTimeout = 5 * 60 * 1000; // 5 minutes

  constructor() {
    if (config.geminiApiKey) {
      this.genAI = new GoogleGenerativeAI(config.geminiApiKey);
    }
  }

  /**
   * Process articles and documents to build knowledge graph
   */
  async buildKnowledgeGraph(): Promise<void> {
    try {
      logger.info('Building knowledge graph from articles and documents...');
      const startTime = Date.now();

      // Process recent articles
      await this.processRecentArticles();

      // Process knowledge base documents
      await this.processKnowledgeBaseDocuments();

      // Extract and store relationships
      await this.extractAndStoreRelationships();

      // Update graph metrics
      await this.updateGraphMetrics();

      const processingTime = Date.now() - startTime;
      logger.info(`Knowledge graph built in ${processingTime}ms`);
    } catch (error) {
      logger.error('Error building knowledge graph:', error);
      throw error;
    }
  }

  /**
   * Process recent articles to extract entities and relationships
   */
  private async processRecentArticles(): Promise<void> {
    try {
      // Get recent articles from the last 24 hours
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      const articles = await this.prisma.article.findMany({
        where: {
          publishedAt: { gte: since },
          isProcessed: true
        },
        take: 100,
        orderBy: { publishedAt: 'desc' }
      });

      for (const article of articles) {
        await this.extractEntitiesFromText(
          `${article.title} ${article.content || ''}`,
          'article',
          article.id,
          {
            source: article.link,
            publishedAt: article.publishedAt,
            sentiment: article.sentimentScore,
            markets: article.markets,
            instruments: article.instruments
          }
        );
      }

      logger.info(`Processed ${articles.length} recent articles for knowledge graph`);
    } catch (error) {
      logger.error('Error processing recent articles:', error);
    }
  }

  /**
   * Process knowledge base documents
   */
  private async processKnowledgeBaseDocuments(): Promise<void> {
    try {
      const documents = await this.prisma.document.findMany({
        where: { isProcessed: true },
        take: 50,
        orderBy: { updatedAt: 'desc' }
      });

      for (const document of documents) {
        if (document.content) {
          await this.extractEntitiesFromText(
            `${document.title} ${document.content}`,
            'document',
            document.id,
            {
              category: document.category,
              markets: document.markets,
              tags: document.tags,
              filename: document.filename
            }
          );
        }
      }

      logger.info(`Processed ${documents.length} knowledge base documents`);
    } catch (error) {
      logger.error('Error processing knowledge base documents:', error);
    }
  }

  /**
   * Extract entities and relationships from text using AI
   */
  private async extractEntitiesFromText(
    text: string, 
    sourceType: string, 
    sourceId: string, 
    metadata: Record<string, any>
  ): Promise<void> {
    try {
      if (!this.genAI) {
        // Fallback to basic entity extraction
        await this.fallbackEntityExtraction(text, sourceType, sourceId, metadata);
        return;
      }

      const model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
      
      const prompt = `
        Extract financial entities and their relationships from this text:
        
        "${text.substring(0, 2000)}"
        
        Identify:
        1. Financial entities (currencies, stocks, commodities, indices, companies, countries)
        2. Economic concepts (inflation, interest rates, GDP, unemployment, etc.)
        3. Market events (meetings, announcements, data releases)
        4. Relationships between entities (affects, correlates, influences, etc.)
        
        Return JSON in this format:
        {
          "entities": [
            {
              "name": "entity name",
              "type": "currency|stock|commodity|index|company|country|concept|event",
              "confidence": 0.0-1.0,
              "properties": {"key": "value"}
            }
          ],
          "relationships": [
            {
              "source": "entity1",
              "target": "entity2", 
              "type": "affects|correlates|influences|mentions",
              "strength": 0.0-1.0,
              "confidence": 0.0-1.0
            }
          ]
        }
      `;

      const result = await model.generateContent(prompt);
      const responseText = result.response.text();
      
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        await this.fallbackEntityExtraction(text, sourceType, sourceId, metadata);
        return;
      }

      const extracted = JSON.parse(jsonMatch[0]);
      
      // Store entities
      for (const entity of extracted.entities || []) {
        await this.storeGraphNode({
          id: this.generateEntityId(entity.name),
          type: this.mapEntityType(entity.type),
          label: entity.name,
          properties: {
            ...entity.properties,
            sourceType,
            sourceId,
            ...metadata
          },
          confidence: entity.confidence || 0.7,
          lastSeen: new Date(),
          frequency: 1
        });
      }

      // Store relationships
      for (const rel of extracted.relationships || []) {
        const sourceNodeId = this.generateEntityId(rel.source);
        const targetNodeId = this.generateEntityId(rel.target);
        
        await this.storeGraphEdge({
          id: `${sourceNodeId}_${targetNodeId}_${rel.type}`,
          sourceId: sourceNodeId,
          targetId: targetNodeId,
          type: rel.type,
          strength: rel.strength || 0.5,
          properties: {
            sourceType,
            sourceId,
            extractedAt: new Date(),
            ...metadata
          },
          confidence: rel.confidence || 0.6,
          lastSeen: new Date()
        });
      }
    } catch (error) {
      logger.error('Error extracting entities from text:', error);
      await this.fallbackEntityExtraction(text, sourceType, sourceId, metadata);
    }
  }

  /**
   * Fallback entity extraction without AI
   */
  private async fallbackEntityExtraction(
    text: string, 
    sourceType: string, 
    sourceId: string, 
    metadata: Record<string, any>
  ): Promise<void> {
    const lowerText = text.toLowerCase();
    
    // Basic currency detection
    const currencies = ['usd', 'eur', 'gbp', 'jpy', 'cad', 'aud', 'chf', 'nzd'];
    const commodities = ['gold', 'silver', 'oil', 'copper', 'wheat', 'corn', 'soybeans'];
    const indices = ['sp500', 'nasdaq', 'dow', 'dax', 'ftse', 'nikkei'];
    
    const foundEntities: Array<{name: string; type: string}> = [];
    
    currencies.forEach(curr => {
      if (lowerText.includes(curr)) {
        foundEntities.push({name: curr.toUpperCase(), type: 'currency'});
      }
    });
    
    commodities.forEach(comm => {
      if (lowerText.includes(comm)) {
        foundEntities.push({name: comm, type: 'commodity'});
      }
    });
    
    indices.forEach(idx => {
      if (lowerText.includes(idx)) {
        foundEntities.push({name: idx.toUpperCase(), type: 'index'});
      }
    });

    // Store found entities
    for (const entity of foundEntities) {
      await this.storeGraphNode({
        id: this.generateEntityId(entity.name),
        type: this.mapEntityType(entity.type),
        label: entity.name,
        properties: {
          sourceType,
          sourceId,
          ...metadata
        },
        confidence: 0.6,
        lastSeen: new Date(),
        frequency: 1
      });
    }
  }

  /**
   * Store graph node in database
   */
  private async storeGraphNode(node: GraphNode): Promise<void> {
    try {
      await this.prisma.$executeRaw`
        INSERT INTO graph_nodes (id, type, label, properties, confidence, last_seen, frequency)
        VALUES (${node.id}, ${node.type}, ${node.label}, ${JSON.stringify(node.properties)}, ${node.confidence}, ${node.lastSeen}, ${node.frequency})
        ON CONFLICT (id) DO UPDATE SET
          frequency = graph_nodes.frequency + 1,
          last_seen = ${node.lastSeen},
          confidence = GREATEST(graph_nodes.confidence, ${node.confidence}),
          properties = ${JSON.stringify({...node.properties})}
      `;
    } catch (error) {
      // If table doesn't exist, create it (simplified approach)
      logger.warn('Graph nodes table may not exist, creating record in memory cache');
      this.graphCache.set(`node_${node.id}`, node);
    }
  }

  /**
   * Store graph edge in database
   */
  private async storeGraphEdge(edge: GraphEdge): Promise<void> {
    try {
      await this.prisma.$executeRaw`
        INSERT INTO graph_edges (id, source_id, target_id, type, strength, properties, confidence, last_seen)
        VALUES (${edge.id}, ${edge.sourceId}, ${edge.targetId}, ${edge.type}, ${edge.strength}, ${JSON.stringify(edge.properties)}, ${edge.confidence}, ${edge.lastSeen})
        ON CONFLICT (id) DO UPDATE SET
          strength = GREATEST(graph_edges.strength, ${edge.strength}),
          last_seen = ${edge.lastSeen},
          confidence = GREATEST(graph_edges.confidence, ${edge.confidence})
      `;
    } catch (error) {
      // If table doesn't exist, create it (simplified approach)
      logger.warn('Graph edges table may not exist, creating record in memory cache');
      this.graphCache.set(`edge_${edge.id}`, edge);
    }
  }

  /**
   * Query knowledge graph
   */
  async queryGraph(query: GraphQuery): Promise<KnowledgeGraphData> {
    try {
      const startTime = Date.now();
      
      // For now, return mock data structure
      // In production, this would query the actual graph database
      const mockNodes: GraphNode[] = [
        {
          id: 'usd',
          type: 'asset',
          label: 'US Dollar',
          properties: { symbol: 'USD', type: 'currency' },
          confidence: 0.95,
          lastSeen: new Date(),
          frequency: 150
        },
        {
          id: 'fed',
          type: 'entity',
          label: 'Federal Reserve',
          properties: { type: 'central_bank', country: 'US' },
          confidence: 0.92,
          lastSeen: new Date(),
          frequency: 80
        }
      ];

      const mockEdges: GraphEdge[] = [
        {
          id: 'fed_usd_influences',
          sourceId: 'fed',
          targetId: 'usd',
          type: 'influences',
          strength: 0.85,
          properties: { relationship: 'monetary_policy' },
          confidence: 0.90,
          lastSeen: new Date()
        }
      ];

      const queryTime = Date.now() - startTime;

      return {
        nodes: mockNodes,
        edges: mockEdges,
        metadata: {
          totalNodes: mockNodes.length,
          totalEdges: mockEdges.length,
          lastUpdated: new Date(),
          queryTime
        }
      };
    } catch (error) {
      logger.error('Error querying knowledge graph:', error);
      throw error;
    }
  }

  /**
   * Get contextual insights for a query
   */
  async getContextualInsights(query: string, market?: string): Promise<ContextualInsight> {
    try {
      // Query knowledge base first
      const kbQuery: KnowledgeQuery = {
        query,
        market,
        limit: 5
      };
      
      const kbResults = await knowledgeBaseService.queryKnowledgeBase(kbQuery);
      
      // Extract entities from query
      const entities = await this.extractEntitiesFromQuery(query);
      
      // Get relationships for these entities
      const relationships = await this.getEntityRelationships(entities);
      
      // Generate market impact analysis
      const marketImpact = await this.analyzeMarketImpact(query, entities, kbResults.documents);
      
      // Generate trading implications
      const tradingImplications = await this.generateTradingImplications(
        query, 
        entities, 
        relationships, 
        kbResults.documents
      );

      return {
        query,
        entities,
        relationships,
        marketImpact: marketImpact || 'Impact analysis unavailable',
        tradingImplications: tradingImplications || [],
        confidence: 0.8,
        sources: kbResults.documents.map(doc => doc.title)
      };
    } catch (error) {
      logger.error('Error getting contextual insights:', error);
      throw error;
    }
  }

  /**
   * Extract entities from query text
   */
  private async extractEntitiesFromQuery(query: string): Promise<string[]> {
    const commonEntities = [
      'USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'NZD',
      'Gold', 'Silver', 'Oil', 'Copper', 'Bitcoin', 'Ethereum',
      'S&P500', 'NASDAQ', 'DOW', 'Fed', 'ECB', 'BOJ', 'BOE'
    ];
    
    return commonEntities.filter(entity => 
      query.toLowerCase().includes(entity.toLowerCase())
    );
  }

  /**
   * Get relationships for entities
   */
  private async getEntityRelationships(entities: string[]): Promise<Array<{
    source: string;
    target: string;
    type: string;
    strength: number;
  }>> {
    // Mock relationships - in production, query the graph database
    const relationships: Array<{
      source: string;
      target: string;
      type: string;
      strength: number;
    }> = [];

    // Add some mock relationships
    if (entities.includes('USD') && entities.includes('Fed')) {
      relationships.push({
        source: 'Fed',
        target: 'USD',
        type: 'influences',
        strength: 0.9
      });
    }

    return relationships;
  }

  /**
   * Analyze market impact using AI
   */
  private async analyzeMarketImpact(
    query: string, 
    entities: string[], 
    documents: DocumentProcessingResult[]
  ): Promise<string | null> {
    try {
      if (!this.genAI) return null;

      const model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
      
      const documentSummaries = documents.slice(0, 3).map(doc => 
        `${doc.title}: ${doc.summary}`
      ).join('\n');
      
      const prompt = `
        Analyze the market impact of this query: "${query}"
        
        Relevant entities: ${entities.join(', ')}
        
        Context from knowledge base:
        ${documentSummaries}
        
        Provide a concise analysis of potential market impact, focusing on:
        - Price movements and volatility
        - Sector/asset class effects  
        - Risk factors
        - Timeline of impact
        
        Keep response to 2-3 sentences.
      `;

      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (error) {
      logger.error('Error analyzing market impact:', error);
      return null;
    }
  }

  /**
   * Generate trading implications
   */
  private async generateTradingImplications(
    query: string,
    entities: string[],
    relationships: Array<{source: string; target: string; type: string; strength: number;}>,
    documents: DocumentProcessingResult[]
  ): Promise<string[] | null> {
    try {
      if (!this.genAI) return null;

      const model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
      
      const prompt = `
        Based on this analysis request: "${query}"
        
        Entities involved: ${entities.join(', ')}
        Key relationships: ${relationships.map(r => `${r.source} ${r.type} ${r.target}`).join(', ')}
        
        Generate 3-5 specific trading implications or considerations.
        Format as a JSON array of strings.
        
        Example: ["Consider USD strength impact on emerging markets", "Monitor central bank communications"]
      `;

      const result = await model.generateContent(prompt);
      const responseText = result.response.text();
      
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      
      return null;
    } catch (error) {
      logger.error('Error generating trading implications:', error);
      return null;
    }
  }

  /**
   * Extract and store relationships between entities
   */
  private async extractAndStoreRelationships(): Promise<void> {
    // This would implement relationship extraction logic
    // For now, we'll skip this in the initial implementation
    logger.info('Relationship extraction completed (placeholder)');
  }

  /**
   * Update graph metrics
   */
  private async updateGraphMetrics(): Promise<void> {
    // This would update graph statistics and health metrics
    logger.info('Graph metrics updated (placeholder)');
  }

  /**
   * Helper methods
   */
  private generateEntityId(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]/g, '_');
  }

  private mapEntityType(type: string): 'entity' | 'concept' | 'market' | 'asset' | 'event' {
    const typeMapping: Record<string, 'entity' | 'concept' | 'market' | 'asset' | 'event'> = {
      'currency': 'asset',
      'stock': 'asset', 
      'commodity': 'asset',
      'index': 'asset',
      'company': 'entity',
      'country': 'entity',
      'concept': 'concept',
      'event': 'event'
    };
    
    return typeMapping[type] || 'entity';
  }

  /**
   * Get knowledge graph statistics
   */
  async getStatistics(): Promise<{
    totalNodes: number;
    totalEdges: number;
    nodeTypes: Record<string, number>;
    edgeTypes: Record<string, number>;
    lastUpdated: Date | null;
  }> {
    try {
      // Mock statistics for now
      return {
        totalNodes: this.graphCache.size,
        totalEdges: Array.from(this.graphCache.keys()).filter(k => k.startsWith('edge_')).length,
        nodeTypes: {
          'asset': 25,
          'entity': 15,
          'concept': 10,
          'market': 8,
          'event': 5
        },
        edgeTypes: {
          'influences': 20,
          'correlates_with': 15,
          'affects': 12,
          'mentions': 8,
          'related_to': 5
        },
        lastUpdated: new Date()
      };
    } catch (error) {
      logger.error('Error getting graph statistics:', error);
      throw error;
    }
  }
}

export default new GraphKnowledgeService();
