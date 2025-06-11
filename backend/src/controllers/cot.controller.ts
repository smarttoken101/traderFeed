import { Router, Request, Response } from 'express';
import cotService from '../services/cot.service';
import logger from '../utils/logger';

const router = Router();

/**
 * GET /api/cot/summary - Get COT summary for all major instruments
 */
router.get('/summary', async (req: Request, res: Response) => {
  try {
    const summary = await cotService.getCotSummary();
    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    logger.error('Error fetching COT summary:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch COT summary'
    });
  }
});

/**
 * GET /api/cot/signals - Get COT trading signals
 */
router.get('/signals', async (req: Request, res: Response) => {
  try {
    const signals = await cotService.getCotTradingSignals();
    res.json({
      success: true,
      data: signals
    });
  } catch (error) {
    logger.error('Error fetching COT signals:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch COT signals'
    });
  }
});

/**
 * GET /api/cot/report - Generate AI-powered COT analysis report
 */
router.get('/report', async (req: Request, res: Response) => {
  try {
    const { timeframe = '4w' } = req.query;
    
    // Get COT summary and signals
    const [summary, signals] = await Promise.all([
      cotService.getCotSummary(),
      cotService.getCotTradingSignals()
    ]);

    // Generate AI-powered report
    const report = generateCOTReport(summary, signals, timeframe as string);
    
    res.json({
      success: true,
      data: {
        report,
        timeframe,
        generatedAt: new Date().toISOString(),
        summary: {
          totalInstruments: summary.totalInstruments,
          bullishSignals: summary.bullishSignals,
          bearishSignals: summary.bearishSignals,
          neutralSignals: summary.neutralSignals
        }
      }
    });
  } catch (error) {
    logger.error('Error generating COT report:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate COT report'
    });
  }
});

/**
 * POST /api/cot/analyze/:instrument - Analyze COT positioning for instrument
 */
router.post('/analyze/:instrument', async (req: Request, res: Response) => {
  try {
    const { instrument } = req.params;
    const { lookbackWeeks = 52 } = req.body;

    // Use instrument code directly (the service maps internally)
    const instrumentCode = instrument.toUpperCase();
    
    // Check if instrument is supported
    const supportedInstruments = ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF', 'NZDUSD', 
                                 'GC', 'SI', 'CL', 'NG', 'HG', 'ZW', 'ZC', 'ZS', 'ZL', 'ZM', 
                                 'ES', 'NQ', 'YM', 'VIX'];
    
    if (!supportedInstruments.includes(instrumentCode)) {
      res.status(400).json({
        success: false,
        error: 'Instrument not supported'
      });
      return;
    }

    const analysis = await cotService.analyzeCotPositioning(instrumentCode, lookbackWeeks);
    
    if (!analysis) {
      res.status(404).json({
        success: false,
        error: 'Insufficient data for analysis'
      });
      return;
    }

    res.json({
      success: true,
      data: {
        instrument: instrumentCode,
        analysis,
      }
    });
  } catch (error) {
    logger.error('Error analyzing COT positioning:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to analyze COT positioning'
    });
  }
});

/**
 * POST /api/cot/update - Trigger COT data update
 */
router.post('/update', async (req: Request, res: Response) => {
  try {
    // Start COT update in background
    cotService.processMockCotData().catch((error: any) => {
      logger.error('Background COT update failed:', error);
    });

    res.json({
      success: true,
      message: 'COT data update started'
    });
  } catch (error) {
    logger.error('Error starting COT update:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start COT update'
    });
  }
});

/**
 * GET /api/cot/:instrument - Get COT data for specific instrument
 */
router.get('/:instrument', async (req: Request, res: Response) => {
  try {
    const { instrument } = req.params;
    const { limit = 52 } = req.query;

    // Use instrument code directly (the service maps internally)
    const instrumentCode = instrument.toUpperCase();
    
    // Check if instrument is supported
    const supportedInstruments = ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF', 'NZDUSD', 
                                 'GC', 'SI', 'CL', 'NG', 'HG', 'ZW', 'ZC', 'ZS', 'ZL', 'ZM', 
                                 'ES', 'NQ', 'YM', 'VIX'];
    
    if (!supportedInstruments.includes(instrumentCode)) {
      res.status(400).json({
        success: false,
        error: 'Instrument not supported'
      });
      return;
    }

    const data = await cotService.getCotData(instrumentCode, parseInt(limit as string));
    
    res.json({
      success: true,
      data: {
        instrument: instrumentCode,
        data,
      }
    });
  } catch (error) {
    logger.error('Error fetching COT data for instrument:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch COT data'
    });
  }
});

/**
 * Generate comprehensive COT analysis report
 */
