import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, TrendingUp, Clock, AlertCircle } from 'lucide-react';
import ArticleCard from '../components/ArticleCard';
import AssetCard from '../components/AssetCard';
import ApiService from '../services/api';
import type { Article, TrendingAsset, AssetStatistics } from '../services/api';
import { formatNumber } from '../utils/helpers';

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

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (searchQuery) {
      filterArticlesBySearch();
    } else {
      fetchArticles();
    }
  }, [searchQuery]);

  const fetchInitialData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [articlesData, trendingData, statsData] = await Promise.all([
        ApiService.getArticles({ limit: 20 }),
        ApiService.getTrendingAssets('24h'),
        ApiService.getAssetStatistics('24h')
      ]);

      setArticles(articlesData.articles);
      setTrendingAssets(trendingData.trending);
      setStatistics(statsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const fetchArticles = async () => {
    try {
      const data = await ApiService.getArticles({ limit: 20 });
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
                Latest News
                {searchQuery && (
                  <span className="text-sm font-normal text-gray-500 ml-2">
                    for "{searchQuery}"
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

            {articles.length > 0 ? (
              <div className="space-y-6">
                {articles.map((article) => (
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
