import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  BarChart3, 
  TrendingUp, 
  TrendingDown, 
  Activity,
  ExternalLink,
  AlertCircle,
  RefreshCw
} from 'lucide-react';
import ApiService from '../services/api';

interface COTSummary {
  lastUpdated: string;
  totalInstruments: number;
  bullishSignals: number;
  bearishSignals: number;
  neutralSignals: number;
  topMoversBullish: Array<{ instrument: string; change: number }>;
  topMoversBearish: Array<{ instrument: string; change: number }>;
}

const COTWidget: React.FC = () => {
  const [summary, setSummary] = useState<COTSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCOTSummary();
  }, []);

  const fetchCOTSummary = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await ApiService.getCotSummary();
      setSummary(data);
    } catch (err) {
      setError('Failed to load COT data');
      console.error('Failed to fetch COT summary:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center">
            <BarChart3 className="h-5 w-5 text-primary-600 mr-2" />
            COT Analysis
          </h3>
        </div>
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center">
            <BarChart3 className="h-5 w-5 text-primary-600 mr-2" />
            COT Analysis
          </h3>
          <button
            onClick={fetchCOTSummary}
            className="p-1 hover:bg-gray-100 rounded transition-colors"
            title="Refresh COT data"
          >
            <RefreshCw className="h-4 w-4 text-gray-500" />
          </button>
        </div>
        <div className="flex items-center justify-center py-8">
          <div className="text-center">
            <AlertCircle className="h-8 w-8 text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-600">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  const bullishPercentage = (summary.bullishSignals / summary.totalInstruments) * 100;
  const bearishPercentage = (summary.bearishSignals / summary.totalInstruments) * 100;

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center">
          <BarChart3 className="h-5 w-5 text-primary-600 mr-2" />
          COT Analysis
        </h3>
        <Link 
          to="/cot"
          className="flex items-center space-x-1 text-sm text-primary-600 hover:text-primary-800 font-medium"
        >
          <span>View All</span>
          <ExternalLink className="h-3 w-3" />
        </Link>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="text-center p-3 bg-success-50 rounded-lg">
          <div className="flex items-center justify-center mb-1">
            <TrendingUp className="h-4 w-4 text-success-600" />
          </div>
          <div className="text-xl font-bold text-success-600">{summary.bullishSignals}</div>
          <div className="text-xs text-success-700">Bullish</div>
          <div className="text-xs text-success-600">{bullishPercentage.toFixed(0)}%</div>
        </div>

        <div className="text-center p-3 bg-danger-50 rounded-lg">
          <div className="flex items-center justify-center mb-1">
            <TrendingDown className="h-4 w-4 text-danger-600" />
          </div>
          <div className="text-xl font-bold text-danger-600">{summary.bearishSignals}</div>
          <div className="text-xs text-danger-700">Bearish</div>
          <div className="text-xs text-danger-600">{bearishPercentage.toFixed(0)}%</div>
        </div>

        <div className="text-center p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center justify-center mb-1">
            <Activity className="h-4 w-4 text-gray-600" />
          </div>
          <div className="text-xl font-bold text-gray-600">{summary.neutralSignals}</div>
          <div className="text-xs text-gray-700">Neutral</div>
          <div className="text-xs text-gray-600">{((summary.neutralSignals / summary.totalInstruments) * 100).toFixed(0)}%</div>
        </div>
      </div>

      {/* Market Sentiment */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">Market Sentiment</span>
          <span className="text-xs text-gray-500">
            {summary.totalInstruments} instruments
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div className="flex h-2 rounded-full overflow-hidden">
            <div 
              className="bg-success-500" 
              style={{ width: `${bullishPercentage}%` }}
            ></div>
            <div 
              className="bg-danger-500" 
              style={{ width: `${bearishPercentage}%` }}
            ></div>
            <div 
              className="bg-gray-400" 
              style={{ width: `${((summary.neutralSignals / summary.totalInstruments) * 100)}%` }}
            ></div>
          </div>
        </div>
      </div>

      {/* Top Movers */}
      {(summary.topMoversBullish.length > 0 || summary.topMoversBearish.length > 0) && (
        <div className="space-y-3">
          {summary.topMoversBullish.length > 0 && (
            <div>
              <div className="flex items-center space-x-1 mb-2">
                <TrendingUp className="h-3 w-3 text-success-600" />
                <span className="text-xs font-medium text-success-700">Top Bullish</span>
              </div>
              <div className="space-y-1">
                {summary.topMoversBullish.slice(0, 2).map((mover) => (
                  <Link
                    key={mover.instrument}
                    to={`/cot/${mover.instrument}`}
                    className="flex items-center justify-between p-2 bg-success-50 rounded text-xs hover:bg-success-100 transition-colors"
                  >
                    <span className="font-medium text-success-900">{mover.instrument}</span>
                    <span className="text-success-600">+{mover.change.toLocaleString()}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {summary.topMoversBearish.length > 0 && (
            <div>
              <div className="flex items-center space-x-1 mb-2">
                <TrendingDown className="h-3 w-3 text-danger-600" />
                <span className="text-xs font-medium text-danger-700">Top Bearish</span>
              </div>
              <div className="space-y-1">
                {summary.topMoversBearish.slice(0, 2).map((mover) => (
                  <Link
                    key={mover.instrument}
                    to={`/cot/${mover.instrument}`}
                    className="flex items-center justify-between p-2 bg-danger-50 rounded text-xs hover:bg-danger-100 transition-colors"
                  >
                    <span className="font-medium text-danger-900">{mover.instrument}</span>
                    <span className="text-danger-600">-{mover.change.toLocaleString()}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Last Updated */}
      <div className="mt-4 pt-3 border-t border-gray-200">
        <p className="text-xs text-gray-500 text-center">
          Updated: {new Date(summary.lastUpdated).toLocaleString()}
        </p>
      </div>
    </div>
  );
};

export default COTWidget;
