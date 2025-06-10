import React from 'react';
import { Search, Filter, Calendar, TrendingUp } from 'lucide-react';

interface SearchAndFiltersProps {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  selectedAsset: string;
  setSelectedAsset: (asset: string) => void;
  selectedSentiment: string;
  setSelectedSentiment: (sentiment: string) => void;
  timeframe: string;
  setTimeframe: (timeframe: string) => void;
  assets: string[];
}

const SearchAndFilters: React.FC<SearchAndFiltersProps> = ({
  searchTerm,
  setSearchTerm,
  selectedAsset,
  setSelectedAsset,
  selectedSentiment,
  setSelectedSentiment,
  timeframe,
  setTimeframe,
  assets,
}) => {
  const sentiments = ['all', 'positive', 'negative', 'neutral'];
  const timeframes = [
    { value: '1h', label: '1 Hour' },
    { value: '6h', label: '6 Hours' },
    { value: '12h', label: '12 Hours' },
    { value: '24h', label: '24 Hours' },
    { value: '7d', label: '7 Days' },
    { value: '30d', label: '30 Days' },
  ];

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8">
      <div className="flex flex-wrap gap-4">
        {/* Search */}
        <div className="flex-1 min-w-[250px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search news articles..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-field pl-10"
            />
          </div>
        </div>

        {/* Asset Filter */}
        <div className="min-w-[180px]">
          <div className="relative">
            <TrendingUp className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <select
              value={selectedAsset}
              onChange={(e) => setSelectedAsset(e.target.value)}
              className="input-field pl-10 appearance-none bg-white cursor-pointer"
            >
              <option value="">All Assets</option>
              {assets.map((asset) => (
                <option key={asset} value={asset}>
                  {asset}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Sentiment Filter */}
        <div className="min-w-[140px]">
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <select
              value={selectedSentiment}
              onChange={(e) => setSelectedSentiment(e.target.value)}
              className="input-field pl-10 appearance-none bg-white cursor-pointer"
            >
              {sentiments.map((sentiment) => (
                <option key={sentiment} value={sentiment}>
                  {sentiment.charAt(0).toUpperCase() + sentiment.slice(1)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Timeframe Filter */}
        <div className="min-w-[140px]">
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <select
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value)}
              className="input-field pl-10 appearance-none bg-white cursor-pointer"
            >
              {timeframes.map((tf) => (
                <option key={tf.value} value={tf.value}>
                  {tf.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Clear Filters Button */}
        <button
          onClick={() => {
            setSearchTerm('');
            setSelectedAsset('');
            setSelectedSentiment('all');
            setTimeframe('24h');
          }}
          className="btn-secondary whitespace-nowrap"
        >
          Clear Filters
        </button>
      </div>

      {/* Active Filters Display */}
      {(searchTerm || selectedAsset || selectedSentiment !== 'all' || timeframe !== '24h') && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="flex flex-wrap gap-2">
            <span className="text-sm text-gray-600 font-medium">Active filters:</span>
            {searchTerm && (
              <span className="badge bg-blue-100 text-blue-800">
                Search: "{searchTerm}"
              </span>
            )}
            {selectedAsset && (
              <span className="badge bg-green-100 text-green-800">
                Asset: {selectedAsset}
              </span>
            )}
            {selectedSentiment !== 'all' && (
              <span className={`badge ${
                selectedSentiment === 'positive' ? 'sentiment-positive' :
                selectedSentiment === 'negative' ? 'sentiment-negative' :
                'sentiment-neutral'
              }`}>
                Sentiment: {selectedSentiment}
              </span>
            )}
            {timeframe !== '24h' && (
              <span className="badge bg-purple-100 text-purple-800">
                Time: {timeframes.find(tf => tf.value === timeframe)?.label}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SearchAndFilters;
