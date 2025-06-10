import dotenv from 'dotenv';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Set test environment
process.env.NODE_ENV = 'test';

// Mock external services for testing
jest.mock('../services/vector-database.service', () => ({
  default: {
    searchSimilarDocuments: jest.fn().mockResolvedValue([]),
    addDocument: jest.fn().mockResolvedValue({ id: 'test-id' }),
    deleteDocument: jest.fn().mockResolvedValue(true),
  },
}));

jest.mock('../services/neo4j-graph.service', () => ({
  default: {
    searchEntities: jest.fn().mockResolvedValue([]),
    addEntity: jest.fn().mockResolvedValue(true),
    createRelationship: jest.fn().mockResolvedValue(true),
  },
}));

// Global test setup
beforeAll(async () => {
  // Any global setup can go here
});

afterAll(async () => {
  // Any global cleanup can go here
});

// Increase timeout for performance tests
jest.setTimeout(30000);
