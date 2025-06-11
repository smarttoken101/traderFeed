import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  BarChart3, 
  AlertCircle, 
  RefreshCw,
  Signal,
  Target,
  Calendar,
  ArrowUp,
  ArrowDown,
  Minus,
  FileText
} from 'lucide-react';
import ApiService from '../services/api';
import COTReportModal from '../components/COTReportModal';
import { formatNumber } from '../utils/helpers';

interface COTSummary {
  lastUpdated: string;
  totalInstruments: number;
  bullishSignals: number;
  bearishSignals: number;
  neutralSignals: number;
  topMoversBullish: Array<{ instrument: string; change: number }>;
  topMoversBearish: Array<{ instrument: string; change: number }>;
}

interface COTSignal {
  instrument: string;
  instrumentName: string;
  signal: 'buy' | 'sell' | 'hold';
  confidence: number;
  sentiment: 'bullish' | 'bearish' | 'neutral';
  percentile: number;
  weeklyChange: number;
  reasoning: string;
}

const COTDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<COTSummary | null>(null);
  const [signals, setSignals] = useState<COTSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'currencies' | 'commodities' | 'indices'>('all');
  const [showCOTReport, setShowCOTReport] = useState(false);

  useEffect(() => {
    fetchCOTData();
  }, []);

  const fetchCOTData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [summaryResponse, signalsResponse] = await Promise.all([
        ApiService.getCotSummary(),
        ApiService.getCotSignals()
      ]);

      setSummary(summaryResponse);
      setSignals(signalsResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load COT data');
      console.error('Failed to fetch COT data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      await ApiService.triggerCotUpdate();
      // Wait a moment then refresh data
      setTimeout(() => {
        fetchCOTData();
      }, 2000);
    } catch (err) {
      console.error('Failed to trigger COT update:', err);
    } finally {
      setRefreshing(false);
    }
  };

  const getSentimentIcon = (sentiment: string) => {
    switch (sentiment) {
      case 'bullish':
        return <TrendingUp className="h-4 w-4 text-success-600" />;
      case 'bearish':
        return <TrendingDown className="h-4 w-4 text-danger-600" />;
      default:
        return <Minus className="h-4 w-4 text-gray-500" />;
    }
  };

  const getSentimentColor = (sentiment: string) => {
    switch (sentiment) {
      case 'bullish':
        return 'text-success-600 bg-success-50 border-success-200';
      case 'bearish':
        return 'text-danger-600 bg-danger-50 border-danger-200';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getSignalIcon = (signal: string) => {
    switch (signal) {
      case 'buy':
        return <ArrowUp className="h-4 w-4 text-success-600" />;
      case 'sell':
        return <ArrowDown className="h-4 w-4 text-danger-600" />;
      default:
        return <Minus className="h-4 w-4 text-gray-500" />;
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 70) return 'text-success-600';
    if (confidence >= 50) return 'text-warning-600';
    return 'text-danger-600';
  };

  const handleInstrumentClick = (instrumentCode: string) => {
    navigate(`/cot/${instrumentCode}`);
  };

  const categorizeInstrument = (code: string): string => {
    const currencies = ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF', 'NZDUSD'];
    const commodities = ['GC', 'SI', 'CL', 'NG', 'HG', 'ZW', 'ZC', 'ZS', 'ZL', 'ZM'];
    const indices = ['ES', 'NQ', 'YM', 'VIX'];

    if (currencies.includes(code)) return 'currencies';
    if (commodities.includes(code)) return 'commodities';
    if (indices.includes(code)) return 'indices';
    return 'other';
  };

  const filteredSignals = signals.filter(signal => {
    if (selectedCategory === 'all') return true;
    return categorizeInstrument(signal.instrument) === selectedCategory;
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading COT data...</p>
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
            <p className="text-gray-900 font-semibold mb-2">Error loading COT data</p>
            <p className="text-gray-600 mb-4">{error}</p>
            <button
              onClick={fetchCOTData}
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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">COT Dashboard</h1>
            <p className="text-gray-600">Commitment of Traders Analysis & Signals</p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center space-x-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Refresh Data</span>
          </button>
        </div>

        {/* Summary Cards */}
        {summary && (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
            <div className="card">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Instruments</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {summary.totalInstruments}
                  </p>
                </div>
                <BarChart3 className="h-8 w-8 text-primary-600" />
              </div>
            </div>

            <div className="card">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Bullish Signals</p>
                  <p className="text-2xl font-bold text-success-600">
                    {summary.bullishSignals}
                  </p>
                </div>
                <TrendingUp className="h-8 w-8 text-success-600" />
              </div>
            </div>

            <div className="card">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Bearish Signals</p>
                  <p className="text-2xl font-bold text-danger-600">
                    {summary.bearishSignals}
                  </p>
                </div>
                <TrendingDown className="h-8 w-8 text-danger-600" />
              </div>
            </div>

            <div className="card">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Neutral Signals</p>
                  <p className="text-2xl font-bold text-gray-600">
                    {summary.neutralSignals}
                  </p>
                </div>
                <Activity className="h-8 w-8 text-gray-600" />
              </div>
            </div>

            <div className="card">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Last Updated</p>
                  <p className="text-sm font-semibold text-gray-900">
                    {new Date(summary.lastUpdated).toLocaleDateString()}
                  </p>
                </div>
                <Calendar className="h-8 w-8 text-gray-600" />
              </div>
            </div>
          </div>
        )}

        {/* Top Movers */}
        {summary && (summary.topMoversBullish.length > 0 || summary.topMoversBearish.length > 0) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {summary.topMoversBullish.length > 0 && (
              <div className="card">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                  <TrendingUp className="h-5 w-5 text-success-600 mr-2" />
                  Top Bullish Movers
                </h3>
                <div className="space-y-3">
                  {summary.topMoversBullish.slice(0, 5).map((mover) => (
                    <div key={mover.instrument} className="flex items-center justify-between p-2 bg-success-50 rounded-lg">
                      <span className="font-medium text-gray-900">{mover.instrument}</span>
                      <span className="text-success-600 font-semibold">+{formatNumber(mover.change)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {summary.topMoversBearish.length > 0 && (
              <div className="card">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                  <TrendingDown className="h-5 w-5 text-danger-600 mr-2" />
                  Top Bearish Movers
                </h3>
                <div className="space-y-3">
                  {summary.topMoversBearish.slice(0, 5).map((mover) => (
                    <div key={mover.instrument} className="flex items-center justify-between p-2 bg-danger-50 rounded-lg">
                      <span className="font-medium text-gray-900">{mover.instrument}</span>
                      <span className="text-danger-600 font-semibold">-{formatNumber(mover.change)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* COT Report Button */}
        {summary && (
          <div className="mb-8">
            <button
              onClick={() => setShowCOTReport(true)}
              className="btn-primary flex items-center space-x-2"
            >
              <FileText className="h-4 w-4" />
              <span>Generate COT Report</span>
            </button>
          </div>
        )}

        {/* Category Filter */}
        <div className="flex items-center space-x-4 mb-6">
          <span className="text-sm font-medium text-gray-700">Filter by category:</span>
          {[
            { key: 'all', label: 'All Instruments' },
            { key: 'currencies', label: 'Currencies' },
            { key: 'commodities', label: 'Commodities' },
            { key: 'indices', label: 'Indices' }
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setSelectedCategory(key as any)}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                selectedCategory === key
                  ? 'bg-primary-100 text-primary-700 border border-primary-200'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* COT Signals Table */}
        <div className="card">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-900 flex items-center">
              <Signal className="h-5 w-5 text-primary-600 mr-2" />
              COT Signals ({filteredSignals.length})
            </h2>
            <p className="text-sm text-gray-600">Click on any row to view detailed analysis</p>
          </div>

          {filteredSignals.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 font-semibold text-gray-900">Instrument</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-900">Sentiment</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-900">Signal</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-900">Confidence</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-900">Percentile</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-900">Weekly Change</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-900">Analysis</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSignals.map((signal) => (
                    <tr 
                      key={signal.instrument} 
                      className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => handleInstrumentClick(signal.instrument)}
                    >
                      <td className="py-3 px-4">
                        <div>
                          <div className="font-semibold text-gray-900">{signal.instrument}</div>
                          <div className="text-sm text-gray-600">{signal.instrumentName}</div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${getSentimentColor(signal.sentiment)}`}>
                          {getSentimentIcon(signal.sentiment)}
                          <span className="ml-1 capitalize">{signal.sentiment}</span>
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center">
                          {getSignalIcon(signal.signal)}
                          <span className="ml-1 font-medium capitalize">{signal.signal}</span>
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`font-semibold ${getConfidenceColor(signal.confidence)}`}>
                          {signal.confidence}%
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-medium text-gray-900">
                          {signal.percentile.toFixed(1)}%
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={signal.weeklyChange >= 0 ? 'text-success-600' : 'text-danger-600'}>
                          {signal.weeklyChange >= 0 ? '+' : ''}{formatNumber(signal.weeklyChange)}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-sm text-gray-600 max-w-xs truncate">
                          {signal.reasoning}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12">
              <Target className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No COT signals available</h3>
              <p className="text-gray-600">
                {selectedCategory !== 'all' 
                  ? `No signals found for ${selectedCategory} category.`
                  : 'Check back later for updated COT analysis.'
                }
              </p>
            </div>
          )}
        </div>
      </div>

      {/* COT Report Modal */}
      <COTReportModal
        isOpen={showCOTReport}
        onClose={() => setShowCOTReport(false)}
      />
    </div>
  );
};

export default COTDashboard;
