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
  };

  const handleAssetToggle = (asset: string) => {
    const newAssets = selectedAssets.includes(asset)
      ? selectedAssets.filter(a => a !== asset)
      : [...selectedAssets, asset];
    
    setSelectedAssets(newAssets);
    handleFilterChange('assets', newAssets.length > 0 ? newAssets : undefined);
  };

  const clearFilters = () => {
    setSelectedAssets([]);
    onFiltersChange({});
  };

  const activeFiltersCount = Object.keys(filters).filter(key => filters[key as keyof typeof filters]).length;

  return (
    <div className="bg-white border-b border-gray-200 py-4">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Filter Toggle */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="flex items-center space-x-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Filter className="h-4 w-4" />
            <span>Filters</span>
            {activeFiltersCount > 0 && (
              <span className="bg-primary-600 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                {activeFiltersCount}
              </span>
            )}
          </button>

          {activeFiltersCount > 0 && (
            <button
              onClick={clearFilters}
              className="text-sm text-gray-500 hover:text-gray-700 flex items-center space-x-1"
            >
              <X className="h-4 w-4" />
              <span>Clear all</span>
            </button>
          )}
        </div>

        {/* Active Filters Display */}
        {activeFiltersCount > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {filters.category && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-primary-100 text-primary-800">
                {categories.find(c => c.value === filters.category)?.icon} {filters.category}
                <button
                  onClick={() => handleFilterChange('category', undefined)}
                  className="ml-2 hover:text-primary-600"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
            {filters.sentiment && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-gray-100 text-gray-800">
                {sentiments.find(s => s.value === filters.sentiment)?.icon} {filters.sentiment}
                <button
                  onClick={() => handleFilterChange('sentiment', undefined)}
                  className="ml-2 hover:text-gray-600"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
            {filters.timeframe && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-gray-100 text-gray-800">
                <Calendar className="h-3 w-3 mr-1" />
                {timeframes.find(t => t.value === filters.timeframe)?.label}
                <button
                  onClick={() => handleFilterChange('timeframe', undefined)}
                  className="ml-2 hover:text-gray-600"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
            {selectedAssets.map(asset => (
              <span key={asset} className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-yellow-100 text-yellow-800">
                <TrendingUp className="h-3 w-3 mr-1" />
                {asset}
                <button
                  onClick={() => handleAssetToggle(asset)}
                  className="ml-2 hover:text-yellow-600"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Filter Options */}
        {isOpen && (
          <div className="bg-gray-50 rounded-lg p-4 space-y-6">
            {/* Categories */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Category
              </label>
              <div className="flex flex-wrap gap-2">
                {categories.map(category => (
                  <button
                    key={category.value}
                    onClick={() => handleFilterChange('category', 
                      filters.category === category.value ? undefined : category.value
                    )}
                    className={classNames(
                      'flex items-center space-x-2 px-3 py-2 rounded-lg border transition-colors',
                      filters.category === category.value
                        ? 'bg-primary-600 text-white border-primary-600'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    )}
                  >
                    <span>{category.icon}</span>
                    <span>{category.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Sentiment */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Sentiment
              </label>
              <div className="flex flex-wrap gap-2">
                {sentiments.map(sentiment => (
                  <button
                    key={sentiment.value}
                    onClick={() => handleFilterChange('sentiment',
                      filters.sentiment === sentiment.value ? undefined : sentiment.value
                    )}
                    className={classNames(
                      'flex items-center space-x-2 px-3 py-2 rounded-lg border transition-colors',
                      filters.sentiment === sentiment.value
                        ? 'bg-primary-600 text-white border-primary-600'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    )}
                  >
                    <span>{sentiment.icon}</span>
                    <span>{sentiment.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Timeframe */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Timeframe
              </label>
              <div className="flex flex-wrap gap-2">
                {timeframes.map(timeframe => (
                  <button
                    key={timeframe.value}
                    onClick={() => handleFilterChange('timeframe',
                      filters.timeframe === timeframe.value ? undefined : timeframe.value
                    )}
                    className={classNames(
                      'flex items-center space-x-2 px-3 py-2 rounded-lg border transition-colors',
                      filters.timeframe === timeframe.value
                        ? 'bg-primary-600 text-white border-primary-600'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    )}
                  >
                    <Calendar className="h-4 w-4" />
                    <span>{timeframe.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Assets */}
            {availableAssets.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Trading Assets
                </label>
                <div className="max-h-40 overflow-y-auto">
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                    {availableAssets.slice(0, 24).map(asset => (
                      <button
                        key={asset}
                        onClick={() => handleAssetToggle(asset)}
                        className={classNames(
                          'px-2 py-1 rounded text-xs font-medium transition-colors',
                          selectedAssets.includes(asset)
                            ? 'bg-primary-600 text-white'
                            : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                        )}
                      >
                        {asset}
                      </button>
                    ))}
                  </div>
                  {availableAssets.length > 24 && (
                    <p className="text-xs text-gray-500 mt-2">
                      +{availableAssets.length - 24} more assets available
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SearchAndFilters;