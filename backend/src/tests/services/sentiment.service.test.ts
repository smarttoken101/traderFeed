import SentimentService from '../../services/sentiment.service';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { PrismaClient } from '@prisma/client';
import logger from '../../utils/logger';

// Mock external dependencies
jest.mock('@google/generative-ai');
jest.mock('@prisma/client');
jest.mock('../../utils/logger');

// Mock config
jest.mock('../../config', () => ({
  geminiApiKey: 'test-api-key'
}));

// Mock sentiment library
jest.mock('sentiment', () => {
  return jest.fn().mockImplementation(() => ({
    analyze: jest.fn()
  }));
});

// Mock natural library
jest.mock('natural', () => ({
  SentimentAnalyzer: jest.fn().mockImplementation(() => ({
    getSentiment: jest.fn()
  })),
  PorterStemmer: {}
}));

describe('SentimentService', () => {
  let sentimentService: SentimentService;
  let mockPrisma: jest.Mocked<PrismaClient>;
  let mockGenAI: jest.Mocked<GoogleGenerativeAI>;
  let mockModel: any;
  let mockSentimentAnalyzer: any;
  let mockNaturalAnalyzer: any;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Mock Prisma
    mockPrisma = {
      $disconnect: jest.fn(),
    } as any;
    (PrismaClient as jest.Mock).mockImplementation(() => mockPrisma);

    // Mock Gemini AI
    mockModel = {
      generateContent: jest.fn()
    };
    mockGenAI = {
      getGenerativeModel: jest.fn().mockReturnValue(mockModel)
    } as any;
    (GoogleGenerativeAI as jest.Mock).mockImplementation(() => mockGenAI);

    // Mock sentiment analyzer
    const Sentiment = require('sentiment');
    mockSentimentAnalyzer = {
      analyze: jest.fn()
    };
    (Sentiment as jest.Mock).mockImplementation(() => mockSentimentAnalyzer);

    // Mock natural analyzer
    const { SentimentAnalyzer } = require('natural');
    mockNaturalAnalyzer = {
      getSentiment: jest.fn()
    };
    (SentimentAnalyzer as jest.Mock).mockImplementation(() => mockNaturalAnalyzer);

    sentimentService = new SentimentService();
  });

  afterEach(async () => {
    await mockPrisma.$disconnect();
  });

  describe('analyzeWithVader', () => {
    it('should analyze positive sentiment correctly', async () => {
      const testText = 'This is great news for the market!';
      mockSentimentAnalyzer.analyze.mockReturnValue({
        score: 5,
        comparative: 0.5,
        tokens: ['great', 'news', 'market'],
        words: ['great'],
        positive: ['great'],
        negative: []
      });

      const result = await sentimentService.analyzeWithVader(testText);

      expect(result).toEqual({
        score: 0.5,
        label: 'positive',
        confidence: 0.5,
        method: 'vader'
      });
      expect(mockSentimentAnalyzer.analyze).toHaveBeenCalledWith(testText);
    });

    it('should analyze negative sentiment correctly', async () => {
      const testText = 'This is terrible news for traders';
      mockSentimentAnalyzer.analyze.mockReturnValue({
        score: -8,
        comparative: -0.8,
        tokens: ['terrible', 'news', 'traders'],
        words: ['terrible'],
        positive: [],
        negative: ['terrible']
      });

      const result = await sentimentService.analyzeWithVader(testText);

      expect(result).toEqual({
        score: -0.8,
        label: 'negative',
        confidence: 0.8,
        method: 'vader'
      });
    });

    it('should analyze neutral sentiment correctly', async () => {
      const testText = 'The market opened today';
      mockSentimentAnalyzer.analyze.mockReturnValue({
        score: 0,
        comparative: 0,
        tokens: ['market', 'opened', 'today'],
        words: [],
        positive: [],
        negative: []
      });

      const result = await sentimentService.analyzeWithVader(testText);

      expect(result).toEqual({
        score: 0,
        label: 'neutral',
        confidence: 0,
        method: 'vader'
      });
    });

    it('should handle extreme scores by normalizing to -1 to 1 range', async () => {
      const testText = 'Extremely positive news';
      mockSentimentAnalyzer.analyze.mockReturnValue({
        score: 15, // Very high score
        comparative: 1.5
      });

      const result = await sentimentService.analyzeWithVader(testText);

      expect(result.score).toBe(1); // Should be capped at 1
      expect(result.label).toBe('positive');
    });

    it('should handle errors during analysis', async () => {
      const testText = 'Test text';
      mockSentimentAnalyzer.analyze.mockImplementation(() => {
        throw new Error('Analysis failed');
      });

      await expect(sentimentService.analyzeWithVader(testText)).rejects.toThrow('Analysis failed');
      expect(logger.error).toHaveBeenCalledWith('Error in VADER sentiment analysis:', expect.any(Error));
    });
  });

  describe('analyzeWithNatural', () => {
    it('should analyze sentiment using Natural.js', async () => {
      const testText = 'Great trading opportunity';
      mockNaturalAnalyzer.getSentiment.mockReturnValue(0.6);

      const result = await sentimentService.analyzeWithNatural(testText);

      expect(result).toEqual({
        score: 0.6,
        label: 'positive',
        confidence: 0.6,
        method: 'natural'
      });
      expect(mockNaturalAnalyzer.getSentiment).toHaveBeenCalledWith(['great', 'trading', 'opportunity']);
    });

    it('should handle negative sentiment with Natural.js', async () => {
      const testText = 'Bad market conditions';
      mockNaturalAnalyzer.getSentiment.mockReturnValue(-0.4);

      const result = await sentimentService.analyzeWithNatural(testText);

      expect(result).toEqual({
        score: -0.4,
        label: 'negative',
        confidence: 0.4,
        method: 'natural'
      });
    });

    it('should handle neutral sentiment with Natural.js', async () => {
      const testText = 'Market update';
      mockNaturalAnalyzer.getSentiment.mockReturnValue(0);

      const result = await sentimentService.analyzeWithNatural(testText);

      expect(result).toEqual({
        score: 0,
        label: 'neutral',
        confidence: 0,
        method: 'natural'
      });
    });

    it('should handle errors during Natural analysis', async () => {
      const testText = 'Test text';
      mockNaturalAnalyzer.getSentiment.mockImplementation(() => {
        throw new Error('Natural analysis failed');
      });

      await expect(sentimentService.analyzeWithNatural(testText)).rejects.toThrow('Natural analysis failed');
      expect(logger.error).toHaveBeenCalledWith('Error in Natural sentiment analysis:', expect.any(Error));
    });
  });

  describe('analyzeWithGemini', () => {
    it('should analyze sentiment using Gemini AI', async () => {
      const testText = 'Federal Reserve announces interest rate hike';
      const mockResponse = {
        response: {
          text: () => JSON.stringify({
            score: -0.3,
            label: 'negative',
            confidence: 0.8,
            reasoning: 'Interest rate hikes typically create negative sentiment for risk assets'
          })
        }
      };
      mockModel.generateContent.mockResolvedValue(mockResponse);

      const result = await sentimentService.analyzeWithGemini(testText, 'forex');

      expect(result).toEqual({
        score: -0.3,
        label: 'negative',
        confidence: 0.8,
        method: 'gemini',
        reasoning: 'Interest rate hikes typically create negative sentiment for risk assets'
      });
      expect(mockModel.generateContent).toHaveBeenCalledWith(expect.stringContaining('forex'));
    });

    it('should handle positive sentiment with trading context', async () => {
      const testText = 'Strong employment data boosts economic outlook';
      const mockResponse = {
        response: {
          text: () => JSON.stringify({
            score: 0.7,
            label: 'positive',
            confidence: 0.9,
            reasoning: 'Strong employment data suggests economic strength, positive for currency'
          })
        }
      };
      mockModel.generateContent.mockResolvedValue(mockResponse);

      const result = await sentimentService.analyzeWithGemini(testText);

      expect(result.score).toBe(0.7);
      expect(result.label).toBe('positive');
      expect(result.confidence).toBe(0.9);
      expect(result.reasoning).toContain('economic strength');
    });

    it('should handle invalid JSON response from Gemini', async () => {
      const testText = 'Test text';
      const mockResponse = {
        response: {
          text: () => 'Invalid response without JSON'
        }
      };
      mockModel.generateContent.mockResolvedValue(mockResponse);

      await expect(sentimentService.analyzeWithGemini(testText)).rejects.toThrow('Invalid JSON response from Gemini');
    });

    it('should handle Gemini API errors', async () => {
      const testText = 'Test text';
      mockModel.generateContent.mockRejectedValue(new Error('API rate limit exceeded'));

      await expect(sentimentService.analyzeWithGemini(testText)).rejects.toThrow('API rate limit exceeded');
      expect(logger.error).toHaveBeenCalledWith('Error in Gemini sentiment analysis:', expect.any(Error));
    });

    it('should throw error when Gemini is not configured', async () => {
      // Create service without Gemini configuration
      jest.doMock('../../config', () => ({ geminiApiKey: null }));
      const { SentimentService } = require('../../services/sentiment.service');
      const serviceWithoutGemini = new SentimentService();

      await expect(serviceWithoutGemini.analyzeWithGemini('test')).rejects.toThrow('Gemini AI not configured');
    });
  });

  describe('analyzeSentiment', () => {
    it('should return Gemini result when available', async () => {
      const testText = 'Market volatility increases amid uncertainty';
      
      // Mock all analyzers
      mockSentimentAnalyzer.analyze.mockReturnValue({ score: -2 });
      mockNaturalAnalyzer.getSentiment.mockReturnValue(-0.2);
      
      const mockGeminiResponse = {
        response: {
          text: () => JSON.stringify({
            score: -0.4,
            label: 'negative',
            confidence: 0.85,
            reasoning: 'Market volatility creates negative trading sentiment'
          })
        }
      };
      mockModel.generateContent.mockResolvedValue(mockGeminiResponse);

      const result = await sentimentService.analyzeSentiment(testText, 'forex');

      expect(result.method).toBe('gemini');
      expect(result.score).toBe(-0.4);
      expect(result.reasoning).toBeDefined();
    });

    it('should use weighted average when Gemini is not available', async () => {
      // Mock config without Gemini API key
      jest.doMock('../../config', () => ({ geminiApiKey: null }));
      
      mockSentimentAnalyzer.analyze.mockReturnValue({ score: 6 }); // 0.6 normalized
      mockNaturalAnalyzer.getSentiment.mockReturnValue(0.4);

      const result = await sentimentService.analyzeSentiment('Positive market news');

      expect(result.method).toBe('vader');
      expect(result.score).toBe(0.5); // Average of 0.6 and 0.4
      expect(result.label).toBe('positive');
    });

    it('should handle partial analysis failures gracefully', async () => {
      const testText = 'Market update';
      
      // VADER fails
      mockSentimentAnalyzer.analyze.mockImplementation(() => {
        throw new Error('VADER failed');
      });
      
      // Natural succeeds
      mockNaturalAnalyzer.getSentiment.mockReturnValue(0.3);
      
      // Gemini fails
      mockModel.generateContent.mockRejectedValue(new Error('Gemini failed'));

      const result = await sentimentService.analyzeSentiment(testText);

      expect(result.score).toBe(0.3);
      expect(result.method).toBe('vader'); // Default method
      expect(logger.warn).toHaveBeenCalledTimes(2); // VADER and Gemini warnings
    });

    it('should throw error when all analysis methods fail', async () => {
      const testText = 'Test text';
      
      mockSentimentAnalyzer.analyze.mockImplementation(() => {
        throw new Error('VADER failed');
      });
      
      mockNaturalAnalyzer.getSentiment.mockImplementation(() => {
        throw new Error('Natural failed');
      });
      
      mockModel.generateContent.mockRejectedValue(new Error('Gemini failed'));

      await expect(sentimentService.analyzeSentiment(testText)).rejects.toThrow('All sentiment analysis methods failed');
    });
  });

  describe('generateTradingContext', () => {
    it('should generate trading context using Gemini AI', async () => {
      const testText = 'USD/EUR strengthens after Fed announcement';
      const sentimentResult = {
        score: 0.6,
        label: 'positive' as const,
        confidence: 0.8,
        method: 'gemini' as const
      };

      const mockResponse = {
        response: {
          text: () => JSON.stringify({
            market: 'forex',
            instruments: ['USD/EUR', 'USD/GBP'],
            timeframe: 'short-term',
            tradingImplications: 'USD strength likely to continue in near term'
          })
        }
      };
      mockModel.generateContent.mockResolvedValue(mockResponse);

      const result = await sentimentService.generateTradingContext(testText, sentimentResult);

      expect(result).toEqual({
        market: 'forex',
        instruments: ['USD/EUR', 'USD/GBP'],
        timeframe: 'short-term',
        tradingImplications: 'USD strength likely to continue in near term'
      });
    });

    it('should return null when Gemini is not configured', async () => {
      jest.doMock('../../config', () => ({ geminiApiKey: null }));
      const { SentimentService } = require('../../services/sentiment.service');
      const serviceWithoutGemini = new SentimentService();

      const sentimentResult = {
        score: 0.5,
        label: 'positive' as const,
        confidence: 0.7,
        method: 'vader' as const
      };

      const result = await serviceWithoutGemini.generateTradingContext('test', sentimentResult);
      expect(result).toBeNull();
    });

    it('should handle Gemini API errors gracefully', async () => {
      const testText = 'Market news';
      const sentimentResult = {
        score: 0.2,
        label: 'positive' as const,
        confidence: 0.6,
        method: 'gemini' as const
      };

      mockModel.generateContent.mockRejectedValue(new Error('Context generation failed'));

      await expect(sentimentService.generateTradingContext(testText, sentimentResult))
        .rejects.toThrow('Context generation failed');
    });
  });

  describe('Market-specific analysis', () => {
    it('should handle forex market sentiment correctly', async () => {
      const forexNews = 'ECB raises interest rates by 0.5%';
      mockSentimentAnalyzer.analyze.mockReturnValue({ score: -3 });

      const result = await sentimentService.analyzeWithVader(forexNews);
      
      expect(result.score).toBe(-0.3);
      expect(result.label).toBe('negative');
    });

    it('should handle crypto market sentiment correctly', async () => {
      const cryptoNews = 'Bitcoin adoption increases among institutions';
      mockSentimentAnalyzer.analyze.mockReturnValue({ score: 8 });

      const result = await sentimentService.analyzeWithVader(cryptoNews);
      
      expect(result.score).toBe(0.8);
      expect(result.label).toBe('positive');
    });

    it('should handle commodity market sentiment correctly', async () => {
      const commodityNews = 'Oil prices surge due to supply concerns';
      mockSentimentAnalyzer.analyze.mockReturnValue({ score: 4 });

      const result = await sentimentService.analyzeWithVader(commodityNews);
      
      expect(result.score).toBe(0.4);
      expect(result.label).toBe('positive');
    });
  });

  describe('Error handling and edge cases', () => {
    it('should handle empty text input', async () => {
      mockSentimentAnalyzer.analyze.mockReturnValue({ score: 0 });

      const result = await sentimentService.analyzeWithVader('');
      
      expect(result.score).toBe(0);
      expect(result.label).toBe('neutral');
    });

    it('should handle very long text input', async () => {
      const longText = 'This is a very long market analysis report. '.repeat(100);
      mockSentimentAnalyzer.analyze.mockReturnValue({ score: 5 });

      const result = await sentimentService.analyzeWithVader(longText);
      
      expect(result.score).toBe(0.5);
      expect(result.label).toBe('positive');
    });

    it('should handle special characters and symbols', async () => {
      const textWithSymbols = 'USD/EUR @ 1.0500 📈 +2.5% bullish signal!';
      mockSentimentAnalyzer.analyze.mockReturnValue({ score: 6 });

      const result = await sentimentService.analyzeWithVader(textWithSymbols);
      
      expect(result.score).toBe(0.6);
      expect(result.label).toBe('positive');
    });
  });
});
