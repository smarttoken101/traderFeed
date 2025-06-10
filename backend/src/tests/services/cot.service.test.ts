import { COTService } from '../../services/cot.service';
import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import logger from '../../utils/logger';

// Mock dependencies
jest.mock('@prisma/client');
jest.mock('axios');
jest.mock('../../utils/logger');

// Mock data
const mockCotData = {
  id: 'cot-123',
  reportDate: new Date('2025-06-01'),
  instrumentCode: 'EURUSD',
  instrumentName: 'Euro FX',
  commercialLong: 75000,
  commercialShort: 65000,
  commercialNet: 10000,
  noncommercialLong: 45000,
  noncommercialShort: 55000,
  noncommercialNet: -10000,
  managedMoneyLong: 30000,
  managedMoneyShort: 25000,
  netPositionPercentile: 65.5,
  positionChange: 5000,
  sentiment: 'bullish',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockCotAnalysis = {
  instrumentCode: 'EURUSD',
  instrumentName: 'Euro FX',
  currentPositioning: {
    commercialNet: 10000,
    noncommercialNet: -10000,
    managedMoneyNet: 5000,
  },
  historicalPercentile: 65.5,
  weeklyChange: 5000,
  sentiment: 'bullish' as const,
  signal: 'buy' as const,
  confidence: 0.75,
  analysis: 'Commercial traders are net long with strong positioning...',
};

const mockCotSummary = {
  lastUpdated: new Date(),
  totalInstruments: 25,
  bullishSignals: 10,
  bearishSignals: 8,
  neutralSignals: 7,
  topMoversBullish: [
    { instrument: 'EURUSD', change: 5000 },
    { instrument: 'GBPUSD', change: 3000 },
  ],
  topMoversBearish: [
    { instrument: 'USDJPY', change: -4000 },
    { instrument: 'GC', change: -2000 },
  ],
};

describe('COTService', () => {
  let cotService: COTService;
  let mockPrisma: jest.Mocked<PrismaClient>;
  let mockAxios: jest.Mocked<typeof axios>;

  beforeEach(() => {
    // Setup mocks
    mockPrisma = {
      cOTData: {
        findMany: jest.fn(),
        create: jest.fn(),
        createMany: jest.fn(),
        update: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        deleteMany: jest.fn(),
        groupBy: jest.fn(),
      },
      $transaction: jest.fn(),
      $disconnect: jest.fn(),
    } as any;

    mockAxios = axios as jest.Mocked<typeof axios>;

    cotService = new COTService();
    (cotService as any).prisma = mockPrisma;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('downloadCotData', () => {
    it('should generate mock COT data for current year', async () => {
      const result = await cotService.downloadCotData();

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      
      // Check structure of first record
      const firstRecord = result[0];
      expect(firstRecord).toHaveProperty('reportDate');
      expect(firstRecord).toHaveProperty('instrumentCode');
      expect(firstRecord).toHaveProperty('instrumentName');
      expect(firstRecord).toHaveProperty('commercialLong');
      expect(firstRecord).toHaveProperty('commercialShort');
      expect(firstRecord).toHaveProperty('commercialNet');
    });

    it('should generate mock COT data for specific year', async () => {
      const result = await cotService.downloadCotData(2024);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Downloading COT data for year 2024')
      );
    });

    it('should handle download errors', async () => {
      // Mock the private generateMockCotData method to throw an error
      jest.spyOn(cotService as any, 'generateMockCotData').mockImplementation(() => {
        throw new Error('Mock data generation failed');
      });

      await expect(cotService.downloadCotData()).rejects.toThrow('Mock data generation failed');
      
      expect(logger.error).toHaveBeenCalledWith(
        'Error downloading COT data:',
        expect.any(Error)
      );
    });
  });

  describe('storeCotData', () => {
    it('should store COT data records in database', async () => {
      const mockRecords = [
        {
          reportDate: new Date('2025-06-01'),
          instrumentCode: 'EURUSD',
          instrumentName: 'Euro FX',
          commercialLong: 75000,
          commercialShort: 65000,
          commercialNet: 10000,
          noncommercialLong: 45000,
          noncommercialShort: 55000,
          noncommercialNet: -10000,
        }
      ];

      mockPrisma.cOTData.createMany.mockResolvedValue({ count: 1 });

      await cotService.storeCotData(mockRecords);

      expect(mockPrisma.cOTData.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            instrumentCode: 'EURUSD',
            instrumentName: 'Euro FX',
            commercialNet: 10000,
          })
        ]),
        skipDuplicates: true,
      });
    });

    it('should handle storage errors', async () => {
      const mockRecords = [mockCotData as any];
      
      mockPrisma.cOTData.createMany.mockRejectedValue(new Error('Database error'));

      await expect(cotService.storeCotData(mockRecords)).rejects.toThrow('Database error');
      
      expect(logger.error).toHaveBeenCalledWith(
        'Error storing COT data:',
        expect.any(Error)
      );
    });
  });

  describe('getCotData', () => {
    it('should retrieve COT data with default parameters', async () => {
      mockPrisma.cOTData.findMany.mockResolvedValue([mockCotData]);

      const result = await cotService.getCotData();

      expect(mockPrisma.cOTData.findMany).toHaveBeenCalledWith({
        orderBy: { reportDate: 'desc' },
        take: 100,
        skip: 0,
      });
      expect(result).toEqual([mockCotData]);
    });

    it('should apply filters correctly', async () => {
      mockPrisma.cOTData.findMany.mockResolvedValue([mockCotData]);

      const filters = {
        instrumentCode: 'EURUSD',
        dateFrom: new Date('2025-01-01'),
        dateTo: new Date('2025-06-01'),
        limit: 50,
        offset: 10,
      };

      await cotService.getCotData(filters);

      expect(mockPrisma.cOTData.findMany).toHaveBeenCalledWith({
        where: {
          instrumentCode: 'EURUSD',
          reportDate: {
            gte: filters.dateFrom,
            lte: filters.dateTo,
          },
        },
        orderBy: { reportDate: 'desc' },
        take: 50,
        skip: 10,
      });
    });

    it('should handle database errors', async () => {
      mockPrisma.cOTData.findMany.mockRejectedValue(new Error('Database connection failed'));

      await expect(cotService.getCotData()).rejects.toThrow('Database connection failed');
    });
  });

  describe('getLatestCotData', () => {
    it('should retrieve latest COT data for instrument', async () => {
      mockPrisma.cOTData.findFirst.mockResolvedValue(mockCotData);

      const result = await cotService.getLatestCotData('EURUSD');

      expect(mockPrisma.cOTData.findFirst).toHaveBeenCalledWith({
        where: { instrumentCode: 'EURUSD' },
        orderBy: { reportDate: 'desc' },
      });
      expect(result).toEqual(mockCotData);
    });

    it('should return null for non-existent instrument', async () => {
      mockPrisma.cOTData.findFirst.mockResolvedValue(null);

      const result = await cotService.getLatestCotData('UNKNOWN');

      expect(result).toBeNull();
    });
  });

  describe('calculatePercentiles', () => {
    it('should calculate historical percentiles for positioning data', async () => {
      const mockHistoricalData = [
        { commercialNet: 5000, reportDate: new Date('2025-01-01') },
        { commercialNet: 10000, reportDate: new Date('2025-02-01') },
        { commercialNet: 15000, reportDate: new Date('2025-03-01') },
        { commercialNet: 8000, reportDate: new Date('2025-04-01') },
        { commercialNet: 12000, reportDate: new Date('2025-05-01') },
      ];

      mockPrisma.cOTData.findMany.mockResolvedValue(mockHistoricalData as any);

      const result = await cotService.calculatePercentiles('EURUSD', 10000);

      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(100);
      expect(mockPrisma.cOTData.findMany).toHaveBeenCalledWith({
        where: { instrumentCode: 'EURUSD' },
        select: { commercialNet: true, reportDate: true },
        orderBy: { reportDate: 'desc' },
        take: 260, // 5 years of weekly data
      });
    });

    it('should handle empty historical data', async () => {
      mockPrisma.cOTData.findMany.mockResolvedValue([]);

      const result = await cotService.calculatePercentiles('UNKNOWN', 10000);

      expect(result).toBe(50); // Default to 50th percentile
    });
  });

  describe('analyzeCotData', () => {
    it('should analyze COT data and return analysis', async () => {
      // Mock current and historical data
      mockPrisma.cOTData.findFirst.mockResolvedValue(mockCotData);
      mockPrisma.cOTData.findMany.mockResolvedValue([
        { ...mockCotData, reportDate: new Date('2025-05-25'), commercialNet: 5000 }
      ] as any);

      jest.spyOn(cotService, 'calculatePercentiles').mockResolvedValue(65.5);

      const result = await cotService.analyzeCotData('EURUSD');

      expect(result.instrumentCode).toBe('EURUSD');
      expect(result.sentiment).toMatch(/bullish|bearish|neutral/);
      expect(result.signal).toMatch(/buy|sell|hold/);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(typeof result.analysis).toBe('string');
    });

    it('should return null for non-existent instrument', async () => {
      mockPrisma.cOTData.findFirst.mockResolvedValue(null);

      const result = await cotService.analyzeCotData('UNKNOWN');

      expect(result).toBeNull();
    });
  });

  describe('getCotSummary', () => {
    it('should generate COT market summary', async () => {
      // Mock data for summary generation
      const mockInstruments = ['EURUSD', 'GBPUSD', 'USDJPY'];
      mockPrisma.cOTData.groupBy.mockResolvedValue(
        mockInstruments.map(code => ({ instrumentCode: code })) as any
      );

      jest.spyOn(cotService, 'analyzeCotData')
        .mockResolvedValueOnce({ ...mockCotAnalysis, signal: 'buy' })
        .mockResolvedValueOnce({ ...mockCotAnalysis, signal: 'sell', instrumentCode: 'GBPUSD' })
        .mockResolvedValueOnce({ ...mockCotAnalysis, signal: 'hold', instrumentCode: 'USDJPY' });

      const result = await cotService.getCotSummary();

      expect(result.totalInstruments).toBe(3);
      expect(result.bullishSignals).toBe(1);
      expect(result.bearishSignals).toBe(1);
      expect(result.neutralSignals).toBe(1);
      expect(result.lastUpdated).toBeInstanceOf(Date);
    });

    it('should handle analysis errors gracefully', async () => {
      const mockInstruments = ['EURUSD', 'UNKNOWN'];
      mockPrisma.cOTData.groupBy.mockResolvedValue(
        mockInstruments.map(code => ({ instrumentCode: code })) as any
      );

      jest.spyOn(cotService, 'analyzeCotData')
        .mockResolvedValueOnce(mockCotAnalysis)
        .mockResolvedValueOnce(null); // Failed analysis

      const result = await cotService.getCotSummary();

      expect(result.totalInstruments).toBe(1); // Only successful analysis counted
    });
  });

  describe('getInstrumentMappings', () => {
    it('should return available instrument mappings', () => {
      const result = cotService.getInstrumentMappings();

      expect(typeof result).toBe('object');
      expect(result).toHaveProperty('EURUSD');
      expect(result).toHaveProperty('GC');
      expect(result.EURUSD).toHaveProperty('code');
      expect(result.EURUSD).toHaveProperty('name');
    });
  });

  describe('updateCotData', () => {
    it('should download and store new COT data', async () => {
      jest.spyOn(cotService, 'downloadCotData').mockResolvedValue([mockCotData as any]);
      jest.spyOn(cotService, 'storeCotData').mockResolvedValue();

      await cotService.updateCotData();

      expect(cotService.downloadCotData).toHaveBeenCalled();
      expect(cotService.storeCotData).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('COT data update completed successfully');
    });

    it('should handle update errors', async () => {
      jest.spyOn(cotService, 'downloadCotData').mockRejectedValue(new Error('Download failed'));

      await expect(cotService.updateCotData()).rejects.toThrow('Download failed');
      
      expect(logger.error).toHaveBeenCalledWith(
        'Error updating COT data:',
        expect.any(Error)
      );
    });
  });

  describe('generateTradingSignals', () => {
    it('should generate trading signals based on COT analysis', async () => {
      jest.spyOn(cotService, 'analyzeCotData').mockResolvedValue(mockCotAnalysis);

      const result = await cotService.generateTradingSignals('EURUSD');

      expect(result).toHaveProperty('signal');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('reasoning');
      expect(result.signal).toMatch(/buy|sell|hold/);
    });

    it('should return neutral signal for failed analysis', async () => {
      jest.spyOn(cotService, 'analyzeCotData').mockResolvedValue(null);

      const result = await cotService.generateTradingSignals('UNKNOWN');

      expect(result.signal).toBe('hold');
      expect(result.confidence).toBe(0);
    });
  });
});
