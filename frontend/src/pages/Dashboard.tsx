import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, TrendingUp, Clock, AlertCircle } from 'lucide-react';
import ArticleCard from '../components/ArticleCard';
import AssetCard from '../components/AssetCard';
import SearchAndFilters from '../components/SearchAndFilters';
import ApiService from '../services/api';
import type { Article, TrendingAsset, AssetStatistics } from '../services/api';
import { formatNumber } from '../utils/helpers';

interface DashboardProps {
  searchQuery: string;
}

const Dashboard: React.FC<DashboardProps> = ({ searchQuery }) => {
  const navigate = useNavigate();
  const [articles, setArticles] = useState<Article[]>([]);
  const [filteredArticles, setFilteredArticles] = useState<Article[]>([]);
  const [trendingAssets, setTrendingAssets] = useState<TrendingAsset[]>([]);
  const [statistics, setStatistics] = useState<AssetStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter states
  const [filterSearchTerm, setFilterSearchTerm] = useState('');
  const [selectedAsset, setSelectedAsset] = useState('');
  const [selectedSentiment, setSelectedSentiment] = useState('all');
  const [timeframe, setTimeframe] = useState('24h');
  const [availableAssets, setAvailableAssets] = useState<string[]>([]);

  useEffect(() => {
    fetchInitialData();

    // Set up polling for real-time updates every 2 minutes
    const pollInterval = setInterval(() => {
      fetchArticles();
      if (trendingAssets.length > 0) {
        ApiService.getTrendingAssets('24h').then(data => {
          setTrendingAssets(data.trending);
        });
      }
    }, 120000); // 2 minutes

    return () => clearInterval(pollInterval);
  }, []);

  useEffect(() => {
    if (searchQuery) {
      filterArticlesBySearch();
    } else {
      fetchArticles();
    }
  }, [searchQuery]);

  // Apply filters when any filter changes
  useEffect(() => {
    applyFilters();
  }, [articles, filterSearchTerm, selectedAsset, selectedSentiment, timeframe]);

  const fetchInitialData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [articlesData, trendingData, statsData] = await Promise.all([
        ApiService.getArticles({ limit: 100 }),
        ApiService.getTrendingAssets('24h'),
        ApiService.getAssetStatistics('24h')
      ]);

      setArticles(articlesData.articles);
      setTrendingAssets(trendingData.trending);
      setStatistics(statsData);

      // Extract unique assets for filter dropdown
      const uniqueAssets = [...new Set(
        articlesData.articles.flatMap(article => article.instruments)
      )].sort();
      setAvailableAssets(uniqueAssets);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const fetchArticles = async () => {
    try {
      const data = await ApiService.getArticles({ limit: 100 });
      setArticles(data.articles);
    } catch (err) {
      console.error('Failed to fetch articles:', err);
    }
  };

  const filterArticlesBySearch = async () => {
    try {
      const data = await ApiService.getArticles({ limit: 100 });
      const filtered = data.articles.filter(article =>
        article.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        article.content?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        article.instruments.some(inst => 
          inst.toLowerCase().includes(searchQuery.toLowerCase())
        )
      );
      setArticles(filtered);
    } catch (err) {
      console.error('Failed to filter articles:', err);
    }
  };

  const applyFilters = () => {
    let filtered = [...articles];

    // Apply search filter
    if (filterSearchTerm) {
      filtered = filtered.filter(article =>
        article.title.toLowerCase().includes(filterSearchTerm.toLowerCase()) ||
        article.content?.toLowerCase().includes(filterSearchTerm.toLowerCase()) ||
        article.instruments.some(inst => 
          inst.toLowerCase().includes(filterSearchTerm.toLowerCase())
        )
      );
    }

    // Apply asset filter
    if (selectedAsset) {
      filtered = filtered.filter(article =>
        article.instruments.includes(selectedAsset)
      );
    }

    // Apply sentiment filter
    if (selectedSentiment !== 'all') {
      filtered = filtered.filter(article =>
        article.sentimentLabel === selectedSentiment
      );
    }

    // Apply timeframe filter
    if (timeframe !== '24h') {
      const now = new Date();
      const cutoffTime = new Date();
      
      switch (timeframe) {
        case '1h':
          cutoffTime.setHours(now.getHours() - 1);
          break;
        case '6h':
          cutoffTime.setHours(now.getHours() - 6);
          break;
        case '12h':
          cutoffTime.setHours(now.getHours() - 12);
          break;
        case '7d':
          cutoffTime.setDate(now.getDate() - 7);
          break;
        case '30d':
          cutoffTime.setDate(now.getDate() - 30);
          break;
        default:
          cutoffTime.setHours(now.getHours() - 24);
      }

      filtered = filtered.filter(article =>
        new Date(article.publishedAt) >= cutoffTime
      );
    }

    setFilteredArticles(filtered);
  };

  const handleAssetClick = (asset: string) => {
    navigate(`/asset/${asset}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading latest financial news...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <AlertCircle className="h-12 w-12 text-danger-600 mx-auto mb-4" />
            <p className="text-gray-900 font-semibold mb-2">Error loading data</p>
            <p className="text-gray-600 mb-4">{error}</p>
            <button
              onClick={fetchInitialData}
              className="btn-primary"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Search and Filters */}
        <SearchAndFilters
          searchTerm={filterSearchTerm}
          setSearchTerm={setFilterSearchTerm}
          selectedAsset={selectedAsset}
          setSelectedAsset={setSelectedAsset}
          selectedSentiment={selectedSentiment}
          setSelectedSentiment={setSelectedSentiment}
          timeframe={timeframe}
          setTimeframe={setTimeframe}
          assets={availableAssets}
        />

        {/* Statistics Cards */}
        {statistics && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="card">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Articles</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {formatNumber(statistics.totalArticles)}
                  </p>
                </div>
                <BarChart3 className="h-8 w-8 text-primary-600" />
              </div>
            </div>

            <div className="card">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Positive</p>
                  <p className="text-2xl font-bold text-success-600">
                    {formatNumber(statistics.sentimentBreakdown.positive)}
                  </p>
                </div>
                <TrendingUp className="h-8 w-8 text-success-600" />
              </div>
            </div>

            <div className="card">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Negative</p>
                  <p className="text-2xl font-bold text-danger-600">
                    {formatNumber(statistics.sentimentBreakdown.negative)}
                  </p>
                </div>
                <TrendingUp className="h-8 w-8 text-danger-600 transform rotate-180" />
              </div>
            </div>

            <div className="card">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Assets</p>
                  <p className="text-2xl font-bold text-primary-600">
                    {trendingAssets.length}
                  </p>
                </div>
                <TrendingUp className="h-8 w-8 text-primary-600" />
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Articles */}
          <div className="lg:col-span-3">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">
                Latest News ({filteredArticles.length})
                {searchQuery && (
                  <span className="text-sm font-normal text-gray-500 ml-2">
                    for "{searchQuery}"
                  </span>
                )}
                {(filterSearchTerm || selectedAsset || selectedSentiment !== 'all') && (
                  <span className="text-sm font-normal text-gray-500 ml-2">
                    • Filtered
                  </span>
                )}
              </h2>
              <div className="flex items-center space-x-2 text-sm text-gray-500">
                <Clock className="h-4 w-4" />
                <span>
                  Last updated: {statistics?.lastUpdated ? 
                    new Date(statistics.lastUpdated).toLocaleTimeString() : 'Unknown'}
                </span>
              </div>
            </div>

            {filteredArticles.length > 0 ? (
              <div className="space-y-6">
                {filteredArticles.map((article) => (
                  <ArticleCard
                    key={article.id}
                    article={article}
                    onAssetClick={handleAssetClick}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="text-gray-400 text-6xl mb-4">📰</div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">No articles found</h3>
                <p className="text-gray-600">
                  {searchQuery 
                    ? `No articles found matching "${searchQuery}"`
                    : 'Check back later for the latest financial news.'
                  }
                </p>
              </div>
            )}
          </div>

          {/* Trending Assets Sidebar */}
          <div className="lg:col-span-1">
            <div className="sticky top-6">
              <h3 className="text-lg font-bold text-gray-900 mb-6">Trending Assets</h3>
              {trendingAssets.length > 0 ? (
                <div className="space-y-4">
                  {trendingAssets.slice(0, 8).map((asset) => (
                    <AssetCard
                      key={asset.asset}
                      asset={asset}
                      onClick={handleAssetClick}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="animate-pulse space-y-3">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className="bg-gray-200 h-16 rounded-lg"></div>
                    ))}
                  </div>
                  <p className="text-gray-600 mt-4">Loading trending assets...</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
