# TradeFeed - AI-Powered News Analysis for Traders

A modern web application that aggregates financial news from RSS feeds, performs sentiment analysis using NLP/LLM technology, and rewrites news content in trader-friendly language for forex, futures, and cryptocurrency markets.

## 🚀 Features

### Core Functionality
- **RSS Feed Aggregation**: Automatically fetch and parse news from multiple financial RSS sources
- **AI-Powered Sentiment Analysis**: 
  - Traditional NLP sentiment scoring using libraries like VADER, TextBlob
  - Advanced LLM-based sentiment analysis using OpenAI GPT or similar models
- **Intelligent News Rewriting**: Transform complex financial news into clear, actionable insights for traders
- **COT Data Analysis**: Download and analyze Commitment of Traders data with advanced models
- **Knowledge Base Integration**: Curated document repository for enhanced LLM report generation
- **Automated Trading Reports**: Generate comprehensive market analysis reports combining news, sentiment, and COT data
- **Multi-Market Focus**: Specialized content for Forex, Futures, and Cryptocurrency markets
- **Real-time Updates**: Continuous monitoring and updating of news feeds and COT data

### User Experience
- **Clean, Modern UI**: Responsive design optimized for desktop and mobile
- **Advanced Filtering**: Filter news by market type, sentiment, time range, and keywords
- **Sentiment Visualization**: Visual indicators and charts showing market sentiment trends
- **COT Data Dashboard**: Interactive charts and analysis of Commitment of Traders data
- **Automated Reports**: Daily/weekly market analysis reports with actionable insights
- **Knowledge Base Management**: Upload and organize trading documents and research
- **Bookmarking & Alerts**: Save important articles and set up custom alerts
- **Search Functionality**: Full-text search across all processed articles and knowledge base

### Technical Features
- **Scalable Architecture**: Built with modern web technologies for high performance
- **API Integration**: RESTful API for external integrations
- **Database Optimization**: Efficient storage and retrieval of news data
- **Caching Layer**: Redis caching for improved performance
- **Rate Limiting**: Intelligent rate limiting for RSS feed polling
- **Document Processing**: Advanced PDF/DOC parsing for knowledge base integration
- **Vector Database**: Semantic search capabilities for knowledge base queries
- **Automated Data Pipeline**: Scheduled COT data downloads and processing

## 🎯 Project Status

### ✅ COMPLETED PHASES

#### Phase 1: Foundation & Setup ✅
- [x] Project structure with backend/frontend directories
- [x] PostgreSQL database setup with authentication
- [x] Redis cache server installation and configuration
- [x] Comprehensive Prisma database schema (11 models)
- [x] Express.js TypeScript server with health monitoring
- [x] Database migrations and successful connections

#### Phase 2: AI & NLP Integration ✅
- [x] Google Gemini 2.5 Pro API integration
- [x] Enhanced RSS feeds configuration (100+ premium sources)
- [x] Sentiment Analysis Service (VADER, Natural.js, Gemini AI)
- [x] Feed configuration service with market categorization

#### Phase 3: Data Separation Architecture ✅
- [x] **RSS feeds and COT data properly separated in database**
- [x] Separate service architecture for RSS and COT processing
- [x] RSS Service: feed parsing, article storage, sentiment integration
- [x] COT Service: CFTC data processing, positioning analysis, trading signals
- [x] API endpoints for both RSS and COT data
- [x] Successfully processing real news data and mock COT data

### 🔄 IN PROGRESS
#### Phase 4: Knowledge Base & Advanced Features
- [ ] Knowledge Base Service with document processing
- [ ] Vector search capabilities
- [ ] Job scheduling system for automated processing
- [ ] Advanced sentiment analysis with LLM integration

### 📋 PENDING
#### Phase 5: Frontend & User Interface
- [ ] React frontend application
- [ ] Dashboard with news feed and COT analysis
- [ ] User authentication and personalization
- [ ] Report generation system

### 🌟 KEY ACHIEVEMENT: Data Separation
**User Requirement Met**: RSS feeds and COT data are now properly separated in the database with different optimized structures:
- **RSS Data**: `rss_feeds` + `articles` tables for news content
- **COT Data**: Separate `cot_data` table for positioning analysis
- **Current Status**: 137 RSS feeds, 878 articles, 1,092 COT records

## 🛠 Technology Stack

