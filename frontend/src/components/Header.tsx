import React, { useState, useEffect } from 'react';
import { Search, Bell, Activity, TrendingUp, RefreshCw, Brain, Home } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import ApiService from '../services/api';
import { formatRelativeTime } from '../utils/helpers';

interface HeaderProps {
  onSearch: (query: string) => void;
  searchQuery: string;
}

const Header: React.FC<HeaderProps> = ({ onSearch, searchQuery }) => {
  const location = useLocation();
  const [monitorStatus, setMonitorStatus] = useState<{
    isRunning: boolean;
    activeJobs: number;
    nextRuns: any[];
    lastProcessed?: string;
    articlesProcessed?: number;
    feedsActive?: number;
  } | null>(null);
  const [totalArticles, setTotalArticles] = useState<number>(0);
  const [activeFeeds, setActiveFeeds] = useState<number>(0);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    fetchMonitorStatus();
    fetchStatistics();
    // Refresh status every 30 seconds
    const interval = setInterval(() => {
      fetchMonitorStatus();
      fetchStatistics();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchMonitorStatus = async () => {
    try {
      const status = await ApiService.getMonitorStatus();
      setMonitorStatus(status);
    } catch (error) {
      console.error('Failed to fetch monitor status:', error);
    }
  };

  const fetchStatistics = async () => {
    try {
      const [articlesData, feedsData] = await Promise.all([
        ApiService.getArticles({ limit: 1 }),
        ApiService.getAssets()
      ]);
      
      // Set total articles from pagination
      if (articlesData.pagination) {
        setTotalArticles(articlesData.pagination.totalItems || 0);
      }
      
      // Count active feeds (this is a rough estimate based on asset categories)
      const feedCount = feedsData.categories?.reduce((sum, cat) => sum + cat.assets.length, 0) || 0;
      setActiveFeeds(Math.min(feedCount, 50)); // Cap at reasonable number
    } catch (error) {
      console.error('Failed to fetch statistics:', error);
    }
  };

  const handleTriggerProcessing = async () => {
    setIsProcessing(true);
    try {
      await ApiService.triggerRssProcessing();
      // Refresh status after processing
      setTimeout(fetchMonitorStatus, 2000);
    } catch (error) {
      console.error('Failed to trigger RSS processing:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onSearch(e.target.value);
  };

  return (
    <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo and Title */}
          <div className="flex items-center space-x-6">
            <Link to="/" className="flex items-center space-x-2">
              <TrendingUp className="h-8 w-8 text-primary-600" />
              <h1 className="text-2xl font-bold text-gray-900">TradeFeed</h1>
            </Link>
            
            {/* Navigation */}
            <nav className="hidden md:flex items-center space-x-6">
              <Link 
                to="/" 
                className={`flex items-center space-x-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  location.pathname === '/' 
                    ? 'bg-blue-100 text-blue-700' 
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                <Home className="h-4 w-4" />
                <span>Dashboard</span>
              </Link>
              
              <Link 
                to="/knowledge" 
                className={`flex items-center space-x-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  location.pathname === '/knowledge' 
                    ? 'bg-blue-100 text-blue-700' 
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                <Brain className="h-4 w-4" />
                <span>Knowledge Base</span>
              </Link>
            </nav>
            
            {/* Status Indicator */}
            {monitorStatus && (
              <div className="hidden md:flex items-center space-x-2 text-sm">
                <div className={`flex items-center space-x-1 ${
                  monitorStatus.isRunning ? 'text-success-600' : 'text-gray-500'
                }`}>
                  <Activity className={`h-4 w-4 ${
                    monitorStatus.isRunning ? 'animate-pulse' : ''
                  }`} />
                  <span>{monitorStatus.isRunning ? 'Live' : 'Idle'}</span>
                </div>
                <span className="text-gray-300">•</span>
                <span className="text-gray-600">
                  {totalArticles ? totalArticles.toLocaleString() : monitorStatus.articlesProcessed?.toLocaleString() || '0'} articles
                </span>
                <span className="text-gray-300">•</span>
                <span className="text-gray-600">
                  {activeFeeds ? activeFeeds : monitorStatus.feedsActive || monitorStatus.activeJobs || '0'} feeds
                </span>
              </div>
            )}
          </div>

          {/* Search Bar */}
          <div className="flex-1 max-w-lg mx-8">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={handleSearchChange}
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                placeholder="Search news by asset, keyword, or topic..."
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center space-x-4">
            {/* Manual Refresh Button */}
            <button
              onClick={handleTriggerProcessing}
              disabled={isProcessing}
              className={`p-2 rounded-lg transition-colors ${
                isProcessing 
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                  : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
              }`}
              title="Manually trigger RSS processing"
            >
              <RefreshCw className={`h-5 w-5 ${isProcessing ? 'animate-spin' : ''}`} />
            </button>

            {/* Notifications */}
            <button className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors">
              <Bell className="h-5 w-5" />
            </button>

            {/* Last Update Info */}
            {monitorStatus?.lastProcessed && (
              <div className="hidden lg:block text-sm text-gray-500">
                Last update: {formatRelativeTime(monitorStatus.lastProcessed)}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
