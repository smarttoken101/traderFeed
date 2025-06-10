import React from 'react';
import { ExternalLink, Clock, TrendingUp } from 'lucide-react';
import type { Article } from '../services/api';
import { 
  formatRelativeTime, 
  getSentimentColor, 
  getSentimentIcon, 
  truncateText,
  getCategoryIcon,
  classNames
} from '../utils/helpers';

interface ArticleCardProps {
  article: Article;
  showFullContent?: boolean;
  onAssetClick?: (asset: string) => void;
}

const ArticleCard: React.FC<ArticleCardProps> = ({ 
  article, 
  showFullContent = false,
  onAssetClick 
}) => {
  const sentimentColor = getSentimentColor(article.sentimentLabel || 'neutral');
  const sentimentIcon = getSentimentIcon(article.sentimentLabel || 'neutral');

  const handleAssetClick = (asset: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onAssetClick?.(asset);
  };

  const openArticle = () => {
    window.open(article.link, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="card hover:shadow-lg transition-all duration-200 cursor-pointer" onClick={openArticle}>
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center space-x-2 text-sm text-gray-500">
          <span className="flex items-center space-x-1">
            {article.feed && (
              <>
                <span>{getCategoryIcon(article.feed.category)}</span>
                <span className="font-medium">{article.feed.name}</span>
                <span>•</span>
              </>
            )}
            <Clock className="h-4 w-4" />
            <span>{formatRelativeTime(article.publishedAt)}</span>
          </span>
        </div>
        
        {/* Sentiment Badge */}
        <div className={classNames(
          'badge',
          sentimentColor
        )}>
          <span className="mr-1">{sentimentIcon}</span>
          {article.sentimentLabel || 'neutral'}
          {article.sentimentScore && (
            <span className="ml-1 text-xs">
              ({(article.sentimentScore * 100).toFixed(0)}%)
            </span>
          )}
        </div>
      </div>

      {/* Title */}
      <h3 className="text-lg font-semibold text-gray-900 mb-2 line-clamp-2 hover:text-primary-600 transition-colors">
        {article.title}
      </h3>

      {/* Content Preview */}
      {article.description && (
        <p className="text-gray-600 mb-4 line-clamp-3">
          {showFullContent ? article.description : truncateText(article.description, 200)}
        </p>
      )}

      {/* Assets/Markets Tags */}
      {article.markets && article.markets.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center space-x-1 mb-2">
            <TrendingUp className="h-4 w-4 text-gray-400" />
            <span className="text-sm font-medium text-gray-700">Markets:</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {article.markets.slice(0, 6).map((market) => (
              <button
                key={market}
                onClick={(e) => handleAssetClick(market, e)}
                className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-primary-100 text-primary-800 hover:bg-primary-200 transition-colors"
              >
                {market}
              </button>
            ))}
            {article.markets.length > 6 && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                +{article.markets.length - 6} more
              </span>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-gray-200">
        <div className="text-sm text-gray-500">
          Source: <span className="font-medium">{article.feed?.name || 'Unknown'}</span>
        </div>
        
        <button
          onClick={(e) => {
            e.stopPropagation();
            openArticle();
          }}
          className="inline-flex items-center space-x-1 text-sm text-primary-600 hover:text-primary-700 font-medium"
        >
          <span>Read more</span>
          <ExternalLink className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

export default ArticleCard;