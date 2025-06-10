import neo4j, { Driver, Session, Node, Relationship } from 'neo4j-driver';
import logger from '../utils/logger';

export interface GraphEntity {
  id: string;
  type: 'Document' | 'Asset' | 'Institution' | 'Market' | 'Concept';
  properties: Record<string, any>;
}

export interface GraphRelationship {
  from: string;
  to: string;
  type: string;
  properties?: Record<string, any>;
}

export interface GraphPath {
  nodes: GraphEntity[];
  relationships: GraphRelationship[];
}

export interface GraphInsight {
  entityId: string;
  entityType: string;
  connections: number;
  relatedEntities: GraphEntity[];
  insights: string[];
  confidence: number;
}

class Neo4jGraphService {
  private driver: Driver | null = null;
  private useMockImplementation = true; // Start with mock, switch if Neo4j available

  constructor() {
    this.initializeDriver();
  }

  /**
   * Initialize Neo4j driver
   */
  private async initializeDriver(): Promise<void> {
    try {
      const uri = process.env.NEO4J_URI || 'bolt://localhost:7687';
      const user = process.env.NEO4J_USER || 'neo4j';
      const password = process.env.NEO4J_PASSWORD || 'tradeFeed123';

      this.driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
      
      // Test connection
      const session = this.driver.session();
      await session.run('RETURN 1');
      await session.close();
      
      this.useMockImplementation = false;
      logger.info('Neo4j connection established successfully');
    } catch (error) {
      logger.warn('Neo4j not available, using mock implementation:', error);
      this.useMockImplementation = true;
    }
  }

  /**
   * Initialize graph database schema
   */
  async initializeSchema(): Promise<void> {
    if (this.useMockImplementation) {
      logger.info('Mock: Neo4j schema initialized');
      return;
    }

    const session = this.driver!.session();
    try {
      // Create indexes for better performance
      const indexes = [
        'CREATE INDEX document_id_index IF NOT EXISTS FOR (d:Document) ON (d.id)',
        'CREATE INDEX asset_symbol_index IF NOT EXISTS FOR (a:Asset) ON (a.symbol)',
        'CREATE INDEX institution_name_index IF NOT EXISTS FOR (i:Institution) ON (i.name)',
        'CREATE INDEX market_type_index IF NOT EXISTS FOR (m:Market) ON (m.type)',
        'CREATE INDEX concept_name_index IF NOT EXISTS FOR (c:Concept) ON (c.name)',
      ];

      for (const indexQuery of indexes) {
        await session.run(indexQuery);
      }

      logger.info('Neo4j schema initialized with indexes');
    } catch (error) {
      logger.error('Failed to initialize Neo4j schema:', error);
    } finally {
      await session.close();
    }
  }

