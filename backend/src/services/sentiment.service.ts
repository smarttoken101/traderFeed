import { GoogleGenerativeAI } from '@google/generative-ai';
import { SentimentAnalyzer, PorterStemmer } from 'natural';
import Sentiment from 'sentiment';
import { PrismaClient } from '@prisma/client';
import logger from '../utils/logger';
import config from '../config';

interface SentimentResult {
  score: number; // -1 to 1
  label: 'positive' | 'negative' | 'neutral';
  confidence: number;
  method: 'vader' | 'natural' | 'gemini';
  reasoning?: string;
}

interface TradingContext {
  market: string;
  instruments: string[];
  timeframe: string;
  tradingImplications: string;
}

class SentimentService {
  private prisma = new PrismaClient();
  private genAI?: GoogleGenerativeAI;
  private naturalAnalyzer: SentimentAnalyzer;
  private sentimentAnalyzer: Sentiment;

  constructor() {
    // Initialize Gemini AI
    if (config.geminiApiKey) {
      this.genAI = new GoogleGenerativeAI(config.geminiApiKey);
    }

    // Initialize Natural sentiment analyzer
    this.naturalAnalyzer = new SentimentAnalyzer('English', PorterStemmer, '1' as any);
    
    // Initialize sentiment analyzer
    this.sentimentAnalyzer = new Sentiment();
  }

  /**
   * Analyze sentiment using VADER-like sentiment library
   */
  async analyzeWithVader(text: string): Promise<SentimentResult> {
    try {
      const result = this.sentimentAnalyzer.analyze(text);
      
      // Normalize score to -1 to 1 range
      const normalizedScore = Math.max(-1, Math.min(1, result.score / 10));
      
      let label: 'positive' | 'negative' | 'neutral';
      if (normalizedScore > 0.1) label = 'positive';
      else if (normalizedScore < -0.1) label = 'negative';
      else label = 'neutral';

      return {
        score: normalizedScore,
        label,
        confidence: Math.abs(normalizedScore),
        method: 'vader',
      };
    } catch (error) {
      logger.error('Error in VADER sentiment analysis:', error);
      throw error;
    }
  }

  /**
   * Analyze sentiment using Natural.js
   */
  async analyzeWithNatural(text: string): Promise<SentimentResult> {
    try {
      const tokens = text.toLowerCase().split(' ');
      const score = this.naturalAnalyzer.getSentiment(tokens);
      
      let label: 'positive' | 'negative' | 'neutral';
      if (score > 0) label = 'positive';
      else if (score < 0) label = 'negative';
      else label = 'neutral';

      return {
        score,
        label,
        confidence: Math.abs(score),
        method: 'natural',
      };
    } catch (error) {
      logger.error('Error in Natural sentiment analysis:', error);
      throw error;
    }
  }

