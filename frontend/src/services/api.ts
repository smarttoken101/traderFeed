const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

interface Article {
  id: string;
  title: string;
  content: string;
  url: string;
  source: string;
  publishedAt: string;
  markets: string[];
  instruments: string[];
  sentimentScore: number;
  sentimentLabel: 'positive' | 'negative' | 'neutral';
  createdAt: string;
  feed?: {
    name: string;
    category: string;
  };
}

interface AssetNews {
  asset: string;
  articles: Article[];
  count: number;
  hasMore: boolean;
}

interface AssetStatistics {
  timeframe: string;
  totalArticles: number;
  sentimentBreakdown: {
    positive: number;
    negative: number;
    neutral: number;
  };
  topAssets: {
    asset: string;
    mentions: number;
    sentiment: number;
  }[];
  lastUpdated: string;
}

interface TrendingAsset {
  rank: number;
  asset: string;
  mentions: number;
  sentiment: number;
  change: number;
}

interface TrendingData {
  timeframe: string;
  trending: TrendingAsset[];
  lastUpdated: string;
}

class ApiService {
  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        ...options,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: ApiResponse<T> = await response.json();
      
      if (!data.success) {
        throw new Error(data.message || data.error || 'API request failed');
      }

      return data.data as T;
    } catch (error) {
      console.error('API request failed:', error);
      throw error;
    }
  }

  // Asset-related endpoints
  async getAssets() {
    return this.request<{
      categories: { category: string; assets: string[] }[];
      totalAssets: number;
    }>('/assets');
  }

  async getAssetNews(asset: string, params: {
    limit?: number;
    offset?: number;
    dateFrom?: string;
    dateTo?: string;
  } = {}) {
    const queryParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value) queryParams.append(key, value.toString());
    });
    
    const queryString = queryParams.toString();
    return this.request<AssetNews>(`/assets/${asset}/news${queryString ? `?${queryString}` : ''}`);
  }

  async getAssetStatistics(timeframe: '24h' | '7d' | '30d' = '24h') {
    return this.request<AssetStatistics>(`/assets/statistics?timeframe=${timeframe}`);
  }

  async getTrendingAssets(timeframe: '24h' | '7d' | '30d' = '24h') {
    return this.request<TrendingData>(`/assets/trending?timeframe=${timeframe}`);
  }

  async getCategoryNews(category: string, params: {
    limit?: number;
    offset?: number;
    dateFrom?: string;
    dateTo?: string;
  } = {}) {
    const queryParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value) queryParams.append(key, value.toString());
    });
    
    const queryString = queryParams.toString();
    return this.request<{
      category: string;
      articles: Article[];
      count: number;
      hasMore: boolean;
    }>(`/assets/categories/${category}/news${queryString ? `?${queryString}` : ''}`);
  }

  // Articles endpoints
  async getArticles(params: {
    page?: number;
    limit?: number;
    category?: string;
    sentiment?: string;
    instruments?: string[];
  } = {}) {
    const queryParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value) {
        if (Array.isArray(value)) {
          queryParams.append(key, value.join(','));
        } else {
          queryParams.append(key, value.toString());
        }
      }
    });

    const queryString = queryParams.toString();
    return this.request<{
      articles: Article[];
      pagination: {
        page: number;
        limit: number;
        total: number;
      };
    }>(`/articles${queryString ? `?${queryString}` : ''}`);
  }

  async getSentimentStats() {
    return this.request<{
      sentiment: string;
      count: number;
      averageScore: number;
    }[]>('/articles/sentiment-stats');
  }

  // Manual operations
  async triggerRssProcessing() {
    return this.request('/assets/process', {
      method: 'POST',
    });
  }

  async getMonitorStatus() {
    return this.request<{
      isRunning: boolean;
      lastProcessed: string;
      articlesProcessed: number;
      feedsActive: number;
    }>('/assets/monitor/status');
  }

  async startMonitoring() {
    return this.request('/assets/monitor/start', {
      method: 'POST',
    });
  }

  async stopMonitoring() {
    return this.request('/assets/monitor/stop', {
      method: 'POST',
    });
  }
}

export default new ApiService();
export type { Article, AssetNews, AssetStatistics, TrendingAsset, TrendingData };