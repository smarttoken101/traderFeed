import React from 'react';
import { TrendingUp, TrendingDown, Minus, BarChart3 } from 'lucide-react';
import type { TrendingAsset } from '../services/api';
import { getAssetCategory, getCategoryIcon, formatNumber, classNames } from '../utils/helpers';

interface AssetCardProps {
  asset: TrendingAsset;
  onClick?: (asset: string) => void;
}

const AssetCard: React.FC<AssetCardProps> = ({ asset, onClick }) => {
  const category = getAssetCategory(asset.asset);
  const categoryIcon = getCategoryIcon(category);
  
  const getSentimentIndicator = () => {
    // Calculate overall sentiment score from the sentiment object
    const total = asset.sentiment.positive + asset.sentiment.negative + asset.sentiment.neutral;
    let sentimentScore = 0;
    
    if (total > 0) {
      sentimentScore = (asset.sentiment.positive - asset.sentiment.negative) / total;
    }
    
    if (sentimentScore > 0.1) {
      return {
        icon: <TrendingUp className="h-4 w-4" />,
        color: 'text-success-600',
        bg: 'bg-success-50'
      };
    } else if (sentimentScore < -0.1) {
      return {
        icon: <TrendingDown className="h-4 w-4" />,
        color: 'text-danger-600',
        bg: 'bg-danger-50'
      };
    } else {
      return {
        icon: <Minus className="h-4 w-4" />,
        color: 'text-gray-600',
        bg: 'bg-gray-50'
      };
    }
  };

  const getChangeIndicator = () => {
    if (asset.change > 0) {
      return {
        icon: <TrendingUp className="h-3 w-3" />,
        color: 'text-success-600',
        prefix: '+'
      };
    } else if (asset.change < 0) {
      return {
        icon: <TrendingDown className="h-3 w-3" />,
        color: 'text-danger-600',
        prefix: ''
      };
    } else {
      return {
        icon: <Minus className="h-3 w-3" />,
        color: 'text-gray-600',
        prefix: ''
      };
    }
  };

  const sentimentIndicator = getSentimentIndicator();
  const changeIndicator = getChangeIndicator();

  const handleClick = () => {
    onClick?.(asset.asset);
  };

  return (
    <div 
      className="card hover:shadow-lg cursor-pointer transition-all duration-200 relative"
      onClick={handleClick}
    >
      {/* Rank Badge */}
      <div className="absolute -top-2 -left-2 bg-primary-600 text-white rounded-full w-8 h-8 flex items-center justify-center text-sm font-bold">
        {asset.rank}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <span className="text-lg">{categoryIcon}</span>
          <div>
            <h3 className="font-semibold text-gray-900 text-lg">{asset.asset}</h3>
            <p className="text-sm text-gray-500 capitalize">{category}</p>
          </div>
        </div>
        
        <div className={classNames(
          'flex items-center space-x-1 px-2 py-1 rounded-full',
          sentimentIndicator.bg,
          sentimentIndicator.color
        )}>
          {sentimentIndicator.icon}
          <span className="text-sm font-medium">
            {(() => {
              const total = asset.sentiment.positive + asset.sentiment.negative + asset.sentiment.neutral;
              if (total === 0) return '0.0%';
              const score = (asset.sentiment.positive - asset.sentiment.negative) / total;
              return `${score > 0 ? '+' : ''}${(score * 100).toFixed(1)}%`;
            })()}
          </span>
        </div>
      </div>

      {/* Metrics */}
      <div className="space-y-3">
        {/* Mentions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <BarChart3 className="h-4 w-4 text-gray-400" />
            <span className="text-sm text-gray-600">Mentions</span>
          </div>
          <span className="font-semibold text-gray-900">
            {formatNumber(asset.mentions)}
          </span>
        </div>

        {/* Change */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {changeIndicator.icon}
            <span className="text-sm text-gray-600">Change</span>
          </div>
          <span className={classNames(
            'font-semibold',
            changeIndicator.color
          )}>
            {changeIndicator.prefix}{formatNumber(Math.abs(asset.change))}
          </span>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-4 pt-3 border-t border-gray-200">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>Trending #{asset.rank}</span>
          <span>Click for details</span>
        </div>
      </div>
    </div>
  );
};

export default AssetCard;