  /**
   * Analyze sentiment using Gemini AI with trading context
   */
  async analyzeWithGemini(text: string, market?: string): Promise<SentimentResult> {
    try {
      if (!this.genAI) {
        throw new Error('Gemini AI not configured');
      }

      const model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

      const prompt = `
        Analyze the sentiment of this financial news article for trading purposes.
        ${market ? `This is related to the ${market} market.` : ''}
        
        Article text: "${text}"
        
        Please provide:
        1. A sentiment score from -1 (very negative) to +1 (very positive)
        2. A sentiment label (positive, negative, or neutral)
        3. A confidence score from 0 to 1
        4. Brief reasoning for the sentiment assessment from a trader's perspective
        
        Focus on how this news might impact trading decisions and market movements.
        Consider factors like:
        - Economic implications
        - Market volatility potential
        - Risk sentiment
        - Trading opportunities or risks
        
        Respond in this exact JSON format:
        {
          "score": -1.0 to 1.0,
          "label": "positive|negative|neutral",
          "confidence": 0.0 to 1.0,
          "reasoning": "Brief explanation"
        }
      `;

      const result = await model.generateContent(prompt);
      const responseText = result.response.text();
      
      // Parse JSON response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Invalid JSON response from Gemini');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      return {
        score: parsed.score,
        label: parsed.label,
        confidence: parsed.confidence,
        method: 'gemini',
        reasoning: parsed.reasoning,
      };
    } catch (error) {
      logger.error('Error in Gemini sentiment analysis:', error);
      throw error;
    }
  }

  /**
   * Get comprehensive sentiment analysis using multiple methods
   */
  async analyzeSentiment(text: string, market?: string): Promise<SentimentResult> {
    try {
      const results: SentimentResult[] = [];

      // Run VADER analysis
      try {
        const vaderResult = await this.analyzeWithVader(text);
        results.push(vaderResult);
      } catch (error) {
        logger.warn('VADER analysis failed:', error);
      }

      // Run Natural analysis
      try {
        const naturalResult = await this.analyzeWithNatural(text);
        results.push(naturalResult);
      } catch (error) {
        logger.warn('Natural analysis failed:', error);
      }

      // Run Gemini analysis if API key is available
      if (config.geminiApiKey) {
        try {
          const geminiResult = await this.analyzeWithGemini(text, market);
          results.push(geminiResult);
        } catch (error) {
          logger.warn('Gemini analysis failed:', error);
        }
      }

      if (results.length === 0) {
        throw new Error('All sentiment analysis methods failed');
      }

      // Use Gemini result if available, otherwise use weighted average
      const geminiResult = results.find(r => r.method === 'gemini');
      if (geminiResult) {
        return geminiResult;
      }

      // Calculate weighted average of traditional methods
      const totalWeight = results.length;
      const avgScore = results.reduce((sum, r) => sum + r.score, 0) / totalWeight;
      const avgConfidence = results.reduce((sum, r) => sum + r.confidence, 0) / totalWeight;

      let label: 'positive' | 'negative' | 'neutral';
      if (avgScore > 0.1) label = 'positive';
      else if (avgScore < -0.1) label = 'negative';
      else label = 'neutral';

      return {
        score: avgScore,
        label,
        confidence: avgConfidence,
        method: 'vader', // Primary method used
      };
    } catch (error) {
      logger.error('Error in comprehensive sentiment analysis:', error);
      throw error;
    }
  }

  /**
   * Generate trading context using Gemini AI
   */
  async generateTradingContext(text: string, sentimentResult: SentimentResult): Promise<TradingContext | null> {
    try {
      if (!this.genAI) {
        return null;
      }

      const model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

      const prompt = `
        Based on this financial news and its sentiment analysis, provide trading context:
        
        News: "${text}"
        Sentiment: ${sentimentResult.label} (score: ${sentimentResult.score})
        
        Please identify:
        1. The primary market affected (forex, crypto, futures, stocks)
        2. Specific trading instruments mentioned (currency pairs, cryptocurrencies, commodities)
        3. Suggested timeframe for trading impact (short-term, medium-term, long-term)
        4. Key trading implications and considerations
        
        Respond in this JSON format:
        {
          "market": "primary market",
          "instruments": ["instrument1", "instrument2"],
          "timeframe": "short-term|medium-term|long-term",
          "tradingImplications": "Key points for traders"
        }
      `;

      const result = await model.generateContent(prompt);
      const responseText = result.response.text();
      
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return null;
      }

      return JSON.parse(jsonMatch[0]);
    } catch (error) {
      logger.error('Error generating trading context:', error);
      return null;
    }
  }

  /**
   * Process sentiment for a specific article
   */
  async processArticleSentiment(articleId: string): Promise<void> {
    try {
      const article = await this.prisma.article.findUnique({
        where: { id: articleId },
      });

      if (!article) {
        throw new Error('Article not found');
      }

      const textToAnalyze = article.originalText || article.description || article.title;
      const primaryMarket = article.markets?.[0];

      // Analyze sentiment
      const sentimentResult = await this.analyzeSentiment(textToAnalyze, primaryMarket);

      // Generate trading context
      const tradingContext = await this.generateTradingContext(textToAnalyze, sentimentResult);

      // Update article with sentiment data
      await this.prisma.article.update({
        where: { id: articleId },
        data: {
          sentimentScore: sentimentResult.score,
          sentimentLabel: sentimentResult.label,
          sentimentMethod: sentimentResult.method,
          sentimentConfidence: sentimentResult.confidence,
          isProcessed: true,
        },
      });

      logger.info(`Processed sentiment for article ${articleId}: ${sentimentResult.label} (${sentimentResult.score})`);
    } catch (error) {
      logger.error(`Error processing sentiment for article ${articleId}:`, error);
      
      // Mark article as processed with error
      await this.prisma.article.update({
        where: { id: articleId },
        data: {
          processingError: error instanceof Error ? error.message : 'Unknown error',
          isProcessed: true,
        },
      });
    }
  }

  /**
   * Process sentiment for all unprocessed articles
   */
  async processUnprocessedArticles(): Promise<void> {
    try {
      const unprocessedArticles = await this.prisma.article.findMany({
        where: { 
          isProcessed: false,
          processingError: null,
        },
        take: 50, // Process in batches
        orderBy: { createdAt: 'desc' },
      });

      logger.info(`Processing sentiment for ${unprocessedArticles.length} articles`);

      for (const article of unprocessedArticles) {
        await this.processArticleSentiment(article.id);
        
        // Add small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } catch (error) {
      logger.error('Error processing unprocessed articles:', error);
      throw error;
    }
  }

  /**
   * Get sentiment statistics
   */
  async getSentimentStats(timeframe: string = '24h'): Promise<any> {
    try {
      const hours = timeframe === '24h' ? 24 : timeframe === '7d' ? 168 : 720; // 30d
      const since = new Date(Date.now() - hours * 60 * 60 * 1000);

      const stats = await this.prisma.article.groupBy({
        by: ['sentimentLabel'],
        where: {
          publishedAt: { gte: since },
          isProcessed: true,
          sentimentLabel: { not: null },
        },
        _count: { sentimentLabel: true },
        _avg: { sentimentScore: true },
      });

      return stats;
    } catch (error) {
      logger.error('Error getting sentiment stats:', error);
      throw error;
    }
  }
}

export default SentimentService;
