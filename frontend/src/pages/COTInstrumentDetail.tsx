import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  TrendingUp, 
  TrendingDown, 
  BarChart3, 
  AlertCircle, 
  RefreshCw,
  Calendar,
  Target,
  Activity,
  Minus,
  LineChart
} from 'lucide-react';
import ApiService from '../services/api';
import { formatNumber } from '../utils/helpers';

interface COTData {
  reportDate: string;
  commercialLong: number;
  commercialShort: number;
  commercialNet: number;
  noncommercialLong: number;
  noncommercialShort: number;
  noncommercialNet: number;
  managedMoneyLong?: number;
  managedMoneyShort?: number;
}

interface COTAnalysis {
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
}

const COTInstrumentDetail: React.FC = () => {
  const { instrument } = useParams<{ instrument: string }>();
  const navigate = useNavigate();
  const [cotData, setCotData] = useState<COTData[]>([]);
  const [analysis, setAnalysis] = useState<COTAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lookbackWeeks, setLookbackWeeks] = useState(52);

  useEffect(() => {
    if (instrument) {
      fetchCOTData();
    }
  }, [instrument, lookbackWeeks]);

  const fetchCOTData = async () => {
    if (!instrument) return;

    try {
      setLoading(true);
      setError(null);

      const [dataResponse, analysisResponse] = await Promise.all([
        ApiService.getCotData(instrument, lookbackWeeks),
        ApiService.analyzeCotPositioning(instrument, lookbackWeeks)
      ]);

      setCotData(dataResponse.data);
      setAnalysis(analysisResponse.analysis);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load COT data');
      console.error('Failed to fetch COT data:', err);
    } finally {
      setLoading(false);
    }
  };

  const getSentimentIcon = (sentiment: string) => {
    switch (sentiment) {
      case 'bullish':
        return <TrendingUp className="h-5 w-5 text-success-600" />;
      case 'bearish':
        return <TrendingDown className="h-5 w-5 text-danger-600" />;
      default:
        return <Minus className="h-5 w-5 text-gray-500" />;
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

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 70) return 'text-success-600';
    if (confidence >= 50) return 'text-warning-600';
    return 'text-danger-600';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading COT data for {instrument?.toUpperCase()}...</p>
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
            <div className="space-x-4">
              <button
                onClick={fetchCOTData}
                className="btn-primary"
              >
                Try Again
              </button>
              <button
                onClick={() => navigate('/cot')}
                className="btn-secondary"
              >
                Back to COT Dashboard
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!analysis || cotData.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <BarChart3 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-900 font-semibold mb-2">No COT data available</p>
            <p className="text-gray-600 mb-4">No data found for {instrument?.toUpperCase()}</p>
            <button
              onClick={() => navigate('/cot')}
              className="btn-primary"
            >
              Back to COT Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  const latestData = cotData[0];
  const getInstrumentCategory = (code: string) => {
    const currencies = ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF', 'NZDUSD'];
    const commodities = ['GC', 'SI', 'CL', 'NG', 'HG', 'ZW', 'ZC', 'ZS', 'ZL', 'ZM'];
    const indices = ['ES', 'NQ', 'YM', 'VIX'];

    if (currencies.includes(code)) return { category: 'Currency', icon: '💱' };
    if (commodities.includes(code)) return { category: 'Commodity', icon: '📊' };
    if (indices.includes(code)) return { category: 'Index', icon: '📈' };
    return { category: 'Other', icon: '💼' };
  };

  const instrumentInfo = getInstrumentCategory(analysis.instrumentCode);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back Button */}
        <button
          onClick={() => navigate('/cot')}
          className="inline-flex items-center space-x-2 text-gray-600 hover:text-gray-900 mb-6 transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
          <span>Back to COT Dashboard</span>
        </button>

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-4">
            <div className="text-4xl">{instrumentInfo.icon}</div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                {analysis.instrumentCode} - {analysis.instrumentName}
              </h1>
              <p className="text-lg text-gray-600">{instrumentInfo.category} • COT Analysis</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            {/* Lookback Period Selector */}
            <div className="flex items-center space-x-2">
              <span className="text-sm font-medium text-gray-700">Period:</span>
              <select
                value={lookbackWeeks}
                onChange={(e) => setLookbackWeeks(parseInt(e.target.value))}
                className="text-sm border border-gray-300 rounded px-2 py-1"
              >
                <option value={26}>26 weeks</option>
                <option value={52}>52 weeks</option>
                <option value={104}>2 years</option>
                <option value={156}>3 years</option>
              </select>
            </div>
            
            <button
              onClick={fetchCOTData}
              className="inline-flex items-center space-x-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Analysis Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Current Sentiment</p>
                <div className="flex items-center space-x-2 mt-1">
                  {getSentimentIcon(analysis.sentiment)}
                  <span className="text-lg font-bold capitalize">{analysis.sentiment}</span>
                </div>
              </div>
              <div className={`p-2 rounded-full border ${getSentimentColor(analysis.sentiment)}`}>
                {getSentimentIcon(analysis.sentiment)}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Trading Signal</p>
                <p className="text-lg font-bold text-gray-900 capitalize">{analysis.signal}</p>
              </div>
              <Target className="h-8 w-8 text-primary-600" />
            </div>
          </div>

          <div className="card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Confidence</p>
                <p className={`text-lg font-bold ${getConfidenceColor(analysis.confidence)}`}>
                  {analysis.confidence}%
                </p>
              </div>
              <Activity className="h-8 w-8 text-gray-600" />
            </div>
          </div>

          <div className="card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Historical Percentile</p>
                <p className="text-lg font-bold text-gray-900">
                  {analysis.historicalPercentile.toFixed(1)}%
                </p>
              </div>
              <BarChart3 className="h-8 w-8 text-primary-600" />
            </div>
          </div>
        </div>

        {/* Positioning Details */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* Current Positioning */}
          <div className="card">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Current Positioning</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <span className="font-medium text-gray-700">Commercial Net</span>
                <span className={`font-bold ${
                  analysis.currentPositioning.commercialNet >= 0 ? 'text-success-600' : 'text-danger-600'
                }`}>
                  {analysis.currentPositioning.commercialNet >= 0 ? '+' : ''}
                  {formatNumber(analysis.currentPositioning.commercialNet)}
                </span>
              </div>
              
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <span className="font-medium text-gray-700">Non-Commercial Net</span>
                <span className={`font-bold ${
                  analysis.currentPositioning.noncommercialNet >= 0 ? 'text-success-600' : 'text-danger-600'
                }`}>
                  {analysis.currentPositioning.noncommercialNet >= 0 ? '+' : ''}
                  {formatNumber(analysis.currentPositioning.noncommercialNet)}
                </span>
              </div>
              
              {analysis.currentPositioning.managedMoneyNet !== undefined && (
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <span className="font-medium text-gray-700">Managed Money Net</span>
                  <span className={`font-bold ${
                    analysis.currentPositioning.managedMoneyNet >= 0 ? 'text-success-600' : 'text-danger-600'
                  }`}>
                    {analysis.currentPositioning.managedMoneyNet >= 0 ? '+' : ''}
                    {formatNumber(analysis.currentPositioning.managedMoneyNet)}
                  </span>
                </div>
              )}
              
              <div className="flex items-center justify-between p-3 bg-primary-50 rounded-lg border border-primary-200">
                <span className="font-medium text-primary-700">Weekly Change</span>
                <span className={`font-bold ${
                  analysis.weeklyChange >= 0 ? 'text-success-600' : 'text-danger-600'
                }`}>
                  {analysis.weeklyChange >= 0 ? '+' : ''}
                  {formatNumber(analysis.weeklyChange)}
                </span>
              </div>
            </div>
          </div>

          {/* Latest Report Details */}
          <div className="card">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Latest Report Details</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <span className="font-medium text-gray-700">Report Date</span>
                <span className="font-bold text-gray-900">
                  {new Date(latestData.reportDate).toLocaleDateString()}
                </span>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-success-50 rounded-lg">
                  <div className="text-xs font-medium text-success-700 mb-1">Commercial Long</div>
                  <div className="font-bold text-success-900">
                    {formatNumber(latestData.commercialLong)}
                  </div>
                </div>
                <div className="p-3 bg-danger-50 rounded-lg">
                  <div className="text-xs font-medium text-danger-700 mb-1">Commercial Short</div>
                  <div className="font-bold text-danger-900">
                    {formatNumber(latestData.commercialShort)}
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-success-50 rounded-lg">
                  <div className="text-xs font-medium text-success-700 mb-1">Non-Commercial Long</div>
                  <div className="font-bold text-success-900">
                    {formatNumber(latestData.noncommercialLong)}
                  </div>
                </div>
                <div className="p-3 bg-danger-50 rounded-lg">
                  <div className="text-xs font-medium text-danger-700 mb-1">Non-Commercial Short</div>
                  <div className="font-bold text-danger-900">
                    {formatNumber(latestData.noncommercialShort)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* AI Analysis */}
        <div className="card mb-8">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <LineChart className="h-5 w-5 text-primary-600 mr-2" />
            AI Analysis
          </h3>
          <div className="prose max-w-none">
            <p className="text-gray-700 leading-relaxed whitespace-pre-line">
              {analysis.analysis}
            </p>
          </div>
        </div>

        {/* Historical Data Table */}
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <Calendar className="h-5 w-5 text-primary-600 mr-2" />
            Historical Data ({cotData.length} weeks)
          </h3>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 font-semibold text-gray-900">Report Date</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-900">Commercial Net</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-900">Non-Commercial Net</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-900">Commercial Long</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-900">Commercial Short</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-900">Non-Com Long</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-900">Non-Com Short</th>
                </tr>
              </thead>
              <tbody>
                {cotData.slice(0, 20).map((data, index) => (
                  <tr key={data.reportDate} className={`border-b border-gray-100 ${index === 0 ? 'bg-primary-50' : 'hover:bg-gray-50'}`}>
                    <td className="py-3 px-4 font-medium text-gray-900">
                      {new Date(data.reportDate).toLocaleDateString()}
                      {index === 0 && <span className="ml-2 text-xs bg-primary-100 text-primary-800 px-2 py-1 rounded">Latest</span>}
                    </td>
                    <td className={`py-3 px-4 text-right font-medium ${
                      data.commercialNet >= 0 ? 'text-success-600' : 'text-danger-600'
                    }`}>
                      {data.commercialNet >= 0 ? '+' : ''}{formatNumber(data.commercialNet)}
                    </td>
                    <td className={`py-3 px-4 text-right font-medium ${
                      data.noncommercialNet >= 0 ? 'text-success-600' : 'text-danger-600'
                    }`}>
                      {data.noncommercialNet >= 0 ? '+' : ''}{formatNumber(data.noncommercialNet)}
                    </td>
                    <td className="py-3 px-4 text-right text-gray-900">
                      {formatNumber(data.commercialLong)}
                    </td>
                    <td className="py-3 px-4 text-right text-gray-900">
                      {formatNumber(data.commercialShort)}
                    </td>
                    <td className="py-3 px-4 text-right text-gray-900">
                      {formatNumber(data.noncommercialLong)}
                    </td>
                    <td className="py-3 px-4 text-right text-gray-900">
                      {formatNumber(data.noncommercialShort)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {cotData.length > 20 && (
            <div className="mt-4 text-center">
              <p className="text-sm text-gray-600">
                Showing latest 20 of {cotData.length} weeks. 
                <button 
                  onClick={() => setLookbackWeeks(Math.min(lookbackWeeks + 26, 156))}
                  className="ml-2 text-primary-600 hover:text-primary-800 font-medium"
                >
                  Load more data
                </button>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default COTInstrumentDetail;
