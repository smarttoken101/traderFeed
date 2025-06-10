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
    res.json(summary);
  } catch (error) {
    logger.error('Error fetching COT summary:', error);
    res.status(500).json({ error: 'Failed to fetch COT summary' });
  }
});

/**
 * GET /api/cot/signals - Get COT trading signals
 */
router.get('/signals', async (req: Request, res: Response) => {
  try {
    const signals = await cotService.getCotTradingSignals();
    res.json(signals);
  } catch (error) {
    logger.error('Error fetching COT signals:', error);
    res.status(500).json({ error: 'Failed to fetch COT signals' });
  }
});

/**
 * GET /api/cot/:instrument - Get COT data for specific instrument
 */
router.get('/:instrument', async (req: Request, res: Response) => {
  try {
    const { instrument } = req.params;
    const { limit = 52 } = req.query;

    // Map instrument to CFTC code (this would be expanded)
    const instrumentMapping: any = {
      'EURUSD': '099741',
      'GBPUSD': '096742',
      'USDJPY': '097741',
      'GC': '088691',
      'CL': '067651',
      'ES': '138741',
    };

    const cftcCode = instrumentMapping[instrument.toUpperCase()];
    if (!cftcCode) {
      res.status(400).json({ error: 'Instrument not supported' });
      return;
    }

    const data = await cotService.getCotData(cftcCode, parseInt(limit as string));
    
    res.json({
      instrument: instrument.toUpperCase(),
      data,
    });
  } catch (error) {
    logger.error('Error fetching COT data for instrument:', error);
    res.status(500).json({ error: 'Failed to fetch COT data' });
  }
});

/**
 * POST /api/cot/analyze/:instrument - Analyze COT positioning for instrument
 */
router.post('/analyze/:instrument', async (req: Request, res: Response) => {
  try {
    const { instrument } = req.params;
    const { lookbackWeeks = 52 } = req.body;

    const instrumentMapping: any = {
      'EURUSD': '099741',
      'GBPUSD': '096742',
      'USDJPY': '097741',
      'GC': '088691',
      'CL': '067651',
      'ES': '138741',
    };

    const cftcCode = instrumentMapping[instrument.toUpperCase()];
    if (!cftcCode) {
      res.status(400).json({ error: 'Instrument not supported' });
      return;
    }

    const analysis = await cotService.analyzeCotPositioning(cftcCode, lookbackWeeks);
    
    if (!analysis) {
      res.status(404).json({ error: 'Insufficient data for analysis' });
      return;
    }

    res.json({
      instrument: instrument.toUpperCase(),
      analysis,
    });
  } catch (error) {
    logger.error('Error analyzing COT positioning:', error);
    res.status(500).json({ error: 'Failed to analyze COT positioning' });
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

    res.json({ message: 'COT data update started' });
  } catch (error) {
    logger.error('Error starting COT update:', error);
    res.status(500).json({ error: 'Failed to start COT update' });
  }
});

export default router;
