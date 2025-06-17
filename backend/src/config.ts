import dotenv from 'dotenv';

dotenv.config();

const config = {
  // OpenAI API Key (leaving for other potential uses, though vector-database will remove it)
  openaiApiKey: process.env.OPENAI_API_KEY,

  // Gemini API Key
  geminiApiKey: process.env.GEMINI_API_KEY,

  // Qdrant Configuration
  qdrantUrl: process.env.QDRANT_URL || 'http://localhost:6333',
  qdrantApiKey: process.env.QDRANT_API_KEY,

  // Other configurations can be added here
  nodeEnv: process.env.NODE_ENV || 'development',
  port: process.env.PORT || '3000',
};

export default config;