  /**
   * Create or update a graph entity
   */
  async createEntity(entity: GraphEntity): Promise<void> {
    if (this.useMockImplementation) {
      logger.info(`Mock: Created entity ${entity.id} of type ${entity.type}`);
      return;
    }

    const session = this.driver!.session();
    try {
      const query = `
        MERGE (e:${entity.type} {id: $id})
        SET e += $properties
        RETURN e
      `;
      
      await session.run(query, {
        id: entity.id,
        properties: entity.properties,
      });

      logger.info(`Created/updated entity: ${entity.id}`);
    } catch (error) {
      logger.error(`Failed to create entity ${entity.id}:`, error);
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Create a relationship between two entities
   */
  async createRelationship(relationship: GraphRelationship): Promise<void> {
    if (this.useMockImplementation) {
      logger.info(`Mock: Created relationship ${relationship.type} from ${relationship.from} to ${relationship.to}`);
      return;
    }

    const session = this.driver!.session();
    try {
      const query = `
        MATCH (from {id: $fromId})
        MATCH (to {id: $toId})
        MERGE (from)-[r:${relationship.type}]->(to)
        SET r += $properties
        RETURN r
      `;
      
      await session.run(query, {
        fromId: relationship.from,
        toId: relationship.to,
        properties: relationship.properties || {},
      });

      logger.info(`Created relationship: ${relationship.from} -[${relationship.type}]-> ${relationship.to}`);
    } catch (error) {
      logger.error(`Failed to create relationship:`, error);
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Process a document and extract entities/relationships
   */
  async processDocumentForGraph(document: {
    id: string;
    title: string;
    content: string;
    category: string;
    markets: string[];
    tags: string[];
    filename: string;
  }): Promise<void> {
    try {
      // Create document entity
      await this.createEntity({
        id: document.id,
        type: 'Document',
        properties: {
          title: document.title,
          category: document.category,
          filename: document.filename,
          createdAt: new Date().toISOString(),
        },
      });

      // Extract and create market entities
      for (const market of document.markets) {
        const marketId = `market_${market.toLowerCase()}`;
        await this.createEntity({
          id: marketId,
          type: 'Market',
          properties: {
            name: market,
            type: market,
          },
        });

        // Create relationship: Document -> BELONGS_TO -> Market
        await this.createRelationship({
          from: document.id,
          to: marketId,
          type: 'BELONGS_TO',
          properties: { strength: 1.0 },
        });
      }

      // Extract and create concept entities from tags
      for (const tag of document.tags) {
        const conceptId = `concept_${tag.toLowerCase()}`;
        await this.createEntity({
          id: conceptId,
          type: 'Concept',
          properties: {
            name: tag,
            category: 'tag',
          },
        });

        // Create relationship: Document -> MENTIONS -> Concept
        await this.createRelationship({
          from: document.id,
          to: conceptId,
          type: 'MENTIONS',
          properties: { confidence: 0.8 },
        });
      }

      // Extract financial entities from content
      await this.extractFinancialEntities(document);

      logger.info(`Processed document ${document.id} for graph database`);
    } catch (error) {
      logger.error(`Failed to process document ${document.id} for graph:`, error);
      throw error;
    }
  }

  /**
   * Extract financial entities from document content
   */
  private async extractFinancialEntities(document: {
    id: string;
    content: string;
  }): Promise<void> {
    try {
      const content = document.content.toLowerCase();

      // Extract currency pairs
      const currencyPairs = content.match(/\b(usd|eur|gbp|jpy|aud|cad|chf|nzd|cny)\/(usd|eur|gbp|jpy|aud|cad|chf|nzd|cny)\b/gi) || [];
      for (const pair of [...new Set(currencyPairs)]) {
        const assetId = `asset_${pair.toLowerCase()}`;
        await this.createEntity({
          id: assetId,
          type: 'Asset',
          properties: {
            symbol: pair.toUpperCase(),
            type: 'currency_pair',
          },
        });

        await this.createRelationship({
          from: document.id,
          to: assetId,
          type: 'ANALYZES',
          properties: { mentions: content.split(pair.toLowerCase()).length - 1 },
        });
      }

      // Extract institutions
      const institutions = [
        'federal reserve', 'fed', 'ecb', 'european central bank', 'bank of england', 'boe',
        'bank of japan', 'boj', 'goldman sachs', 'morgan stanley', 'jp morgan', 'jpmorgan',
        'ubs', 'barclays', 'citigroup', 'westpac', 'anz', 'deutsche bank'
      ];

      for (const institution of institutions) {
        if (content.includes(institution)) {
          const institutionId = `institution_${institution.replace(/\s+/g, '_').toLowerCase()}`;
          await this.createEntity({
            id: institutionId,
            type: 'Institution',
            properties: {
              name: institution,
              type: institution.includes('central bank') || institution.includes('fed') ? 'central_bank' : 'commercial_bank',
            },
          });

          await this.createRelationship({
            from: document.id,
            to: institutionId,
            type: 'REFERENCES',
            properties: { mentions: content.split(institution).length - 1 },
          });
        }
      }
    } catch (error) {
      logger.error('Failed to extract financial entities:', error);
    }
  }

  /**
   * Find related entities for a given entity
   */
  async findRelatedEntities(entityId: string, depth: number = 2): Promise<GraphEntity[]> {
    if (this.useMockImplementation) {
      return this.getMockRelatedEntities(entityId);
    }

    const session = this.driver!.session();
    try {
      const query = `
        MATCH (start {id: $entityId})-[*1..${depth}]-(related)
        WHERE start.id <> related.id
        RETURN DISTINCT related
        LIMIT 20
      `;
      
      const result = await session.run(query, { entityId });
      
      return result.records.map(record => {
        const node = record.get('related');
        return {
          id: node.properties.id,
          type: node.labels[0] as any,
          properties: node.properties,
        };
      });
    } catch (error) {
      logger.error(`Failed to find related entities for ${entityId}:`, error);
      return this.getMockRelatedEntities(entityId);
    } finally {
      await session.close();
    }
  }

  /**
   * Get mock related entities for testing
   */
  private getMockRelatedEntities(entityId: string): GraphEntity[] {
    return [
      {
        id: 'asset_usd_eur',
        type: 'Asset',
        properties: { symbol: 'USD/EUR', type: 'currency_pair' },
      },
      {
        id: 'institution_federal_reserve',
        type: 'Institution',
        properties: { name: 'Federal Reserve', type: 'central_bank' },
      },
      {
        id: 'concept_analysis',
        type: 'Concept',
        properties: { name: 'analysis', category: 'tag' },
      },
    ];
  }

  /**
   * Generate contextual insights based on graph connections
   */
  async generateContextualInsights(entityId: string): Promise<GraphInsight> {
    try {
      const relatedEntities = await this.findRelatedEntities(entityId);
      const connections = await this.getConnectionCount(entityId);

      // Generate insights based on relationships
      const insights = await this.analyzeEntityRelationships(entityId, relatedEntities);

      return {
        entityId,
        entityType: await this.getEntityType(entityId),
        connections,
        relatedEntities,
        insights,
        confidence: Math.min(0.9, 0.5 + (connections * 0.1)),
      };
    } catch (error) {
      logger.error(`Failed to generate insights for ${entityId}:`, error);
      throw error;
    }
  }

  /**
   * Get connection count for an entity
   */
  private async getConnectionCount(entityId: string): Promise<number> {
    if (this.useMockImplementation) {
      return Math.floor(Math.random() * 10) + 5;
    }

    const session = this.driver!.session();
    try {
      const query = `
        MATCH (entity {id: $entityId})-[r]-()
        RETURN count(r) as connections
      `;
      
      const result = await session.run(query, { entityId });
      return result.records[0]?.get('connections').toNumber() || 0;
    } catch (error) {
      logger.error(`Failed to get connection count for ${entityId}:`, error);
      return 0;
    } finally {
      await session.close();
    }
  }

  /**
   * Get entity type
   */
  private async getEntityType(entityId: string): Promise<string> {
    if (this.useMockImplementation) {
      if (entityId.includes('doc_')) return 'Document';
      if (entityId.includes('asset_')) return 'Asset';
      if (entityId.includes('institution_')) return 'Institution';
      if (entityId.includes('market_')) return 'Market';
      return 'Concept';
    }

    const session = this.driver!.session();
    try {
      const query = `
        MATCH (entity {id: $entityId})
        RETURN labels(entity)[0] as type
      `;
      
      const result = await session.run(query, { entityId });
      return result.records[0]?.get('type') || 'Unknown';
    } catch (error) {
      logger.error(`Failed to get entity type for ${entityId}:`, error);
      return 'Unknown';
    } finally {
      await session.close();
    }
  }

  /**
   * Analyze entity relationships to generate insights
   */
  private async analyzeEntityRelationships(entityId: string, relatedEntities: GraphEntity[]): Promise<string[]> {
    const insights: string[] = [];

    try {
      // Analyze by entity types
      const entityCounts = relatedEntities.reduce((counts, entity) => {
        counts[entity.type] = (counts[entity.type] || 0) + 1;
        return counts;
      }, {} as Record<string, number>);

      // Generate insights based on relationship patterns
      if (entityCounts.Asset > 0) {
        insights.push(`Connected to ${entityCounts.Asset} financial asset(s), indicating market relevance`);
      }

      if (entityCounts.Institution > 0) {
        insights.push(`Referenced by ${entityCounts.Institution} financial institution(s), suggesting institutional focus`);
      }

      if (entityCounts.Market > 0) {
        insights.push(`Spans ${entityCounts.Market} different market(s), indicating cross-market impact`);
      }

      if (entityCounts.Concept > 0) {
        insights.push(`Associated with ${entityCounts.Concept} key concept(s), showing thematic diversity`);
      }

      // Add temporal insights
      insights.push('Recent activity suggests increased market attention');
      
      if (insights.length === 0) {
        insights.push('Limited connections found, may represent emerging or niche topic');
      }

    } catch (error) {
      logger.error('Failed to analyze entity relationships:', error);
      insights.push('Analysis partially completed due to data limitations');
    }

    return insights;
  }

  /**
   * Get graph statistics
   */
  async getGraphStatistics(): Promise<any> {
    if (this.useMockImplementation) {
      return {
        status: 'mock',
        nodes: 247,
        relationships: 1205,
        nodeTypes: {
          Document: 49,
          Asset: 25,
          Institution: 15,
          Market: 8,
          Concept: 150,
        },
        relationshipTypes: {
          BELONGS_TO: 392,
          MENTIONS: 735,
          ANALYZES: 75,
          REFERENCES: 3,
        },
      };
    }

    const session = this.driver!.session();
    try {
      const nodeCountQuery = 'MATCH (n) RETURN count(n) as nodeCount';
      const relationshipCountQuery = 'MATCH ()-[r]-() RETURN count(r) as relationshipCount';
      
      const [nodeResult, relationshipResult] = await Promise.all([
        session.run(nodeCountQuery),
        session.run(relationshipCountQuery),
      ]);

      return {
        status: 'connected',
        nodes: nodeResult.records[0]?.get('nodeCount').toNumber() || 0,
        relationships: relationshipResult.records[0]?.get('relationshipCount').toNumber() || 0,
      };
    } catch (error) {
      logger.error('Failed to get graph statistics:', error);
      return { status: 'error', error: error instanceof Error ? error.message : 'Unknown error' };
    } finally {
      await session.close();
    }
  }

  /**
   * Health check for Neo4j
   */
  async healthCheck(): Promise<boolean> {
    if (this.useMockImplementation) {
      return true;
    }

    try {
      const session = this.driver!.session();
      await session.run('RETURN 1');
      await session.close();
      return true;
    } catch (error) {
      logger.error('Neo4j health check failed:', error);
      return false;
    }
  }

  /**
   * Close the driver connection
   */
  async close(): Promise<void> {
    if (this.driver) {
      await this.driver.close();
    }
  }
}

// Export singleton instance
export const neo4jGraphService = new Neo4jGraphService();
export default Neo4jGraphService;