### Backend
- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js or Fastify
- **Database**: PostgreSQL with Prisma ORM
- **Caching**: Redis
- **Queue Management**: Bull Queue for background processing
- **RSS Processing**: feedparser or similar library
- **COT Data**: CFTC data parsing and analysis tools
- **Document Processing**: pdf-parse, mammoth for knowledge base documents
- **Vector Database**: Pinecone, Weaviate, or local vector storage
- **NLP/AI**: 
  - Traditional: VADER sentiment, natural, compromise
  - LLM: OpenAI GPT API, Anthropic Claude, or local models
  - Embeddings: OpenAI embeddings or local models for semantic search

### Frontend
- **Framework**: React with TypeScript or Next.js
- **Styling**: Tailwind CSS
- **State Management**: Zustand or Redux Toolkit
- **Charts**: Chart.js or Recharts for sentiment visualization
- **UI Components**: Headless UI or Shadcn/ui

### Infrastructure
- **Containerization**: Docker & Docker Compose
- **Environment Management**: dotenv
- **Process Management**: PM2
- **Monitoring**: Winston for logging
- **Testing**: Jest, Vitest, Cypress

## 📋 Project Structure

```
tradeFeed/
├── backend/
│   ├── src/
│   │   ├── controllers/      # API route handlers
│   │   ├── services/         # Business logic
│   │   ├── models/          # Database models
│   │   ├── utils/           # Utility functions
│   │   ├── middleware/      # Express middleware
│   │   ├── jobs/            # Background jobs
│   │   ├── cot/             # COT data processing
│   │   ├── knowledge/       # Knowledge base management
│   │   ├── reports/         # Report generation
│   │   └── config/          # Configuration files
│   ├── tests/
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/      # React components
│   │   ├── pages/          # Page components
│   │   ├── hooks/          # Custom hooks
│   │   ├── services/       # API calls
│   │   ├── store/          # State management
│   │   └── utils/          # Utility functions
│   ├── public/
│   └── package.json
├── knowledge-base/          # Document storage
├── docker-compose.yml
├── .env.example
└── README.md
```

## 🚦 Getting Started

### Prerequisites
- Node.js (v18+)
- PostgreSQL (v14+)
- Redis (v6+)
- Docker & Docker Compose (optional)

### Environment Setup
1. Clone the repository
2. Copy `.env.example` to `.env` and configure your environment variables
3. Install dependencies: `npm install` in both backend and frontend directories
4. Set up the database: `npm run db:migrate`
5. Start Redis server
6. Run the development servers

### Environment Variables
```env
# Database
DATABASE_URL=postgresql://username:password@localhost:5432/tradeFeed
REDIS_URL=redis://localhost:6379

# API Keys
OPENAI_API_KEY=your_openai_api_key
NEWS_API_KEY=your_news_api_key
PINECONE_API_KEY=your_pinecone_api_key

# CFTC COT Data
CFTC_API_URL=https://publicreporting.cftc.gov/resource/
COT_UPDATE_SCHEDULE=0 18 * * 2  # Weekly on Tuesday at 6 PM

# Vector Database
VECTOR_DB_URL=your_vector_db_url
EMBEDDING_MODEL=text-embedding-ada-002

# Knowledge Base
KNOWLEDGE_BASE_PATH=/app/knowledge-base
MAX_DOCUMENT_SIZE=50MB
SUPPORTED_FORMATS=pdf,doc,docx,txt,md

# RSS Feeds
FOREX_RSS_FEEDS=https://example.com/forex-feed.xml,https://another-feed.xml
CRYPTO_RSS_FEEDS=https://crypto-news.com/feed.xml
FUTURES_RSS_FEEDS=https://futures-feed.com/rss.xml

# Application
PORT=3000
NODE_ENV=development
JWT_SECRET=your_jwt_secret
```

## 📊 COT Data Sources & Analysis

### Commitment of Traders Data
- **CFTC Weekly Reports**: Automated download of legacy and disaggregated COT reports
- **Historical Data**: Complete historical COT data for trend analysis
- **Real-time Processing**: Weekly data updates every Tuesday evening
- **Multi-Market Coverage**: Forex, commodities, stock indices, and cryptocurrency futures

### Advanced COT Analysis Models
- **Net Position Analysis**: Track large speculators vs commercial hedgers
- **Historical Positioning**: Compare current positioning to historical percentiles
- **Sentiment Indicators**: Derive market sentiment from positioning changes
- **Contrarian Signals**: Identify extreme positioning for contrarian opportunities
- **Correlation Analysis**: Connect COT data with price movements and news sentiment

### COT Visualization Dashboard
- **Interactive Charts**: Historical positioning charts with customizable timeframes
- **Heat Maps**: Visual representation of positioning across multiple markets
- **Trend Analysis**: Identify positioning trends and potential reversals
- **Alert System**: Notifications for significant positioning changes

