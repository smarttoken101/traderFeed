import { Router } from 'express';
import { 
  knowledgeBaseController, 
  graphKnowledgeController, 
  mcpController 
} from '../controllers/knowledge.controller';

const router = Router();

/**
 * Knowledge Base Routes
 * /api/knowledge/...
 */

// Document processing and management
router.post('/documents/process', knowledgeBaseController.processDocuments);
router.post('/documents/query', knowledgeBaseController.queryKnowledgeBase);
router.get('/documents/search', knowledgeBaseController.searchDocuments);
router.get('/documents/:id', knowledgeBaseController.getDocument);
router.get('/documents/stats', knowledgeBaseController.getStatistics);

// Knowledge Graph endpoints
router.post('/graph/build', graphKnowledgeController.buildGraph);
router.get('/graph/query', graphKnowledgeController.queryGraph);
router.post('/graph/insights', graphKnowledgeController.getContextualInsights);
router.get('/graph/stats', graphKnowledgeController.getGraphStatistics);

// MCP (Model Context Protocol) endpoints
router.post('/mcp/request', mcpController.handleRequest);
router.post('/mcp/context', mcpController.createContext);
router.post('/mcp/analysis', mcpController.comprehensiveAnalysis);
router.get('/mcp/tools', mcpController.getTools);
router.get('/mcp/stats', mcpController.getStatistics);

export default router;
