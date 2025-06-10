import React, { useState, useEffect } from 'react';
import { Search, FileText, Brain, TrendingUp, AlertCircle, Play, Database, Settings } from 'lucide-react';
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

interface KnowledgeDocument {
  id: string;
  title: string;
  summary: string;
  category: string;
  markets: string[];
  tags: string[];
  filename: string;
  fileSize: number;
}

interface KnowledgeStats {
  totalDocuments: number;
  processedDocuments: number;
  categories: Record<string, number>;
  markets: Record<string, number>;
  lastProcessed: string | null;
}

interface GraphStats {
  totalNodes: number;
  totalEdges: number;
  nodeTypes: Record<string, number>;
  edgeTypes: Record<string, number>;
  lastUpdated: string;
}

interface ContextualInsight {
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

const KnowledgeBase: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'search' | 'insights' | 'admin'>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<KnowledgeDocument[]>([]);
  const [insightQuery, setInsightQuery] = useState('');
  const [insights, setInsights] = useState<ContextualInsight | null>(null);
  const [knowledgeStats, setKnowledgeStats] = useState<KnowledgeStats | null>(null);
  const [graphStats, setGraphStats] = useState<GraphStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  // Filters
  const [selectedMarket, setSelectedMarket] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');

  useEffect(() => {
    loadStatistics();
  }, []);