## 📚 Knowledge Base System

### Document Management
- **Multi-format Support**: PDF, Word documents, text files, and markdown
- **Automatic Processing**: Extract and index text content for semantic search
- **Version Control**: Track document updates and maintain revision history
- **Categorization**: Organize documents by market type, strategy, or topic

### Semantic Search Integration
- **Vector Embeddings**: Convert documents to embeddings for similarity search
- **Contextual Retrieval**: Find relevant information based on semantic meaning
- **LLM Integration**: Provide relevant context to LLMs for enhanced report generation
- **Smart Recommendations**: Suggest relevant documents based on current market conditions

### Knowledge Base Categories
- **Trading Strategies**: Technical analysis methods, trading plans, risk management
- **Market Research**: Economic reports, central bank communications, analyst notes
- **Historical Analysis**: Past market events, crisis patterns, seasonal trends
- **Educational Content**: Trading concepts, market mechanics, terminology

### Forex News
- ForexFactory RSS feeds
- DailyFX news feeds
- Investing.com currency news
- Reuters forex section

### Cryptocurrency News
- CoinDesk RSS feeds
- Cointelegraph feeds
- CryptoNews feeds
- Bitcoin Magazine

### Futures & Commodities
- CME Group news
- AgWeb commodity news
- Futures Magazine feeds

## 🤖 AI & NLP Features

### Sentiment Analysis Methods
1. **Traditional NLP**:
   - VADER sentiment analysis for financial text
   - TextBlob polarity scoring
   - Custom financial lexicon-based analysis

2. **LLM-based Analysis**:
   - GPT-4 for nuanced sentiment understanding
   - Custom prompts for trading context
   - Confidence scoring and reasoning

### News Rewriting Pipeline
1. **Content Extraction**: Clean and extract main content from articles
2. **Context Analysis**: Identify market relevance and impact
3. **Knowledge Base Query**: Retrieve relevant context from knowledge base
4. **Simplification**: Rewrite using trader-friendly language
5. **Key Insights**: Extract actionable trading insights
6. **Risk Assessment**: Highlight potential market impacts

### Automated Report Generation
1. **Data Aggregation**: Combine news sentiment, COT data, and knowledge base insights
2. **Multi-source Analysis**: Cross-reference information across different data sources
3. **Pattern Recognition**: Identify recurring themes and market patterns
4. **Contextual Enhancement**: Use knowledge base to provide deeper market context
5. **Report Compilation**: Generate comprehensive daily/weekly trading reports
6. **Actionable Insights**: Provide specific trading recommendations and risk warnings

## 🎯 Target Audience

### Primary Users
- **Retail Traders**: Individual forex, crypto, and futures traders seeking comprehensive market analysis
- **Day Traders**: Need quick, digestible market news with COT insights
- **Swing Traders**: Looking for medium-term market sentiment and positioning data
- **Position Traders**: Require deep market analysis with historical context

### Secondary Users
- **Financial Analysts**: Seeking aggregated market sentiment and COT positioning data
- **Investment Firms**: Monitoring market sentiment trends and institutional positioning
- **Trading Educators**: Teaching market analysis with real-world data and reports
- **Research Teams**: Building knowledge bases for enhanced market research

## 🔮 Future Enhancements

- **Mobile App**: React Native or Flutter mobile application
- **Machine Learning**: Custom ML models for financial sentiment and COT analysis
- **Social Sentiment**: Integration with Twitter/Reddit sentiment
- **Technical Analysis**: Combine news sentiment with technical indicators and COT data
- **Multi-language Support**: Support for multiple languages
- **Premium Features**: Advanced analytics, custom reports, and alerts
- **API Marketplace**: Sell sentiment and COT analysis data to other platforms
- **AI Trading Signals**: Generate automated trading signals based on comprehensive analysis
- **Backtesting Integration**: Test strategies against historical news and COT data
- **Custom Knowledge Bases**: Allow users to create private knowledge repositories

## 📊 Success Metrics

- Number of articles processed daily
- COT data processing accuracy and timeliness
- Sentiment analysis accuracy
- Knowledge base document processing efficiency
- Report generation quality and user satisfaction
- User engagement metrics
- API response times
- Feed processing efficiency
- User retention rates
- Knowledge base search relevance scores

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- RSS feed providers for financial news
- Open source NLP libraries
- Trading community feedback and suggestions

---

**Made with ❤️ for the trading community**
