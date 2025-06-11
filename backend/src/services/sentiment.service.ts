import { GoogleGenerativeAI } from '@google/generative-ai';
import { PrismaClient } from '@prisma/client';
import { pipeline } from '@xenova/transformers';
import logger from '../utils/logger';
import config from '../config';

// Rate limiting for Gemini API (only used for report generation now)
class GeminiRateLimiter {
  private requests: number[] = [];
  private readonly maxRequests = 8; // Conservative limit below the 10/minute quota
  private readonly windowMs = 60 * 1000; // 1 minute window

  async waitForSlot(): Promise<void> {
    const now = Date.now();
    
    // Remove old requests outside the window
    this.requests = this.requests.filter(time => now - time < this.windowMs);
    
    // If we're at the limit, wait until we can make another request
    if (this.requests.length >= this.maxRequests) {
      const oldestRequest = Math.min(...this.requests);
      const waitTime = this.windowMs - (now - oldestRequest) + 1000; // Add 1 second buffer
      
      logger.info(`Rate limit reached for Gemini API. Waiting ${Math.round(waitTime/1000)}s`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      
      // Clean up expired requests after waiting
      const newNow = Date.now();
      this.requests = this.requests.filter(time => newNow - time < this.windowMs);
    }
    
    // Record this request
    this.requests.push(now);
  }

  getStatus(): { available: number; resetIn: number } {
    const now = Date.now();
    this.requests = this.requests.filter(time => now - time < this.windowMs);
    
    const available = Math.max(0, this.maxRequests - this.requests.length);
    const resetIn = this.requests.length > 0 
      ? Math.max(0, this.windowMs - (now - Math.min(...this.requests)))
      : 0;
    
    return { available, resetIn: Math.round(resetIn / 1000) };
  }
}

interface SentimentResult {
  score: number; // -1 to 1
  label: 'positive' | 'negative' | 'neutral';
  confidence: number;
  method: 'huggingface-finbert' | 'huggingface-cardiffnlp';
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
  private geminiRateLimiter = new GeminiRateLimiter();
  private sentimentPipeline?: any;
  private finbertPipeline?: any;

  constructor() {
    // Initialize Gemini AI (only for report generation)
    if (config.geminiApiKey) {
      this.genAI = new GoogleGenerativeAI(config.geminiApiKey);
    }

    // Initialize Hugging Face pipelines
    this.initializeHuggingFacePipelines();
  }

  /**
   * Initialize Hugging Face sentiment analysis pipelines
   */
  private async initializeHuggingFacePipelines(): Promise<void> {
    try {
      // Initialize general sentiment pipeline (CardiffNLP)
      this.sentimentPipeline = await pipeline(
        'sentiment-analysis',
        'Xenova/distilbert-base-uncased-finetuned-sst-2-english'
      );
      
      // Initialize financial sentiment pipeline (FinBERT alternative)
      this.finbertPipeline = await pipeline(
        'sentiment-analysis',
        'Xenova/distilbert-base-uncased-finetuned-sst-2-english'
      );
      
      logger.info('Hugging Face sentiment analysis pipelines initialized successfully');
    } catch (error) {
      logger.error('Error initializing Hugging Face pipelines:', error);
    }
  }

  /**
   * Analyze sentiment using Hugging Face FinBERT-style model
   */
  async analyzeWithFinBERT(text: string): Promise<SentimentResult> {
    try {
      if (!this.finbertPipeline) {
        throw new Error('FinBERT pipeline not initialized');
      }

      const result = await this.finbertPipeline(text);
      
      if (!result || !Array.isArray(result) || result.length === 0) {
        throw new Error('Invalid response from FinBERT model');
      }

      // DistilBERT returns: POSITIVE, NEGATIVE
      const prediction = result[0];
      const confidence = prediction.score;
      
      // Convert to our standard format
      let score: number;
      let label: 'positive' | 'negative' | 'neutral';
      
      if (prediction.label === 'POSITIVE') {
        score = confidence;
        label = 'positive';
      } else if (prediction.label === 'NEGATIVE') {
        score = -confidence;
        label = 'negative';
      } else {
        score = 0;
        label = 'neutral';
      }

      return {
        score,
        label,
        confidence,
        method: 'huggingface-finbert',
      };
    } catch (error) {
      logger.error('Error in FinBERT sentiment analysis:', error);
      throw error;
    }
  }