  const loadStatistics = async () => {
    try {
      const [kbStats, gStats] = await Promise.all([
        axios.get(`${API_BASE_URL}/knowledge/documents/stats`),
        axios.get(`${API_BASE_URL}/knowledge/graph/stats`)
      ]);
      
      setKnowledgeStats(kbStats.data.data);
      setGraphStats(gStats.data.data);
    } catch (error) {
      console.error('Failed to load statistics:', error);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const params = new URLSearchParams({
        search: searchQuery,
        limit: '10'
      });
      
      if (selectedMarket) params.append('market', selectedMarket);
      if (selectedCategory) params.append('category', selectedCategory);
      
      const response = await axios.get(`${API_BASE_URL}/knowledge/documents/search?${params}`);
      setSearchResults(response.data.data.documents);
    } catch (error) {
      setError('Failed to search knowledge base');
      console.error('Search error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleInsightQuery = async () => {
    if (!insightQuery.trim()) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await axios.post(`${API_BASE_URL}/knowledge/graph/insights`, {
        query: insightQuery,
        market: selectedMarket || undefined
      });
      
      setInsights(response.data.data);
    } catch (error) {
      setError('Failed to get contextual insights');
      console.error('Insight error:', error);
    } finally {
      setLoading(false);
    }
  };

  const triggerProcessing = async () => {
    setProcessing(true);
    setError(null);
    
    try {
      await axios.post(`${API_BASE_URL}/knowledge/documents/process`);
      await loadStatistics();
      alert('Knowledge base processing completed successfully!');
    } catch (error) {
      setError('Failed to process knowledge base');
      console.error('Processing error:', error);
    } finally {
      setProcessing(false);
    }
  };

  const triggerGraphBuild = async () => {
    setProcessing(true);
    setError(null);
    
    try {
      await axios.post(`${API_BASE_URL}/knowledge/graph/build`);
      await loadStatistics();
      alert('Knowledge graph build completed successfully!');
    } catch (error) {
      setError('Failed to build knowledge graph');
      console.error('Graph build error:', error);
    } finally {
      setProcessing(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  const renderSearchTab = () => (
    <div className="space-y-6">
      {/* Search Controls */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Search knowledge base..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
          
          <div className="flex gap-2">
            <select
              value={selectedMarket}
              onChange={(e) => setSelectedMarket(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Markets</option>
              <option value="forex">Forex</option>
              <option value="crypto">Crypto</option>
              <option value="futures">Futures</option>
              <option value="stocks">Stocks</option>
              <option value="bonds">Bonds</option>
            </select>
            
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Categories</option>
              <option value="strategy">Strategy</option>
              <option value="research">Research</option>
              <option value="analysis">Analysis</option>
              <option value="market-outlook">Market Outlook</option>
              <option value="economic-data">Economic Data</option>
            </select>
            
            <button
              onClick={handleSearch}
              disabled={loading || !searchQuery.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Search className="h-4 w-4" />
              Search
            </button>
          </div>
        </div>
      </div>

      {/* Search Results */}
      {loading && (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Searching knowledge base...</p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
          <div>
            <h4 className="font-medium text-red-800">Error</h4>
            <p className="text-red-700">{error}</p>
          </div>
        </div>
      )}

      {searchResults.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">
            Search Results ({searchResults.length})
          </h3>
          
          {searchResults.map((doc) => (
            <div key={doc.id} className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="h-5 w-5 text-blue-600" />
                    <h4 className="font-medium text-gray-900">{doc.title}</h4>
                    <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">
                      {doc.category}
                    </span>
                  </div>
                  
                  <p className="text-gray-700 mb-3">{doc.summary}</p>
                  
                  <div className="flex flex-wrap gap-2 mb-3">
                    {doc.markets.map((market) => (
                      <span key={market} className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">
                        {market}
                      </span>
                    ))}
                    {doc.tags.slice(0, 5).map((tag) => (
                      <span key={tag} className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">
                        {tag}
                      </span>
                    ))}
                  </div>
                  
                  <div className="text-sm text-gray-500 flex items-center gap-4">
                    <span>{doc.filename}</span>
                    <span>{formatFileSize(doc.fileSize)}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderInsightsTab = () => (
    <div className="space-y-6">
      {/* Insight Query */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">AI-Powered Market Insights</h3>
        
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <textarea
              value={insightQuery}
              onChange={(e) => setInsightQuery(e.target.value)}
              placeholder="Ask a question about markets, trends, or trading strategies..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          
          <div className="flex flex-col gap-2">
            <select
              value={selectedMarket}
              onChange={(e) => setSelectedMarket(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Markets</option>
              <option value="forex">Forex</option>
              <option value="crypto">Crypto</option>
              <option value="futures">Futures</option>
              <option value="stocks">Stocks</option>
            </select>
            
            <button
              onClick={handleInsightQuery}
              disabled={loading || !insightQuery.trim()}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Brain className="h-4 w-4" />
              Get Insights
            </button>
          </div>
        </div>
      </div>

      {/* Insights Results */}
      {insights && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center gap-2 mb-4">
            <Brain className="h-5 w-5 text-green-600" />
            <h4 className="font-medium text-gray-900">Contextual Analysis</h4>
            <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded">
              {Math.round(insights.confidence * 100)}% confidence
            </span>
          </div>

          <div className="space-y-4">
            {/* Market Impact */}
            <div>
              <h5 className="font-medium text-gray-900 mb-2">Market Impact</h5>
              <p className="text-gray-700">{insights.marketImpact}</p>
            </div>

            {/* Key Entities */}
            {insights.entities.length > 0 && (
              <div>
                <h5 className="font-medium text-gray-900 mb-2">Key Entities</h5>
                <div className="flex flex-wrap gap-2">
                  {insights.entities.map((entity) => (
                    <span key={entity} className="px-2 py-1 bg-blue-100 text-blue-700 text-sm rounded">
                      {entity}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Trading Implications */}
            {insights.tradingImplications.length > 0 && (
              <div>
                <h5 className="font-medium text-gray-900 mb-2">Trading Implications</h5>
                <ul className="list-disc list-inside space-y-1">
                  {insights.tradingImplications.map((implication, index) => (
                    <li key={index} className="text-gray-700">{implication}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Sources */}
            {insights.sources.length > 0 && (
              <div>
                <h5 className="font-medium text-gray-900 mb-2">Sources</h5>
                <div className="text-sm text-gray-600">
                  Based on {insights.sources.length} document(s) including: {insights.sources.slice(0, 3).join(', ')}
                  {insights.sources.length > 3 && '...'}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );

  const renderAdminTab = () => (
    <div className="space-y-6">
      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Knowledge Base Stats */}
        {knowledgeStats && (
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center gap-2 mb-4">
              <Database className="h-5 w-5 text-blue-600" />
              <h3 className="font-semibold text-gray-900">Knowledge Base</h3>
            </div>
            
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">Total Documents:</span>
                <span className="font-medium">{knowledgeStats.totalDocuments}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Processed:</span>
                <span className="font-medium">{knowledgeStats.processedDocuments}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Last Processed:</span>
                <span className="text-sm text-gray-500">
                  {knowledgeStats.lastProcessed 
                    ? new Date(knowledgeStats.lastProcessed).toLocaleDateString()
                    : 'Never'
                  }
                </span>
              </div>
            </div>

            <div className="mt-4">
              <h4 className="text-sm font-medium text-gray-900 mb-2">Categories</h4>
              <div className="space-y-1">
                {Object.entries(knowledgeStats.categories).map(([category, count]) => (
                  <div key={category} className="flex justify-between text-sm">
                    <span className="text-gray-600 capitalize">{category}:</span>
                    <span>{count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Graph Stats */}
        {graphStats && (
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="h-5 w-5 text-green-600" />
              <h3 className="font-semibold text-gray-900">Knowledge Graph</h3>
            </div>
            
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">Total Nodes:</span>
                <span className="font-medium">{graphStats.totalNodes}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Total Edges:</span>
                <span className="font-medium">{graphStats.totalEdges}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Last Updated:</span>
                <span className="text-sm text-gray-500">
                  {new Date(graphStats.lastUpdated).toLocaleDateString()}
                </span>
              </div>
            </div>

            <div className="mt-4">
              <h4 className="text-sm font-medium text-gray-900 mb-2">Node Types</h4>
              <div className="space-y-1">
                {Object.entries(graphStats.nodeTypes).map(([type, count]) => (
                  <div key={type} className="flex justify-between text-sm">
                    <span className="text-gray-600 capitalize">{type}:</span>
                    <span>{count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Admin Actions */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center gap-2 mb-4">
          <Settings className="h-5 w-5 text-gray-600" />
          <h3 className="font-semibold text-gray-900">Admin Actions</h3>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-4">
          <button
            onClick={triggerProcessing}
            disabled={processing}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Play className="h-4 w-4" />
            {processing ? 'Processing...' : 'Process Documents'}
          </button>
          
          <button
            onClick={triggerGraphBuild}
            disabled={processing}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <TrendingUp className="h-4 w-4" />
            {processing ? 'Building...' : 'Build Knowledge Graph'}
          </button>
          
          <button
            onClick={loadStatistics}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 flex items-center gap-2"
          >
            <Database className="h-4 w-4" />
            Refresh Stats
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Knowledge Base</h1>
          <p className="text-gray-600">AI-powered financial knowledge management and insights</p>
        </div>

        {/* Tab Navigation */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="-mb-px flex space-x-8">
            {[
              { id: 'search', label: 'Search', icon: Search },
              { id: 'insights', label: 'AI Insights', icon: Brain },
              { id: 'admin', label: 'Admin', icon: Settings }
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id as any)}
                className={`py-2 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
                  activeTab === id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        {activeTab === 'search' && renderSearchTab()}
        {activeTab === 'insights' && renderInsightsTab()}
        {activeTab === 'admin' && renderAdminTab()}
      </div>
    </div>
  );
};

export default KnowledgeBase;
