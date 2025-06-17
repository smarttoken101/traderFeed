import axios from 'axios';
import { PrismaClient } from '@prisma/client';
import JSZip from 'jszip';
import Papa from 'papaparse';
import logger from '../utils/logger';

const prisma = new PrismaClient();

export interface CotDataRecord {
  reportDate: Date;
  instrumentCode: string;
  instrumentName: string;
  
  // Legacy COT data
  commercialLong?: number;
  commercialShort?: number;
  commercialNet?: number;
  noncommercialLong?: number;
  noncommercialShort?: number;
  noncommercialNet?: number;
  nonreportableLong?: number;
  nonreportableShort?: number;
  nonreportableNet?: number;
  
  // Disaggregated COT data
  producerLong?: number;
  producerShort?: number;
  swapLong?: number;
  swapShort?: number;
  managedMoneyLong?: number;
  managedMoneyShort?: number;
  otherReportableLong?: number;
  otherReportableShort?: number;
  
  // Analysis fields
  netPositionPercentile?: number;
  positionChange?: number;
  sentiment?: string;
}

export interface CotAnalysis {
  instrumentCode: string;
  instrumentName: string;
  currentPositioning: {
    commercialNet: number;
    noncommercialNet: number;
    managedMoneyNet?: number;
  };
  historicalPercentile: number;
  weeklyChange: number;
  sentiment: 'bullish' | 'bearish' | 'neutral';
  signal: 'buy' | 'sell' | 'hold';
  confidence: number;
  analysis: string;
}

export interface CotSummary {
  lastUpdated: Date;
  totalInstruments: number;
  bullishSignals: number;
  bearishSignals: number;
  neutralSignals: number;
  topMoversBullish: Array<{ instrument: string; change: number }>;
  topMoversBearish: Array<{ instrument: string; change: number }>;
}

export class COTService {
  private cftcBaseUrl = 'https://www.cftc.gov/files/dea/history';
  
  // CFTC instrument mappings
  private instrumentMappings = {
    // Currencies
    'EURUSD': { code: '099741', name: 'Euro FX' },
    'GBPUSD': { code: '096742', name: 'British Pound' },
    'USDJPY': { code: '097741', name: 'Japanese Yen' },
    'AUDUSD': { code: '232741', name: 'Australian Dollar' },
    'USDCAD': { code: '090741', name: 'Canadian Dollar' },
    'USDCHF': { code: '092741', name: 'Swiss Franc' },
    'NZDUSD': { code: '112741', name: 'New Zealand Dollar' },
    
    // Commodities
    'GC': { code: '088691', name: 'Gold' },
    'SI': { code: '084691', name: 'Silver' },
    'CL': { code: '067651', name: 'Crude Oil, Light Sweet' },
    'NG': { code: '023651', name: 'Natural Gas' },
    'HG': { code: '085692', name: 'Copper' },
    
    // Grains
    'ZW': { code: '001612', name: 'Wheat' },
    'ZC': { code: '002602', name: 'Corn' },
    'ZS': { code: '005602', name: 'Soybeans' },
    'ZL': { code: '007601', name: 'Soybean Oil' },
    'ZM': { code: '026603', name: 'Soybean Meal' },
    
    // Indices
    'ES': { code: '138741', name: 'E-mini S&P 500' },
    'NQ': { code: '209742', name: 'E-mini Nasdaq 100' },
    'YM': { code: '124603', name: 'E-mini Dow Jones' },
    'VIX': { code: '1170E1', name: 'VIX' }
  };

  /**
   * Download and parse COT data from CFTC
   */
  async downloadCotData(year?: number): Promise<ArrayBuffer> {
    try {
      const currentYear = year || new Date().getFullYear();
      const url = `${this.cftcBaseUrl}/fut_disagg_txt_${currentYear}.zip`;
      
      logger.info(`Downloading COT data for year ${currentYear} from ${url}`);
      
      const response = await axios.get(url, { responseType: 'arraybuffer' });

      logger.info(`Successfully downloaded COT data for year ${currentYear}`);
      return response.data;
      
    } catch (error) {
      logger.error(`Error downloading COT data for year ${currentYear}:`, error);
      // It's generally better to throw a new error with a clear message
      // or handle specific axios errors if needed.
      throw new Error(`Failed to download COT data from ${url}. Original error: ${error.message}`);
    }
  }

