import React, { useState } from 'react';
import { X, Download, BarChart3, Clock, FileText, AlertCircle } from 'lucide-react';
import ApiService from '../services/api';

interface COTReportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const COTReportModal: React.FC<COTReportModalProps> = ({ isOpen, onClose }) => {
  const [timeframe, setTimeframe] = useState<'1w' | '4w' | '12w'>('4w');
  const [isGenerating, setIsGenerating] = useState(false);
  const [report, setReport] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generateReport = async () => {
    setIsGenerating(true);
    setError(null);
    
    try {
      // Use the new backend endpoint for AI-powered COT reports
      const reportData = await ApiService.getCotReport(timeframe);
      setReport(reportData.report);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate COT report');
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadReport = () => {
    if (!report) return;

    const blob = new Blob([report], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cot-report-${timeframe}-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleClose = () => {
    setReport(null);
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-2">
            <BarChart3 className="h-6 w-6 text-primary-600" />
            <h2 className="text-xl font-bold text-gray-900">Generate COT Report</h2>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {!report ? (
            <div className="space-y-6">
              <div>
                <p className="text-gray-600 mb-4">
                  Generate a comprehensive COT (Commitment of Traders) analysis report with current positioning, 
                  signals, and market insights.
                </p>
                
                {/* Timeframe Selection */}
                <div className="space-y-3">
                  <label className="block text-sm font-medium text-gray-700">
                    Analysis Timeframe
                  </label>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { value: '1w', label: '1 Week', desc: 'Latest positioning' },
                      { value: '4w', label: '4 Weeks', desc: 'Monthly trend' },
                      { value: '12w', label: '12 Weeks', desc: 'Quarterly overview' }
                    ].map(({ value, label, desc }) => (
                      <button
                        key={value}
                        onClick={() => setTimeframe(value as any)}
                        className={`p-3 rounded-lg border text-left transition-colors ${
                          timeframe === value
                            ? 'border-primary-500 bg-primary-50 text-primary-700'
                            : 'border-gray-300 hover:border-gray-400'
                        }`}
                      >
                        <div className="font-medium">{label}</div>
                        <div className="text-sm text-gray-600">{desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {error && (
                <div className="bg-danger-50 border border-danger-200 rounded-lg p-4">
                  <div className="flex items-center space-x-2">
                    <AlertCircle className="h-5 w-5 text-danger-600" />
                    <span className="text-danger-700 font-medium">Error generating report</span>
                  </div>
                  <p className="text-danger-600 mt-1">{error}</p>
                </div>
              )}

              {/* Generate Button */}
              <div className="flex justify-end space-x-3">
                <button
                  onClick={handleClose}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={generateReport}
                  disabled={isGenerating}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 flex items-center space-x-2"
                >
                  {isGenerating ? (
                    <>
                      <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                      <span>Generating...</span>
                    </>
                  ) : (
                    <>
                      <FileText className="h-4 w-4" />
                      <span>Generate Report</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Report Preview */}
              <div className="bg-gray-50 rounded-lg p-4 max-h-96 overflow-y-auto">
                <pre className="text-sm text-gray-700 whitespace-pre-wrap font-mono">
                  {report.substring(0, 2000)}
                  {report.length > 2000 && '\n\n... (report continues)'}
                </pre>
              </div>

              {/* Download Actions */}
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 text-sm text-gray-600">
                  <Clock className="h-4 w-4" />
                  <span>Report generated at {new Date().toLocaleString()}</span>
                </div>
                <div className="flex space-x-3">
                  <button
                    onClick={() => setReport(null)}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Generate New
                  </button>
                  <button
                    onClick={downloadReport}
                    className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors flex items-center space-x-2"
                  >
                    <Download className="h-4 w-4" />
                    <span>Download Report</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default COTReportModal;