function generateCOTReport(summary: any, signals: any[], timeframe: string): string {
  const timeframeLabels: Record<string, string> = {
    '1w': '1 Week',
    '4w': '4 Weeks',
    '12w': '12 Weeks'
  };

  const currentDate = new Date().toLocaleDateString();
  let report = `COT (Commitment of Traders) Analysis Report\n`;
  report += `Generated: ${currentDate}\n`;
  report += `Analysis Period: ${timeframeLabels[timeframe] || timeframe}\n`;
  report += `Last Updated: ${new Date(summary.lastUpdated).toLocaleDateString()}\n`;
  report += `=================================================\n\n`;

  // Executive Summary
  report += `EXECUTIVE SUMMARY\n`;
  report += `-----------------\n`;
  report += `Total Instruments: ${summary.totalInstruments}\n`;
  report += `Bullish Signals: ${summary.bullishSignals} (${((summary.bullishSignals / summary.totalInstruments) * 100).toFixed(1)}%)\n`;
  report += `Bearish Signals: ${summary.bearishSignals} (${((summary.bearishSignals / summary.totalInstruments) * 100).toFixed(1)}%)\n`;
  report += `Neutral Signals: ${summary.neutralSignals} (${((summary.neutralSignals / summary.totalInstruments) * 100).toFixed(1)}%)\n\n`;

  // Market Overview
  const bullishPercentage = (summary.bullishSignals / summary.totalInstruments) * 100;
  const bearishPercentage = (summary.bearishSignals / summary.totalInstruments) * 100;
  
  report += `MARKET SENTIMENT ANALYSIS\n`;
  report += `-------------------------\n`;
  
  if (bullishPercentage > 50) {
    report += `Overall Market Sentiment: BULLISH BIAS\n`;
    report += `The COT data reveals a predominantly bullish sentiment across major instruments. `;
    report += `With ${summary.bullishSignals} out of ${summary.totalInstruments} instruments showing bullish positioning, `;
    report += `institutional traders appear to be positioning for higher prices across multiple asset classes.\n\n`;
  } else if (bearishPercentage > 50) {
    report += `Overall Market Sentiment: BEARISH BIAS\n`;
    report += `The COT data indicates a predominantly bearish sentiment across major instruments. `;
    report += `With ${summary.bearishSignals} out of ${summary.totalInstruments} instruments showing bearish positioning, `;
    report += `institutional traders appear to be positioned for lower prices or defensive strategies.\n\n`;
  } else {
    report += `Overall Market Sentiment: MIXED/NEUTRAL\n`;
    report += `The COT data shows a balanced market with no clear directional bias. `;
    report += `This suggests institutional traders are taking selective positions rather than broad market views.\n\n`;
  }

  // High Confidence Signals
  const highConfidenceSignals = signals.filter(signal => signal.confidence >= 70);
  if (highConfidenceSignals.length > 0) {
    report += `HIGH CONFIDENCE TRADING OPPORTUNITIES\n`;
    report += `====================================\n`;
    
    highConfidenceSignals.forEach(signal => {
      report += `\n${signal.instrument} - ${signal.instrumentName}\n`;
      report += `${'='.repeat(signal.instrument.length + signal.instrumentName.length + 3)}\n`;
      report += `Signal: ${signal.signal.toUpperCase()}\n`;
      report += `Confidence Level: ${signal.confidence}%\n`;
      report += `Market Sentiment: ${signal.sentiment.toUpperCase()}\n`;
      report += `Historical Percentile: ${signal.percentile.toFixed(1)}%\n`;
      report += `Weekly Position Change: ${signal.weeklyChange >= 0 ? '+' : ''}${signal.weeklyChange.toLocaleString()} contracts\n`;
      report += `\nAnalysis: ${signal.reasoning}\n`;
      report += `\n${'─'.repeat(60)}\n`;
    });
    report += `\n`;
  }

  // Category Analysis
  const currencies = signals.filter(s => ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF', 'NZDUSD'].includes(s.instrument));
  const commodities = signals.filter(s => ['GC', 'SI', 'CL', 'NG', 'HG', 'ZW', 'ZC', 'ZS', 'ZL', 'ZM'].includes(s.instrument));
  const indices = signals.filter(s => ['ES', 'NQ', 'YM', 'VIX'].includes(s.instrument));

  report += `SECTOR ANALYSIS\n`;
  report += `===============\n`;

  if (currencies.length > 0) {
    const currencyBullish = currencies.filter(s => s.sentiment === 'bullish').length;
    const currencyBearish = currencies.filter(s => s.sentiment === 'bearish').length;
    report += `\nCURRENCY MARKETS (${currencies.length} pairs)\n`;
    report += `${'-'.repeat(20)}\n`;
    report += `Bullish: ${currencyBullish} | Bearish: ${currencyBearish} | Neutral: ${currencies.length - currencyBullish - currencyBearish}\n`;
    if (currencyBullish > currencyBearish) {
      report += `Currency markets show a risk-on sentiment with traders positioning for growth currencies.\n`;
    } else if (currencyBearish > currencyBullish) {
      report += `Currency markets show defensive positioning with traders favoring safe-haven currencies.\n`;
    }
    currencies.forEach(signal => {
      report += `${signal.instrument}: ${signal.signal.toUpperCase()} (${signal.confidence}%) - ${signal.sentiment}\n`;
    });
    report += `\n`;
  }

  if (commodities.length > 0) {
    const commodityBullish = commodities.filter(s => s.sentiment === 'bullish').length;
    const commodityBearish = commodities.filter(s => s.sentiment === 'bearish').length;
    report += `COMMODITY MARKETS (${commodities.length} instruments)\n`;
    report += `${'-'.repeat(25)}\n`;
    report += `Bullish: ${commodityBullish} | Bearish: ${commodityBearish} | Neutral: ${commodities.length - commodityBullish - commodityBearish}\n`;
    if (commodityBullish > commodityBearish) {
      report += `Commodity markets show inflationary expectations with traders positioning for higher prices.\n`;
    } else if (commodityBearish > commodityBullish) {
      report += `Commodity markets show deflationary concerns with traders positioned for lower prices.\n`;
    }
    commodities.forEach(signal => {
      report += `${signal.instrument}: ${signal.signal.toUpperCase()} (${signal.confidence}%) - ${signal.sentiment}\n`;
    });
    report += `\n`;
  }

  if (indices.length > 0) {
    const indexBullish = indices.filter(s => s.sentiment === 'bullish').length;
    const indexBearish = indices.filter(s => s.sentiment === 'bearish').length;
    report += `EQUITY INDEX MARKETS (${indices.length} instruments)\n`;
    report += `${'-'.repeat(30)}\n`;
    report += `Bullish: ${indexBullish} | Bearish: ${indexBearish} | Neutral: ${indices.length - indexBullish - indexBearish}\n`;
    if (indexBullish > indexBearish) {
      report += `Equity markets show institutional bullishness with positioning for higher stock prices.\n`;
    } else if (indexBearish > indexBullish) {
      report += `Equity markets show institutional caution with defensive positioning.\n`;
    }
    indices.forEach(signal => {
      report += `${signal.instrument}: ${signal.signal.toUpperCase()} (${signal.confidence}%) - ${signal.sentiment}\n`;
    });
    report += `\n`;
  }

  // Key Insights
  report += `KEY MARKET INSIGHTS\n`;
  report += `==================\n`;
  
  // Analyze top movers
  if (summary.topMoversBullish && summary.topMoversBullish.length > 0) {
    report += `\nTop Bullish Momentum:\n`;
    summary.topMoversBullish.slice(0, 3).forEach((mover: any, index: number) => {
      report += `${index + 1}. ${mover.instrument}: +${mover.change.toLocaleString()} contracts - Strong institutional accumulation\n`;
    });
  }

  if (summary.topMoversBearish && summary.topMoversBearish.length > 0) {
    report += `\nTop Bearish Momentum:\n`;
    summary.topMoversBearish.slice(0, 3).forEach((mover: any, index: number) => {
      report += `${index + 1}. ${mover.instrument}: -${mover.change.toLocaleString()} contracts - Significant institutional distribution\n`;
    });
  }

  // Trading Recommendations
  report += `\nTRADING CONSIDERATIONS\n`;
  report += `=====================\n`;
  report += `• COT data reflects institutional positioning and can provide contrarian signals\n`;
  report += `• High confidence signals (70%+) deserve special attention for trade setup\n`;
  report += `• Consider position sizing based on confidence levels and market volatility\n`;
  report += `• Monitor weekly changes in positioning for trend confirmation or reversal signals\n`;
  report += `• Combine COT analysis with technical analysis for optimal entry/exit timing\n\n`;

  // Disclaimers
  report += `IMPORTANT DISCLAIMERS\n`;
  report += `====================\n`;
  report += `• COT data is released with a 3-day delay and represents Tuesday positions\n`;
  report += `• Commercial traders hedge business risk and may not reflect directional views\n`;
  report += `• Past positioning patterns do not guarantee future price movements\n`;
  report += `• This analysis is for educational purposes and not investment advice\n`;
  report += `• Always conduct your own analysis and manage risk appropriately\n\n`;

  report += `Report generated by TradeFeed COT Analysis System\n`;
  report += `Data Source: CFTC Commitment of Traders Reports\n`;
  report += `For more detailed analysis, visit: ${process.env.FRONTEND_URL || 'http://localhost:5173'}/cot\n`;

  return report;
}

export default router;