  /**
   * Parses CSV data from a ZIP buffer.
   * @param zipBuffer The ArrayBuffer containing the ZIP data.
   * @returns A Promise resolving to the CSV data as a string.
   */
  private async parseCotCsvFromZip(zipBuffer: ArrayBuffer): Promise<string> {
    try {
      const zip = await JSZip.loadAsync(zipBuffer);
      const targetFileName = 'fut_disagg_txt.csv'; // Typical name for CFTC disaggregated data
      let csvFile = null;

      logger.info('Files found in ZIP archive:');
      for (const filename in zip.files) {
        logger.info(`- ${filename}`);
        // Using endsWith as some archives might have a parent folder e.g. "dea/"
        if (filename.toLowerCase().endsWith(targetFileName)) {
          csvFile = zip.files[filename];
          break;
        }
      }

      if (csvFile) {
        logger.info(`Found COT CSV file: ${csvFile.name}`);
        const csvData = await csvFile.async('string');
        logger.info(`Successfully extracted CSV data (first 500 chars): ${csvData.substring(0, 500)}`);
        return csvData;
      } else {
        logger.error(`Target CSV file '${targetFileName}' not found in the ZIP archive.`);
        throw new Error('COT CSV file not found in the downloaded ZIP archive.');
      }
    } catch (error) {
      logger.error('Error parsing COT CSV from ZIP:', error);
      throw new Error(`Failed to parse COT CSV from ZIP. Original error: ${error.message}`);
    }
  }

