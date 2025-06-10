import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, TrendingUp, BarChart3, Clock, RefreshCw } from 'lucide-react';
import ApiService from '../services/api';
import type { AssetNews } from '../services/api';
import ArticleCard from '../components/ArticleCard';
import { 
  getAssetCategory, 
  getCategoryIcon, 
  formatNumber, 
  formatRelativeTime 
} from '../utils/helpers';

const AssetDetail: React.FC = () => {
  const { asset } = useParams<{ asset: string }>();
  const navigate = useNavigate();
  const [assetNews, setAssetNews] = useState<AssetNews | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);
  const [timeframe, setTimeframe] = useState<'24h' | '7d' | '30d'>('24h');

  useEffect(() => {
    if (asset) {
      fetchAssetNews();
    }
  }, [asset]);

  const fetchAssetNews = async (loadMore = false) => {
    if (!asset) return;

    try {
      if (!loadMore) {
        setLoading(true);
        setError(null);
      } else {
        setLoadingMore(true);
      }

      const currentPage = loadMore ? page + 1 : 1;
      const offset = (currentPage - 1) * 20;

      const data = await ApiService.getAssetNews(asset.toUpperCase(), {
        limit: 20,
        offset
      });

      if (loadMore && assetNews) {
        setAssetNews({
          ...data,
          articles: [...assetNews.articles, ...data.articles]
        });
        setPage(currentPage);
      } else {
        setAssetNews(data);
        setPage(1);
      }

      setHasMore(data.hasMore);
    } catch (error) {
      console.error('Failed to fetch asset news:', error);
      setError('Failed to load news for this asset');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const handleLoadMore = () => {
    if (!loadingMore && hasMore) {
      fetchAssetNews(true);
    }
  };

  const handleRefresh = async () => {
    if (!asset) return;
    
    setRefreshing(true);
    try {
      const data = await ApiService.getAssetNews(asset.toUpperCase(), {
        limit: 20,
        offset: 0
      });
      setAssetNews(data);
      setPage(1);
      setHasMore(data.hasMore);
    } catch (error) {
      console.error('Failed to refresh asset news:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const handleAssetClick = (clickedAsset: string) => {
    navigate(`/asset/${clickedAsset}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading asset details...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Error Loading Asset</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="btn-primary"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (!assetNews || !asset) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-gray-400 text-6xl mb-4">📊</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Asset Not Found</h2>
          <p className="text-gray-600 mb-4">No news found for this asset</p>
          <button
            onClick={() => navigate('/')}
            className="btn-primary"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const category = getAssetCategory(asset);
  const categoryIcon = getCategoryIcon(category);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back Button */}
        <button
          onClick={() => navigate('/')}
          className="inline-flex items-center space-x-2 text-gray-600 hover:text-gray-900 mb-6 transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
          <span>Back to Dashboard</span>
        </button>

        {/* Asset Header */}
        <div className="card mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="text-4xl">{categoryIcon}</div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">{asset.toUpperCase()}</h1>
                <p className="text-lg text-gray-600 capitalize">{category}</p>
              </div>
            </div>

            <div className="flex items-center space-x-6">
              <div className="text-center">
                <div className="flex items-center space-x-1 text-gray-500 mb-1">
                  <BarChart3 className="h-4 w-4" />
                  <span className="text-sm">Total Articles</span>
                </div>
                <div className="text-2xl font-bold text-gray-900">
                  {formatNumber(assetNews.count)}
                </div>
              </div>

              <div className="text-center">
                <div className="flex items-center space-x-1 text-gray-500 mb-1">
                  <TrendingUp className="h-4 w-4" />
                  <span className="text-sm">Timeframe</span>
                </div>
                <select
                  value={timeframe}
                  onChange={(e) => setTimeframe(e.target.value as '24h' | '7d' | '30d')}
                  className="text-sm border border-gray-300 rounded px-2 py-1"
                >
                  <option value="24h">24 Hours</option>
                  <option value="7d">7 Days</option>
                  <option value="30d">30 Days</option>
                </select>
              </div>

              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="inline-flex items-center space-x-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>
          </div>
        </div>

        {/* News Articles */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900">
              Latest News for {asset.toUpperCase()}
            </h2>
            <div className="flex items-center space-x-2 text-sm text-gray-500">
              <Clock className="h-4 w-4" />
              <span>
                Last updated: {assetNews.lastUpdated ? 
                  formatRelativeTime(assetNews.lastUpdated) : 'Unknown'}
              </span>
            </div>
          </div>

          {/* Article List */}
          {assetNews.articles.length > 0 ? (
            <div className="space-y-6">
              {assetNews.articles.map((article) => (
                <ArticleCard
                  key={article.id}
                  article={article}
                  onAssetClick={handleAssetClick}
                  showFullContent={false}
                />
              ))}

              {/* Load More Button */}
              {hasMore && (
                <div className="text-center pt-6">
                  <button
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                    className={`px-6 py-3 rounded-lg font-medium transition-colors ${
                      loadingMore
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        : 'bg-primary-600 text-white hover:bg-primary-700'
                    }`}
                  >
                    {loadingMore ? 'Loading...' : 'Load More Articles'}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="text-gray-400 text-6xl mb-4">📰</div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Articles Found</h3>
              <p className="text-gray-600">
                No recent news articles found for {asset.toUpperCase()}.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AssetDetail;
