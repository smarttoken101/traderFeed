import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

interface Config {
  // Server
  port: number;
  nodeEnv: string;
  jwtSecret: string;

  // Database
  databaseUrl: string;
  redisUrl: string;

  // External APIs
  geminiApiKey?: string;
  newsApiKey?: string;
  pineconeApiKey?: string;

  // CFTC COT Data
  cftcApiUrl: string;
  cotUpdateSchedule: string;

  // Vector Database
  vectorDbUrl?: string;
  embeddingModel: string;

  // Knowledge Base
  knowledgeBasePath: string;
  maxDocumentSize: string;
  supportedFormats: string[];

  // RSS Feeds
  forexRssFeeds: string[];
  cryptoRssFeeds: string[];
  futuresRssFeeds: string[];

  // Logging
  logLevel: string;
  logFile: string;
}

const config: Config = {
  // Server configuration
  port: parseInt(process.env.PORT || '3001', 10), // Changed default to 3001 to match .env
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'your-secret-key',

  // Database
  databaseUrl: process.env.DATABASE_URL || 'file:./dev.db',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',

  // External APIs
  geminiApiKey: process.env.GEMINI_API_KEY,
  newsApiKey: process.env.NEWS_API_KEY,
  pineconeApiKey: process.env.PINECONE_API_KEY,

  // CFTC COT Data
  cftcApiUrl: process.env.CFTC_API_URL || 'https://publicreporting.cftc.gov/resource/',
  cotUpdateSchedule: process.env.COT_UPDATE_SCHEDULE || '0 18 * * 2',

  // Vector Database
  vectorDbUrl: process.env.VECTOR_DB_URL,
  embeddingModel: process.env.EMBEDDING_MODEL || 'text-embedding-ada-002',

  // Knowledge Base
  knowledgeBasePath: process.env.KNOWLEDGE_BASE_PATH || './knowledge-base',
  maxDocumentSize: process.env.MAX_DOCUMENT_SIZE || '50MB',
  supportedFormats: (process.env.SUPPORTED_FORMATS || 'pdf,doc,docx,txt,md').split(','),

  // RSS Feeds
  forexRssFeeds: (process.env.FOREX_RSS_FEEDS || '').split(',').filter(Boolean),
  cryptoRssFeeds: (process.env.CRYPTO_RSS_FEEDS || '').split(',').filter(Boolean),
  futuresRssFeeds: (process.env.FUTURES_RSS_FEEDS || '').split(',').filter(Boolean),

  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',
  logFile: process.env.LOG_FILE || 'logs/app.log',
};

// Validate required configuration but don't exit during tests
const requiredEnvVars = ['DATABASE_URL'];
const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0 && process.env.NODE_ENV !== 'test') {
  console.error('Missing required environment variables:', missingEnvVars);
  process.exit(1);
}

export default config;