  /**
   * Parses CSV data string and maps it to an array of CotDataRecord objects.
   * @param csvData The raw CSV data as a string.
   * @returns An array of CotDataRecord objects.
   */
  private parseCsvDataAndMapToRecords(csvData: string): CotDataRecord[] {
    const records: CotDataRecord[] = [];
    // Standardized column names based on typical CFTC Disaggregated Futures Only reports
    // Check parsedResult.meta.fields for actual names if issues arise.
    const dateCol = 'Report_Date_as_YYYY-MM-DD'; // Or 'As_of_Date_In_Form_YYMMDD'
    const marketNameCol = 'Market_and_Exchange_Names';

    // Disaggregated fields
    const prodMercLongCol = 'Prod_Merc_Positions_Long_ALL';
    const prodMercShortCol = 'Prod_Merc_Positions_Short_ALL';
    const swapLongCol = 'Swap__Positions_Long_All'; // Note: CFTC sometimes has double underscore
    const swapShortCol = 'Swap__Positions_Short_All';
    const mMoneyLongCol = 'M_Money_Positions_Long_ALL';
    const mMoneyShortCol = 'M_Money_Positions_Short_ALL';
    const otherReptLongCol = 'Other_Rept_Positions_Long_ALL';
    const otherReptShortCol = 'Other_Rept_Positions_Short_ALL';

    // Legacy fields (if needed, map them similarly)
    // const commLongCol = 'Comm_Positions_Long_ALL';
    // const commShortCol = 'Comm_Positions_Short_ALL';
    // const nonCommLongCol = 'NonComm_Positions_Long_ALL';
    // const nonCommShortCol = 'NonComm_Positions_Short_ALL';
    // const nonReptLongCol = 'NonRept_Positions_Long_ALL';
    // const nonReptShortCol = 'NonRept_Positions_Short_ALL';


    try {
      const parsedResult = Papa.parse(csvData, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
      });

      if (parsedResult.errors && parsedResult.errors.length > 0) {
        logger.warn('CSV parsing errors found:', parsedResult.errors);
      }

      logger.info(`CSV Headers: ${parsedResult.meta.fields?.join(', ')}`);
      logger.info(`Parsed ${parsedResult.data.length} rows from CSV.`);

      for (const row of parsedResult.data as any[]) {
        const csvMarketName = row[marketNameCol] as string;
        if (!csvMarketName) {
          // logger.warn('Skipping row due to missing Market_and_Exchange_Names:', row);
          continue;
        }

        let matchedInstrument: { code: string; name: string } | null = null;
        for (const instrumentKey in this.instrumentMappings) {
          const mapping = this.instrumentMappings[instrumentKey as keyof typeof this.instrumentMappings];
          // Robust matching: case-insensitive and check if our mapping name is part of the long CSV name
          if (csvMarketName.toUpperCase().includes(mapping.name.toUpperCase())) {
            matchedInstrument = { code: instrumentKey, name: mapping.name };
            break;
          }
        }

        if (matchedInstrument) {
          try {
            const reportDateStr = row[dateCol] as string;
            // CFTC date format is YYYY-MM-DD, which is directly parsable by new Date()
            // If format was YYMMDD, it would need transformation:
            // const year = parseInt(reportDateStr.substring(0, 2), 10) + 2000;
            // const month = parseInt(reportDateStr.substring(2, 4), 10) - 1; // JS months are 0-indexed
            // const day = parseInt(reportDateStr.substring(4, 6), 10);
            // const reportDate = new Date(year, month, day);
            const reportDate = new Date(reportDateStr);


            const record: CotDataRecord = {
              reportDate,
              instrumentCode: matchedInstrument.code,
              instrumentName: matchedInstrument.name,
              producerLong: parseFloat(row[prodMercLongCol]) || 0,
              producerShort: parseFloat(row[prodMercShortCol]) || 0,
              swapLong: parseFloat(row[swapLongCol]) || 0,
              swapShort: parseFloat(row[swapShortCol]) || 0,
              managedMoneyLong: parseFloat(row[mMoneyLongCol]) || 0,
              managedMoneyShort: parseFloat(row[mMoneyShortCol]) || 0,
              otherReportableLong: parseFloat(row[otherReptLongCol]) || 0,
              otherReportableShort: parseFloat(row[otherReptShortCol]) || 0,
              // commercialLong, commercialShort, etc. can be calculated if needed
              // or mapped if legacy fields are present and required.
            };
            records.push(record);
          } catch (mapError) {
            logger.warn(`Error mapping row for ${csvMarketName} (matched to ${matchedInstrument.name}):`, mapError, row);
          }
        } else {
          // Only log if it's not a header/footer or clearly irrelevant row
          if (csvMarketName && csvMarketName.length > 5) { // Basic filter for relevance
             // logger.debug(`No instrument mapping found for CSV row: ${csvMarketName.substring(0,50)}...`);
          }
        }
      }
      logger.info(`Successfully mapped ${records.length} records from CSV data.`);
    } catch (error) {
      logger.error('Error parsing CSV data with PapaParse:', error);
      throw new Error(`Failed to parse CSV data. Original error: ${error.message}`);
    }
    return records;
  }

  /**
   * Generate mock COT data for testing
   */
  private generateMockCotData(): CotDataRecord[] {
    const data: CotDataRecord[] = [];
    const instruments = Object.keys(this.instrumentMappings);
    
    // Generate last 52 weeks of data
    for (let week = 0; week < 52; week++) {
      const reportDate = new Date();
      reportDate.setDate(reportDate.getDate() - (week * 7));
      
      for (const instrumentCode of instruments) {
        const mapping = this.instrumentMappings[instrumentCode as keyof typeof this.instrumentMappings];
        
        // Generate realistic random data
        const commercialLong = Math.floor(Math.random() * 100000) + 50000;
        const commercialShort = Math.floor(Math.random() * 100000) + 50000;
        const noncommercialLong = Math.floor(Math.random() * 80000) + 30000;
        const noncommercialShort = Math.floor(Math.random() * 80000) + 30000;
        const managedMoneyLong = Math.floor(Math.random() * 60000) + 20000;
        const managedMoneyShort = Math.floor(Math.random() * 60000) + 20000;
        
        data.push({
          reportDate,
          instrumentCode,
          instrumentName: mapping.name,
          commercialLong,
          commercialShort,
          commercialNet: commercialLong - commercialShort,
          noncommercialLong,
          noncommercialShort,
          noncommercialNet: noncommercialLong - noncommercialShort,
          managedMoneyLong,
          managedMoneyShort,
          netPositionPercentile: Math.random() * 100,
          positionChange: Math.floor((Math.random() - 0.5) * 10000),
          sentiment: Math.random() > 0.5 ? 'bullish' : Math.random() > 0.25 ? 'bearish' : 'neutral'
        });
      }
    }
    
    return data;
  }

  /**
   * Process and store COT data in database
   */
  async processCotData(cotData: CotDataRecord[]): Promise<void> {
    try {
      logger.info(`Processing ${cotData.length} COT data records`);
      
      for (const record of cotData) {
        try {
          await prisma.cotData.upsert({
            where: {
              reportDate_instrumentCode: {
                reportDate: record.reportDate,
                instrumentCode: record.instrumentCode
              }
            },
            update: {
              instrumentName: record.instrumentName,
              commercialLong: record.commercialLong,
              commercialShort: record.commercialShort,
              commercialNet: record.commercialNet,
              noncommercialLong: record.noncommercialLong,
              noncommercialShort: record.noncommercialShort,
              noncommercialNet: record.noncommercialNet,
              nonreportableLong: record.nonreportableLong,
              nonreportableShort: record.nonreportableShort,
              nonreportableNet: record.nonreportableNet,
              producerLong: record.producerLong,
              producerShort: record.producerShort,
              swapLong: record.swapLong,
              swapShort: record.swapShort,
              managedMoneyLong: record.managedMoneyLong,
              managedMoneyShort: record.managedMoneyShort,
              otherReportableLong: record.otherReportableLong,
              otherReportableShort: record.otherReportableShort,
              netPositionPercentile: record.netPositionPercentile,
              positionChange: record.positionChange,
              sentiment: record.sentiment
            },
            create: {
              reportDate: record.reportDate,
              instrumentCode: record.instrumentCode,
              instrumentName: record.instrumentName,
              commercialLong: record.commercialLong,
              commercialShort: record.commercialShort,
              commercialNet: record.commercialNet,
              noncommercialLong: record.noncommercialLong,
              noncommercialShort: record.noncommercialShort,
              noncommercialNet: record.noncommercialNet,
              nonreportableLong: record.nonreportableLong,
              nonreportableShort: record.nonreportableShort,
              nonreportableNet: record.nonreportableNet,
              producerLong: record.producerLong,
              producerShort: record.producerShort,
              swapLong: record.swapLong,
              swapShort: record.swapShort,
              managedMoneyLong: record.managedMoneyLong,
              managedMoneyShort: record.managedMoneyShort,
              otherReportableLong: record.otherReportableLong,
              otherReportableShort: record.otherReportableShort,
              netPositionPercentile: record.netPositionPercentile,
              positionChange: record.positionChange,
              sentiment: record.sentiment
            }
          });
        } catch (error) {
          logger.error(`Error processing COT record for ${record.instrumentCode}:`, error);
        }
      }
      
      logger.info('COT data processing completed');
    } catch (error) {
      logger.error('Error in processCotData:', error);
      throw error;
    }
  }

  /**
   * Analyze COT positioning for a specific instrument
   */
  async analyzeCotPositioning(instrumentCode: string, lookbackWeeks: number = 52): Promise<CotAnalysis | null> {
    try {
      const cotData = await prisma.cotData.findMany({
        where: { instrumentCode },
        orderBy: { reportDate: 'desc' },
        take: lookbackWeeks
      });

      if (cotData.length === 0) {
        return null;
      }

      const latest = cotData[0];
      const historical = cotData.slice(1);

      // Calculate historical percentile
      const commercialNets = historical.map(d => d.commercialNet || 0);
      const currentCommercialNet = latest.commercialNet || 0;
      const lowerCount = commercialNets.filter(net => net < currentCommercialNet).length;
      const percentile = (lowerCount / commercialNets.length) * 100;

      // Calculate weekly change
      const weeklyChange = cotData.length > 1 ? 
        (latest.commercialNet || 0) - (cotData[1].commercialNet || 0) : 0;

      // Determine sentiment and signal
      let sentiment: 'bullish' | 'bearish' | 'neutral' = 'neutral';
      let signal: 'buy' | 'sell' | 'hold' = 'hold';
      let confidence = 0;

      if (percentile > 75) {
        sentiment = 'bullish';
        signal = 'buy';
        confidence = Math.min(90, 60 + (percentile - 75));
      } else if (percentile < 25) {
        sentiment = 'bearish';
        signal = 'sell';
        confidence = Math.min(90, 60 + (25 - percentile));
      } else {
        confidence = 50 - Math.abs(percentile - 50);
      }

      const analysis = this.generateAnalysisText(latest, percentile, weeklyChange, sentiment);

      return {
        instrumentCode,
        instrumentName: latest.instrumentName,
        currentPositioning: {
          commercialNet: latest.commercialNet || 0,
          noncommercialNet: latest.noncommercialNet || 0,
          managedMoneyNet: (latest.managedMoneyLong || 0) - (latest.managedMoneyShort || 0)
        },
        historicalPercentile: percentile,
        weeklyChange,
        sentiment,
        signal,
        confidence,
        analysis
      };

    } catch (error) {
      logger.error(`Error analyzing COT positioning for ${instrumentCode}:`, error);
      throw error;
    }
  }

  /**
   * Generate analysis text
   */
  private generateAnalysisText(
    latest: any, 
    percentile: number, 
    weeklyChange: number, 
    sentiment: string
  ): string {
    const instrument = latest.instrumentName;
    const commercialNet = latest.commercialNet || 0;
    const direction = commercialNet > 0 ? 'long' : 'short';
    const strength = percentile > 75 ? 'strongly' : percentile > 60 ? 'moderately' : 'slightly';
    
    let analysis = `Commercial traders are currently net ${direction} in ${instrument}. `;
    analysis += `This positioning is at the ${percentile.toFixed(1)}th percentile of the past year, `;
    analysis += `indicating ${strength} ${sentiment} positioning. `;
    
    if (weeklyChange !== 0) {
      const changeDirection = weeklyChange > 0 ? 'increased' : 'decreased';
      analysis += `Net positioning has ${changeDirection} by ${Math.abs(weeklyChange).toLocaleString()} contracts this week. `;
    }
    
    if (sentiment === 'bullish') {
      analysis += 'This suggests potential upward pressure on prices.';
    } else if (sentiment === 'bearish') {
      analysis += 'This suggests potential downward pressure on prices.';
    } else {
      analysis += 'Current positioning suggests neutral market sentiment.';
    }
    
    return analysis;
  }

  /**
   * Get COT data for a specific instrument
   */
  async getCotData(instrumentCode: string, limit: number = 52): Promise<any[]> {
    try {
      return await prisma.cotData.findMany({
        where: { instrumentCode },
        orderBy: { reportDate: 'desc' },
        take: limit
      });
    } catch (error) {
      logger.error(`Error getting COT data for ${instrumentCode}:`, error);
      throw error;
    }
  }

  /**
   * Get COT summary for all instruments
   */
  async getCotSummary(): Promise<CotSummary> {
    try {
      const latestData = await prisma.cotData.findMany({
        where: {
          reportDate: {
            gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) // Last 2 weeks
          }
        },
        orderBy: { reportDate: 'desc' }
      });

      // Group by instrument and get latest for each
      const latestByInstrument = new Map();
      latestData.forEach(record => {
        if (!latestByInstrument.has(record.instrumentCode) || 
            record.reportDate > latestByInstrument.get(record.instrumentCode).reportDate) {
          latestByInstrument.set(record.instrumentCode, record);
        }
      });

      const instruments = Array.from(latestByInstrument.values());
      
      let bullishSignals = 0;
      let bearishSignals = 0;
      let neutralSignals = 0;

      const movers: Array<{ instrument: string; change: number; sentiment: string }> = [];

      for (const instrument of instruments) {
        const sentiment = instrument.sentiment || 'neutral';
        
        if (sentiment === 'bullish') bullishSignals++;
        else if (sentiment === 'bearish') bearishSignals++;
        else neutralSignals++;

        movers.push({
          instrument: instrument.instrumentCode,
          change: instrument.positionChange || 0,
          sentiment
        });
      }

      // Sort movers by absolute change
      movers.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));

      return {
        lastUpdated: new Date(),
        totalInstruments: instruments.length,
        bullishSignals,
        bearishSignals,
        neutralSignals,
        topMoversBullish: movers
          .filter(m => m.change > 0)
          .slice(0, 5)
          .map(m => ({ instrument: m.instrument, change: m.change })),
        topMoversBearish: movers
          .filter(m => m.change < 0)
          .slice(0, 5)
          .map(m => ({ instrument: m.instrument, change: Math.abs(m.change) }))
      };

    } catch (error) {
      logger.error('Error getting COT summary:', error);
      throw error;
    }
  }

  /**
   * Get COT trading signals
   */
  async getCotTradingSignals(): Promise<any[]> {
    try {
      const signals = [];
      const instruments = Object.keys(this.instrumentMappings);

      for (const instrumentCode of instruments) {
        const analysis = await this.analyzeCotPositioning(instrumentCode, 52);
        
        if (analysis && analysis.signal !== 'hold' && analysis.confidence > 60) {
          signals.push({
            instrument: instrumentCode,
            instrumentName: analysis.instrumentName,
            signal: analysis.signal,
            confidence: analysis.confidence,
            sentiment: analysis.sentiment,
            percentile: analysis.historicalPercentile,
            weeklyChange: analysis.weeklyChange,
            reasoning: analysis.analysis
          });
        }
      }

      // Sort by confidence
      return signals.sort((a, b) => b.confidence - a.confidence);

    } catch (error) {
      logger.error('Error getting COT trading signals:', error);
      throw error;
    }
  }

  /**
   * Process mock COT data for testing
   */
  async processMockCotData(): Promise<void> {
    try {
      logger.info('Processing mock COT data...');
      const mockData = this.generateMockCotData();
      await this.processCotData(mockData);
      logger.info('Mock COT data processing completed');
    } catch (error) {
      logger.error('Error processing mock COT data:', error);
      throw error;
    }
  }

  /**
   * Get available instruments
   */
  getAvailableInstruments(): Array<{ code: string; name: string }> {
    return Object.entries(this.instrumentMappings).map(([code, info]) => ({
      code,
      name: info.name
    }));
  }

  /**
   * Update COT data weekly (this would be called by a cron job)
   */
  async updateWeeklyCotData(): Promise<void> {
    try {
      logger.info('Starting weekly COT data update...');
      
      const currentYear = new Date().getFullYear();
      // Step 1: Download the ZIP file
      const zipBuffer = await this.downloadCotData(currentYear);

      // Step 2: Extract CSV string from ZIP
      const csvString = await this.parseCotCsvFromZip(zipBuffer);
      logger.info('Successfully extracted CSV data from ZIP.');

      // Step 3: Parse CSV string and map to records
      const cotRecords = this.parseCsvDataAndMapToRecords(csvString);
      logger.info(`Successfully parsed ${cotRecords.length} COT records from CSV string.`);

      // Step 4: Process and store COT records
      if (cotRecords.length > 0) {
        await this.processCotData(cotRecords);
        logger.info('Weekly COT data update completed and data processed.');
      } else {
        logger.info('Weekly COT data update: No records were mapped. Nothing to process.');
      }
      
    } catch (error) {
      logger.error('Error in weekly COT data update:', error);
      throw error;
    }
  }

  /**
   * Alias for updateWeeklyCotData - for backward compatibility
   */
  async processWeeklyCotData(): Promise<void> {
    return this.updateWeeklyCotData();
  }

  /**
   * Process all COT data - alias for backward compatibility
   */
  async processAllCotData(): Promise<void> {
    return this.updateWeeklyCotData();
  }
}

export default new COTService();