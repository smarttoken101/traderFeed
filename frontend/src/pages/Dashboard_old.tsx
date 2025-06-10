import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, TrendingUp, Clock, AlertCircle } from 'lucide-react';
import SearchAndFilters from '../components/SearchAndFilters';
import ArticleCard from '../components/ArticleCard';
import AssetCard from '../components/AssetCard';
import ApiService from '../services/api';
import type { Article, TrendingAsset, AssetStatistics } from '../services/api';
import { formatNumber, debounce } from '../utils/helpers';

interface DashboardProps {
  searchQuery: string;
}

const Dashboard: React.FC<DashboardProps> = ({ searchQuery }) => {
  const navigate = useNavigate();
  const [articles, setArticles] = useState<Article[]>([]);
  const [trendingAssets, setTrendingAssets] = useState<TrendingAsset[]>([]);
  const [statistics, setStatistics] = useState<AssetStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [localSearchQuery, setLocalSearchQuery] = useState('');
  const [filters, setFilters] = useState<{
    category?: string;
    sentiment?: string;
    timeframe?: string;
    assets?: string[];
  }>({});
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);
  const [availableAssets, setAvailableAssets] = useState<string[]>([]);

  // Debounced search - use the prop searchQuery instead of local state
  const debouncedSearch = debounce((query: string) => {
    if (query.length > 2 || query.length === 0) {
      fetchArticles();
    }
  }, 500);

  useEffect(() => {
    debouncedSearch(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    fetchArticles();
  }, [filters, selectedAsset]);

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch trending assets and statistics
      const [trending, stats, assets] = await Promise.all([
        ApiService.getTrendingAssets('24h'),
        ApiService.getAssetStatistics('24h'),
        ApiService.getAssets()
      ]);

      setTrendingAssets(trending.trending);
      setStatistics(stats);
      
      // Extract all assets from categories
      const allAssets = assets.categories.flatMap(cat => cat.assets);
      setAvailableAssets(allAssets);

      // Fetch initial articles
      await fetchArticles();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const fetchArticles = async () => {
    try {
      let articles: Article[];
      
      if (selectedAsset) {
        // Fetch articles for specific asset
        const assetNews = await ApiService.getAssetNews(selectedAsset, {
          limit: 50
        });
        articles = assetNews.articles;
      } else if (filters.category) {
        // Fetch articles for category
        const categoryNews = await ApiService.getCategoryNews(filters.category, {
          limit: 50
        });
        articles = categoryNews.articles;
      } else {
        // Fetch general articles with filters
        const result = await ApiService.getArticles({
          limit: 50,
          category: filters.category,
          sentiment: filters.sentiment,
          instruments: filters.assets
        });
        articles = result.articles;
      }

      // Filter by search query if provided
      if (searchQuery && searchQuery.length > 2) {
        articles = articles.filter(article =>
          article.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          article.content?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          article.instruments.some(instrument => 
            instrument.toLowerCase().includes(searchQuery.toLowerCase())
          )
        );
      }

      setArticles(articles);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch articles');
    }
  };

  const handleAssetClick = (asset: string) => {
    navigate(`/asset/${asset}`);
  };

  const handleFiltersChange = (newFilters: any) => {
    setFilters(newFilters);
    setSelectedAsset(null); // Clear asset selection when applying filters
  };

  const clearAssetSelection = () => {
    setSelectedAsset(null);
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
      
      <SearchAndFilters
        filters={filters}
        onFiltersChange={handleFiltersChange}
        availableAssets={availableAssets}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Selected Asset Banner */}
        {selectedAsset && (
          <div className="bg-primary-50 border border-primary-200 rounded-lg p-4 mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <TrendingUp className="h-5 w-5 text-primary-600" />
                <span className="font-semibold text-primary-900">
                  Showing news for: {selectedAsset}
                </span>
              </div>
              <button
                onClick={clearAssetSelection}
                className="text-primary-600 hover:text-primary-700 text-sm font-medium"
              >
                View all news
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-3">
            {/* Statistics Cards */}
            {statistics && !selectedAsset && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
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
                      <p className="text-sm font-medium text-gray-600">Positive Sentiment</p>
                      <p className="text-2xl font-bold text-success-600">
                        {statistics.sentimentBreakdown.positive}%
                      </p>
                    </div>
                    <TrendingUp className="h-8 w-8 text-success-600" />
                  </div>
                </div>

                <div className="card">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Last Updated</p>
                      <p className="text-lg font-semibold text-gray-900">
                        {new Date(statistics.lastUpdated).toLocaleTimeString()}
                      </p>
                    </div>
                    <Clock className="h-8 w-8 text-gray-600" />
                  </div>
                </div>
              </div>
            )}

            {/* Articles List */}
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900">
                  {selectedAsset ? `${selectedAsset} News` : 'Latest News'}
                  <span className="ml-2 text-sm font-normal text-gray-500">
                    ({articles.length} articles)
                  </span>
                </h2>
              </div>

              {articles.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-gray-500">
                    {searchQuery ? 'No articles found matching your search.' : 'No articles available.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {articles.map((article) => (
                    <ArticleCard
                      key={article.id}
                      article={article}
                      onAssetClick={handleAssetClick}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="sticky top-24 space-y-6">
              {/* Trending Assets */}
              <div className="card">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  Trending Assets
                </h3>
                <div className="space-y-4">
                  {trendingAssets.slice(0, 5).map((asset) => (
                    <AssetCard
                      key={asset.asset}
                      asset={asset}
                      onClick={handleAssetClick}
                    />
                  ))}
                </div>
              </div>

              {/* Sentiment Overview */}
              {statistics && (
                <div className="card">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">
                    Market Sentiment
                  </h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Positive</span>
                      <span className="text-sm font-semibold text-success-600">
                        {statistics.sentimentBreakdown.positive}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Negative</span>
                      <span className="text-sm font-semibold text-danger-600">
                        {statistics.sentimentBreakdown.negative}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Neutral</span>
                      <span className="text-sm font-semibold text-gray-600">
                        {statistics.sentimentBreakdown.neutral}%
                      </span>
                    </div>
                  </div>
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
