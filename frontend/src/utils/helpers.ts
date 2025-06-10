import { formatDistanceToNow, format, parseISO } from 'date-fns';

export const formatDate = (dateString: string): string => {
  try {
    const date = parseISO(dateString);
    return format(date, 'MMM dd, yyyy HH:mm');
  } catch {
    return 'Invalid date';
  }
};

export const formatRelativeTime = (dateString: string): string => {
  try {
    const date = parseISO(dateString);
    return formatDistanceToNow(date, { addSuffix: true });
  } catch {
    return 'Unknown time';
  }
};

export const getSentimentColor = (sentiment: 'positive' | 'negative' | 'neutral'): string => {
  switch (sentiment) {
    case 'positive':
      return 'text-success-600 bg-success-50';
    case 'negative':
      return 'text-danger-600 bg-danger-50';
    case 'neutral':
    default:
      return 'text-gray-600 bg-gray-50';
  }
};

export const getSentimentIcon = (sentiment: 'positive' | 'negative' | 'neutral'): string => {
  switch (sentiment) {
    case 'positive':
      return '📈';
    case 'negative':
      return '📉';
    case 'neutral':
    default:
      return '➡️';
  }
};

export const formatNumber = (num: number): string => {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
};

export const formatSentimentScore = (score: number): string => {
  return (score * 100).toFixed(1) + '%';
};

export const getAssetCategory = (asset: string): string => {
  const forexPairs = ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'NZDUSD', 'USDCHF'];
  const cryptos = ['BITCOIN', 'ETHEREUM', 'BTC', 'ETH', 'XRP', 'LTC', 'ADA'];
  const commodities = ['GOLD', 'SILVER', 'OIL', 'CRUDE', 'NATURAL GAS'];
  const indices = ['SPX', 'NASDAQ', 'DOW', 'DAX', 'FTSE'];

  if (forexPairs.includes(asset.toUpperCase())) return 'forex';
  if (cryptos.includes(asset.toUpperCase())) return 'crypto';
  if (commodities.includes(asset.toUpperCase())) return 'commodities';
  if (indices.includes(asset.toUpperCase())) return 'indices';
  
  return 'general';
};

export const getCategoryIcon = (category: string): string => {
  switch (category.toLowerCase()) {
    case 'forex':
      return '💱';
    case 'crypto':
      return '₿';
    case 'commodities':
      return '🏗️';
    case 'indices':
      return '📊';
    case 'stocks':
      return '📈';
    default:
      return '📰';
  }
};

export const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trim() + '...';
};

export const debounce = <T extends (...args: any[]) => void>(
  func: T,
  delay: number
): ((...args: Parameters<T>) => void) => {
  let timeoutId: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  };
};

export const classNames = (...classes: (string | undefined | null | false)[]): string => {
  return classes.filter(Boolean).join(' ');
};