  /**
   * Analyze sentiment using Hugging Face CardiffNLP-style model
   */
  async analyzeWithCardiffNLP(text: string): Promise<SentimentResult> {
    try {
      if (!this.sentimentPipeline) {
        throw new Error('CardiffNLP pipeline not initialized');
      }

      const result = await this.sentimentPipeline(text);
      
      if (!result || !Array.isArray(result) || result.length === 0) {
        throw new Error('Invalid response from CardiffNLP model');
      }

      // DistilBERT returns: POSITIVE, NEGATIVE
      const prediction = result[0];
      const confidence = prediction.score;
      
      // Convert to our standard format
      let score: number;
      let label: 'positive' | 'negative' | 'neutral';
      
      if (prediction.label === 'POSITIVE') {
        score = confidence;
        label = 'positive';
      } else if (prediction.label === 'NEGATIVE') {
        score = -confidence;
        label = 'negative';
      } else {
        score = 0;
        label = 'neutral';
      }

      return {
        score,
        label,
        confidence,
        method: 'huggingface-cardiffnlp',
      };
    } catch (error) {
      logger.error('Error in CardiffNLP sentiment analysis:', error);
      throw error;
    }
  }



  /**
   * Retry function with exponential backoff for API calls
   */
  private async retryWithExponentialBackoff<T>(
    fn: () => Promise<T>,
    maxRetries: number,
    initialDelay: number
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        
        // Check if it's a rate limit error
        if (error instanceof Error && error.message.includes('quota')) {
          logger.warn(`Gemini API rate limit hit on attempt ${attempt + 1}/${maxRetries + 1}`);
          
          if (attempt < maxRetries) {
            const delay = initialDelay * Math.pow(2, attempt) + Math.random() * 1000;
            logger.info(`Retrying in ${Math.round(delay)}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
        }
        
        // If it's not a rate limit error or we've exhausted retries, throw
        if (attempt === maxRetries) {
          throw lastError;
        }
        
        // For other errors, still retry with shorter delay
        const delay = Math.min(initialDelay * Math.pow(1.5, attempt), 5000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError!;
  }

  /**
   * Get comprehensive sentiment analysis using Hugging Face models
   */
  async analyzeSentiment(text: string, market?: string): Promise<SentimentResult> {
    try {
      const results: SentimentResult[] = [];

      // Run FinBERT analysis (specialized for financial text)
      try {
        const finbertResult = await this.analyzeWithFinBERT(text);
        results.push(finbertResult);
        logger.debug(`FinBERT result: ${finbertResult.label} (${finbertResult.score.toFixed(3)})`);
      } catch (error) {
        logger.warn('FinBERT analysis failed:', error);
      }

      // Run CardiffNLP analysis as backup
      try {
        const cardiffResult = await this.analyzeWithCardiffNLP(text);
        results.push(cardiffResult);
        logger.debug(`CardiffNLP result: ${cardiffResult.label} (${cardiffResult.score.toFixed(3)})`);
      } catch (error) {
        logger.warn('CardiffNLP analysis failed:', error);
      }

      if (results.length === 0) {
        throw new Error('All Hugging Face sentiment analysis methods failed');
      }

      // Prefer FinBERT result for financial text, otherwise use average
      const finbertResult = results.find(r => r.method === 'huggingface-finbert');
      if (finbertResult) {
        return finbertResult;
      }

      // If FinBERT failed, use CardiffNLP result
      return results[0];
    } catch (error) {
      logger.error('Error in comprehensive sentiment analysis:', error);
      throw error;
    }
  }

  /**
   * Generate trading context using Gemini AI with rate limiting
   */
  async generateTradingContext(text: string, sentimentResult: SentimentResult): Promise<TradingContext | null> {
    try {
      if (!this.genAI) {
        return null;
      }

      // Wait for rate limit slot
      await this.geminiRateLimiter.waitForSlot();

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

      const result = await this.retryWithExponentialBackoff(
        async () => await model.generateContent(prompt),
        2, // fewer retries for trading context
        1000
      );
      
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

      // Analyze sentiment using Hugging Face models only
      const sentimentResult = await this.analyzeSentiment(textToAnalyze, primaryMarket);

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

      logger.info(`Processed sentiment for article ${articleId}: ${sentimentResult.label} (${sentimentResult.score.toFixed(3)})`);
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
   * Process sentiment for all unprocessed articles with Hugging Face models
   */
  async processUnprocessedArticles(): Promise<void> {
    try {
      const unprocessedArticles = await this.prisma.article.findMany({
        where: { 
          isProcessed: false,
          processingError: null,
        },
        take: 100, // Increased batch size since HF models are fast and free
        orderBy: { createdAt: 'desc' },
      });

      logger.info(`Processing sentiment for ${unprocessedArticles.length} articles using Hugging Face models`);

      if (unprocessedArticles.length === 0) {
        logger.info('No unprocessed articles found');
        return;
      }

      let processed = 0;
      let failed = 0;

      for (const article of unprocessedArticles) {
        try {
          await this.processArticleSentiment(article.id);
          processed++;
          
          // Very small delay to prevent overwhelming the system
          await new Promise(resolve => setTimeout(resolve, 100));
          
        } catch (error) {
          failed++;
          logger.error(`Failed to process article ${article.id}:`, error);
          
          // Mark this article as having an error to avoid retrying immediately
          await this.prisma.article.update({
            where: { id: article.id },
            data: {
              processingError: error instanceof Error ? error.message : 'Unknown error',
              isProcessed: true,
            },
          });
        }
      }

      logger.info(`Completed processing: ${processed} successful, ${failed} failed`);
    } catch (error) {
      logger.error('Error processing unprocessed articles:', error);
      throw error;
    }
  }

  /**
   * Generate comprehensive sentiment report using Gemini AI
   */
  async generateSentimentReport(timeframe: string = '24h'): Promise<string | null> {
    try {
      if (!this.genAI) {
        logger.warn('Gemini AI not configured, cannot generate sentiment report');
        return null;
      }

      // Get sentiment statistics for the report
      const stats = await this.getSentimentStats(timeframe);
      
      // Get recent articles with sentiment data
      const hours = timeframe === '24h' ? 24 : timeframe === '7d' ? 168 : 720;
      const since = new Date(Date.now() - hours * 60 * 60 * 1000);
      
      const recentArticles = await this.prisma.article.findMany({
        where: {
          publishedAt: { gte: since },
          isProcessed: true,
          sentimentLabel: { not: null },
        },
        select: {
          title: true,
          sentimentScore: true,
          sentimentLabel: true,
          sentimentConfidence: true,
          markets: true,
          publishedAt: true,
        },
        orderBy: { sentimentScore: 'desc' },
        take: 20, // Top 20 articles by sentiment
      });

      if (recentArticles.length === 0) {
        return 'No processed articles found for the specified timeframe.';
      }

      // Wait for rate limit slot
      await this.geminiRateLimiter.waitForSlot();

      const model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

      const prompt = `
        Generate a comprehensive sentiment analysis report for financial news over the last ${timeframe}.
        
        Sentiment Statistics:
        ${JSON.stringify(stats, null, 2)}
        
        Recent Articles Sample (Top 20 by sentiment):
        ${JSON.stringify(recentArticles.map(a => ({
          title: a.title,
          sentiment: a.sentimentLabel,
          score: a.sentimentScore,
          confidence: a.sentimentConfidence,
          markets: a.markets,
          date: a.publishedAt
        })), null, 2)}
        
        Please provide a detailed analysis including:
        1. Overall market sentiment summary
        2. Key trends and patterns observed
        3. Most significant positive and negative news items
        4. Market-specific sentiment breakdown (forex, crypto, stocks, etc.)
        5. Trading implications and recommendations
        6. Risk factors and opportunities identified
        7. Confidence level in the analysis
        
        Format the report in a clear, professional manner suitable for traders and analysts.
        Focus on actionable insights and market implications.
      `;

      const result = await this.retryWithExponentialBackoff(
        async () => await model.generateContent(prompt),
        2, // fewer retries for reports
        2000 // longer initial delay for reports
      );
      
      const report = result.response.text();
      
      logger.info(`Generated sentiment report for ${timeframe} timeframe`);
      return report;
      
    } catch (error) {
      logger.error('Error generating sentiment report:', error);
      return null;
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
