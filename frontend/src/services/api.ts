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
  description?: string;
  content?: string;
  link: string;
  publishedAt: string;
  markets: string[];
  instruments?: string[];
  sentimentScore?: number;
  sentimentLabel?: 'positive' | 'negative' | 'neutral';
  createdAt: string;
  feedId: string;
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
  sentimentBreakdown?: {
    positive: number;
    negative: number;
    neutral: number;
  };
  topAssets: {
    asset: string;
    mentions: number;
    sentiment: {
      positive: number;
      negative: number;
      neutral: number;
    };
  }[];
  topCategories?: {
    category: string;
    mentions: number;
  }[];
  lastUpdated: string;
}

interface TrendingAsset {
  rank: number;
  asset: string;
  mentions: number;
  sentiment: {
    positive: number;
    negative: number;
    neutral: number;
  };
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
        currentPage: number;
        pageSize: number;
        totalItems: number;
        totalPages: number;
        hasNextPage: boolean;
        hasPreviousPage: boolean;
        totalCount: number;
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

  async getSentimentReport(timeframe: '24h' | '7d' | '30d' = '24h') {
    return this.request<{
      report: string;
      timeframe: string;
      generatedAt: string;
    }>(`/articles/sentiment-report?timeframe=${timeframe}`);
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
      activeJobs: number;
      nextRuns: any[];
      lastProcessed?: string;
      articlesProcessed?: number;
      feedsActive?: number;
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

  // COT (Commitment of Traders) endpoints
  async getCotSummary() {
    return this.request<{
      lastUpdated: string;
      totalInstruments: number;
      bullishSignals: number;
      bearishSignals: number;
      neutralSignals: number;
      topMoversBullish: Array<{ instrument: string; change: number }>;
      topMoversBearish: Array<{ instrument: string; change: number }>;
    }>('/cot/summary');
  }

  async getCotSignals() {
    return this.request<Array<{
      instrument: string;
      instrumentName: string;
      signal: 'buy' | 'sell' | 'hold';
      confidence: number;
      sentiment: 'bullish' | 'bearish' | 'neutral';
      percentile: number;
      weeklyChange: number;
      reasoning: string;
    }>>('/cot/signals');
  }

  async getCotData(instrument: string, limit: number = 52) {
    return this.request<{
      instrument: string;
      data: Array<{
        reportDate: string;
        commercialLong: number;
        commercialShort: number;
        commercialNet: number;
        noncommercialLong: number;
        noncommercialShort: number;
        noncommercialNet: number;
        managedMoneyLong?: number;
        managedMoneyShort?: number;
      }>;
    }>(`/cot/${instrument}?limit=${limit}`);
  }

  async analyzeCotPositioning(instrument: string, lookbackWeeks: number = 52) {
    return this.request<{
      instrument: string;
      analysis: {
        instrumentCode: string;
        instrumentName: string;
        currentPositioning: {
          commercialNet: number;
          noncommercialNet: number;
          managedMoneyNet?: number;
        };
        historicalPercentile: number;
        weeklyChange: number;
        sentiment: 'bullish' | 'bearish' | 'neutral';
        signal: 'buy' | 'sell' | 'hold';
        confidence: number;
        analysis: string;
      };
    }>(`/cot/analyze/${instrument}`, {
      method: 'POST',
      body: JSON.stringify({ lookbackWeeks }),
    });
  }

  async triggerCotUpdate() {
    return this.request('/cot/update', {
      method: 'POST',
    });
  }

  async getCotReport(timeframe: '1w' | '4w' | '12w' = '4w') {
    return this.request<{
      report: string;
      timeframe: string;
      generatedAt: string;
      summary: {
        totalInstruments: number;
        bullishSignals: number;
        bearishSignals: number;
        neutralSignals: number;
      };
    }>(`/cot/report?timeframe=${timeframe}`);
  }
}

export default new ApiService();
export type { Article, AssetNews, AssetStatistics, TrendingAsset, TrendingData };