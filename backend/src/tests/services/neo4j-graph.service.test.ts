import Neo4jGraphService from '../../services/neo4j-graph.service';
import logger from '../../utils/logger';

// Mock dependencies
jest.mock('neo4j-driver');
jest.mock('../../utils/logger');

describe('Neo4jGraphService', () => {
  let graphService: Neo4jGraphService;
  let mockDriver: any;
  let mockSession: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock Neo4j driver and session
    mockSession = {
      run: jest.fn(),
      close: jest.fn()
    };

    mockDriver = {
      session: jest.fn().mockReturnValue(mockSession),
      close: jest.fn()
    };

    // Mock neo4j.driver
    const neo4j = require('neo4j-driver');
    neo4j.driver = jest.fn().mockReturnValue(mockDriver);

    graphService = new Neo4jGraphService();
  });

  afterEach(async () => {
    await graphService.close();
  });

  describe('initializeSchema', () => {
    it('should initialize Neo4j schema successfully', async () => {
      mockSession.run.mockResolvedValue({ records: [] });

      await graphService.initializeSchema();

      expect(mockSession.run).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('Neo4j schema initialized successfully');
    });

    it('should use mock implementation when Neo4j is unavailable', async () => {
      mockDriver.session.mockImplementation(() => {
        throw new Error('Neo4j unavailable');
      });

      await graphService.initializeSchema();

      expect(logger.info).toHaveBeenCalledWith('Mock: Neo4j schema initialized');
    });
  });

  describe('createEntity', () => {
    it('should create entity successfully', async () => {
      const entity = {
        id: 'entity-123',
        type: 'Document' as const,
        properties: {
          title: 'Test Document',
          content: 'Test content'
        }
      };

      mockSession.run.mockResolvedValue({ records: [] });

      await graphService.createEntity(entity);

      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('MERGE (e:Document {id: $id})'),
        expect.objectContaining({
          id: entity.id,
          properties: entity.properties
        })
      );
      expect(logger.info).toHaveBeenCalledWith('Created/updated entity: entity-123');
    });

    it('should use mock implementation when Neo4j is unavailable', async () => {
      const entity = {
        id: 'entity-123',
        type: 'Document' as const,
        properties: { title: 'Test Document' }
      };

      // Force mock implementation
      mockSession.run.mockRejectedValue(new Error('Neo4j unavailable'));
      
      await graphService.createEntity(entity);

      expect(logger.info).toHaveBeenCalledWith('Mock: Created entity entity-123 of type Document');
    });
  });

  describe('createRelationship', () => {
    it('should create relationship successfully', async () => {
      const relationship = {
        from: 'entity1',
        to: 'entity2',
        type: 'RELATES_TO',
        properties: { strength: 0.8 }
      };

      mockSession.run.mockResolvedValue({ records: [] });

      await graphService.createRelationship(relationship);

      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('MERGE (from)-[r:RELATES_TO]->(to)'),
        expect.objectContaining({
          fromId: relationship.from,
          toId: relationship.to,
          properties: relationship.properties
        })
      );
    });

    it('should use mock implementation when Neo4j is unavailable', async () => {
      const relationship = {
        from: 'entity1',
        to: 'entity2',
        type: 'RELATES_TO'
      };

      // Force mock implementation
      mockSession.run.mockRejectedValue(new Error('Neo4j unavailable'));

      await graphService.createRelationship(relationship);

      expect(logger.info).toHaveBeenCalledWith('Mock: Created relationship RELATES_TO from entity1 to entity2');
    });
  });

  describe('findRelatedEntities', () => {
    it('should find related entities successfully', async () => {
      const mockResult = {
        records: [
          {
            get: jest.fn().mockReturnValue({
              properties: { id: 'related-1', name: 'Related Entity 1' },
              labels: ['Document']
            })
          },
          {
            get: jest.fn().mockReturnValue({
              properties: { id: 'related-2', name: 'Related Entity 2' },
              labels: ['Asset']
            })
          }
        ]
      };

      mockSession.run.mockResolvedValue(mockResult);

      const result = await graphService.findRelatedEntities('entity-123', 2);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('related-1');
      expect(result[1].id).toBe('related-2');
      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('MATCH (start {id: $entityId})-[*1..2]-(related)'),
        { entityId: 'entity-123' }
      );
    });

    it('should return mock entities when Neo4j is unavailable', async () => {
      mockSession.run.mockRejectedValue(new Error('Neo4j unavailable'));

      const result = await graphService.findRelatedEntities('entity-123');

      expect(result).toEqual(expect.any(Array));
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle query errors', async () => {
      mockSession.run.mockRejectedValue(new Error('Query failed'));

      await expect(graphService.findRelatedEntities('entity-123'))
        .resolves.toEqual(expect.any(Array)); // Should return mock data
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to find related entities for entity-123:',
        expect.any(Error)
      );
    });
  });

  describe('processDocumentForGraph', () => {
    it('should process document and create entities/relationships', async () => {
      const document = {
        id: 'doc-123',
        title: 'Test Document',
        content: 'EURUSD analysis shows bullish trend',
        category: 'forex',
        markets: ['forex'],
        tags: ['analysis', 'eurusd'],
        filename: 'test.pdf'
      };

      mockSession.run.mockResolvedValue({ records: [] });

      await graphService.processDocumentForGraph(document);

      // Should create document entity
      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('MERGE (e:Document {id: $id})'),
        expect.objectContaining({
          id: document.id
        })
      );
    });

    it('should handle processing errors gracefully', async () => {
      const document = {
        id: 'doc-123',
        title: 'Test Document',
        content: 'Test content',
        category: 'general',
        markets: ['general'],
        tags: ['test'],
        filename: 'test.pdf'
      };

      mockSession.run.mockRejectedValue(new Error('Processing failed'));

      await expect(graphService.processDocumentForGraph(document))
        .rejects.toThrow('Processing failed');
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to process document for graph doc-123:',
        expect.any(Error)
      );
    });
  });

  describe('generateContextualInsights', () => {
    it('should generate insights for an entity', async () => {
      // Mock for findRelatedEntities
      const mockRelatedEntities = [
        { id: 'related-1', type: 'Asset' as const, properties: { symbol: 'EURUSD' } },
        { id: 'related-2', type: 'Institution' as const, properties: { name: 'Fed' } }
      ];

      jest.spyOn(graphService, 'findRelatedEntities').mockResolvedValue(mockRelatedEntities);

      const insights = await graphService.generateContextualInsights('entity-123');

      expect(insights.entityId).toBe('entity-123');
      expect(insights.relatedEntities).toEqual(mockRelatedEntities);
      expect(insights.insights).toEqual(expect.any(Array));
      expect(insights.confidence).toBeGreaterThan(0);
    });

    it('should handle insights generation errors', async () => {
      jest.spyOn(graphService, 'findRelatedEntities').mockRejectedValue(new Error('Insights failed'));

      await expect(graphService.generateContextualInsights('entity-123'))
        .rejects.toThrow('Insights failed');
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to generate insights for entity-123:',
        expect.any(Error)
      );
    });
  });

  describe('getGraphStatistics', () => {
    it('should return graph statistics', async () => {
      const stats = await graphService.getGraphStatistics();

      expect(stats).toHaveProperty('status');
      expect(stats).toHaveProperty('nodes');
      expect(stats).toHaveProperty('relationships');
    });

    it('should return mock statistics when Neo4j is unavailable', async () => {
      mockSession.run.mockRejectedValue(new Error('Neo4j unavailable'));

      const stats = await graphService.getGraphStatistics();

      expect(stats.status).toBe('mock');
      expect(stats.nodes).toBeGreaterThan(0);
      expect(stats.relationships).toBeGreaterThan(0);
    });
  });

  describe('healthCheck', () => {
    it('should return true when Neo4j is available', async () => {
      mockDriver.verifyConnectivity = jest.fn().mockResolvedValue(true);

      const health = await graphService.healthCheck();

      expect(health).toBe(true);
    });

    it('should return false when Neo4j is unavailable', async () => {
      mockDriver.verifyConnectivity = jest.fn().mockRejectedValue(new Error('Connection failed'));

      const health = await graphService.healthCheck();

      expect(health).toBe(false);
    });

    it('should return true in mock mode', async () => {
      // Force mock implementation
      mockDriver.session.mockImplementation(() => {
        throw new Error('Neo4j unavailable');
      });

      const health = await graphService.healthCheck();

      expect(health).toBe(true);
    });
  });

  describe('Error handling and edge cases', () => {
    it('should handle session creation failures', async () => {
      mockDriver.session.mockImplementation(() => {
        throw new Error('Session creation failed');
      });

      const entity = {
        id: 'entity-123',
        type: 'Document' as const,
        properties: { title: 'Test' }
      };

      await graphService.createEntity(entity);

      expect(logger.info).toHaveBeenCalledWith('Mock: Created entity entity-123 of type Document');
    });

    it('should handle query timeouts gracefully', async () => {
      mockSession.run.mockRejectedValue(new Error('Query timeout'));

      const result = await graphService.findRelatedEntities('entity-123');

      expect(result).toEqual(expect.any(Array));
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to find related entities for entity-123:',
        expect.any(Error)
      );
    });

    it('should handle network connectivity issues', async () => {
      mockDriver.session.mockImplementation(() => {
        throw new Error('ECONNREFUSED');
      });

      await graphService.initializeSchema();

      expect(logger.info).toHaveBeenCalledWith('Mock: Neo4j schema initialized');
    });
  });
});
