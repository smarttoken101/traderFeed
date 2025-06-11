#!/bin/bash

echo "Testing Fixed COT API endpoints..."
echo "=========================================="

# Test COT Summary
echo "1. Testing COT Summary (with success wrapper):"
curl -s http://localhost:3001/api/cot/summary | jq '{success: .success, totalInstruments: .data.totalInstruments}'
echo

# Test COT Signals  
echo "2. Testing COT Signals (with success wrapper):"
curl -s http://localhost:3001/api/cot/signals | jq '{success: .success, signalCount: (.data | length)}'
echo

# Test Individual Instrument Data
echo "3. Testing Individual Instrument (EURUSD):"
curl -s http://localhost:3001/api/cot/EURUSD | jq '{success: .success, instrument: .data.instrument, dataCount: (.data.data | length)}'
echo

# Test COT Analysis
echo "4. Testing COT Analysis (EURUSD):"
curl -s -X POST -H "Content-Type: application/json" -d '{"lookbackWeeks": 52}' http://localhost:3001/api/cot/analyze/EURUSD | jq '{success: .success, instrument: .data.instrument, confidence: .data.analysis.confidence}'
echo

# Test COT Report Generation
echo "5. Testing COT Report Generation:"
curl -s "http://localhost:3001/api/cot/report?timeframe=4w" | jq '{success: .success, timeframe: .data.timeframe, totalInstruments: .data.summary.totalInstruments}'
echo

# Test COT Update
echo "6. Testing COT Update Trigger:"
curl -s -X POST http://localhost:3001/api/cot/update | jq '{success: .success, message: .message}'
echo

echo "=========================================="
echo "Fixed COT API testing complete!"
