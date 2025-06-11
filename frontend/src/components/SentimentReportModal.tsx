import React, { useState } from 'react';
import { X, FileText, Clock, TrendingUp, Download } from 'lucide-react';
import ApiService from '../services/api';

interface SentimentReportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SentimentReportModal: React.FC<SentimentReportModalProps> = ({ isOpen, onClose }) => {
  const [report, setReport] = useState<string>('');
  const [timeframe, setTimeframe] = useState<'24h' | '7d' | '30d'>('24h');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string>('');

  const generateReport = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const data = await ApiService.getSentimentReport(timeframe);
      setReport(data.report);
      setGeneratedAt(data.generatedAt);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate report');
    } finally {
      setLoading(false);
    }
  };

  const downloadReport = () => {
    if (!report) return;
    
    const blob = new Blob([report], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sentiment-report-${timeframe}-${new Date().toISOString().split('T')[0]}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        {/* Background overlay */}
        <div 
          className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75"
          onClick={onClose}
        />

        {/* Modal panel */}
        <div className="inline-block w-full max-w-4xl p-6 my-8 overflow-hidden text-left align-middle transition-all transform bg-white shadow-xl rounded-lg">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              <FileText className="h-6 w-6 text-primary-600" />
              <h3 className="text-lg font-medium text-gray-900">
                Sentiment Analysis Report
              </h3>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-between mb-6 p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center space-x-4">
              <label className="text-sm font-medium text-gray-700">Timeframe:</label>
              <select
                value={timeframe}
                onChange={(e) => setTimeframe(e.target.value as '24h' | '7d' | '30d')}
                className="input-field min-w-[120px]"
                disabled={loading}
              >
                <option value="24h">24 Hours</option>
                <option value="7d">7 Days</option>
                <option value="30d">30 Days</option>
              </select>
              <button
                onClick={generateReport}
                disabled={loading}
                className="btn-primary flex items-center space-x-2"
              >
                <TrendingUp className="h-4 w-4" />
                <span>{loading ? 'Generating...' : 'Generate Report'}</span>
              </button>
            </div>
            
            {report && (
              <button
                onClick={downloadReport}
                className="btn-secondary flex items-center space-x-2"
              >
                <Download className="h-4 w-4" />
                <span>Download</span>
              </button>
            )}
          </div>

          {/* Content */}
          <div className="max-h-96 overflow-y-auto">
            {loading && (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto mb-4"></div>
                  <p className="text-gray-600">Generating sentiment report...</p>
                  <p className="text-sm text-gray-500 mt-1">This may take a few moments</p>
                </div>
              </div>
            )}

            {error && (
              <div className="bg-danger-50 border border-danger-200 rounded-lg p-4">
                <div className="flex items-center">
                  <div className="text-danger-600 text-sm">
                    <strong>Error:</strong> {error}
                  </div>
                </div>
              </div>
            )}

            {report && !loading && (
              <div className="space-y-4">
                {generatedAt && (
                  <div className="flex items-center space-x-2 text-sm text-gray-500 mb-4">
                    <Clock className="h-4 w-4" />
                    <span>Generated on {new Date(generatedAt).toLocaleString()}</span>
                  </div>
                )}
                <div className="prose prose-sm max-w-none">
                  <pre className="whitespace-pre-wrap text-sm text-gray-700 leading-relaxed">
                    {report}
                  </pre>
                </div>
              </div>
            )}

            {!report && !loading && !error && (
              <div className="text-center py-12">
                <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Generate Sentiment Report</h3>
                <p className="text-gray-600">
                  Select a timeframe and click "Generate Report" to create a comprehensive
                  sentiment analysis of the financial news.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SentimentReportModal;
