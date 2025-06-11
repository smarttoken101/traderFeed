import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import Dashboard from './pages/Dashboard';
import AssetDetail from './pages/AssetDetail';
import KnowledgeBase from './pages/KnowledgeBase';
import COTDashboard from './pages/COTDashboard';
import COTInstrumentDetail from './pages/COTInstrumentDetail';
import ErrorBoundary from './components/ErrorBoundary';

function App() {
  const [searchQuery, setSearchQuery] = React.useState('');

  return (
    <ErrorBoundary>
      <Router>
        <div className="min-h-screen bg-gray-50">
          <Header onSearch={setSearchQuery} searchQuery={searchQuery} />
          <ErrorBoundary>
            <Routes>
              <Route path="/" element={<Dashboard searchQuery={searchQuery} />} />
              <Route path="/asset/:asset" element={<AssetDetail />} />
              <Route path="/knowledge" element={<KnowledgeBase />} />
              <Route path="/cot" element={<COTDashboard />} />
              <Route path="/cot/:instrument" element={<COTInstrumentDetail />} />
            </Routes>
          </ErrorBoundary>
        </div>
      </Router>
    </ErrorBoundary>
  );
}

export default App;
