#!/bin/bash

echo "Testing COT API endpoints..."
echo "=========================================="

# Test COT Summary
echo "1. Testing COT Summary:"
curl -s http://localhost:3001/api/cot/summary | jq '.totalInstruments'
echo

# Test COT Signals
echo "2. Testing COT Signals:"
curl -s http://localhost:3001/api/cot/signals | jq 'length'
echo

# Test Individual Instrument Data
echo "3. Testing Individual Instrument (EURUSD):"
curl -s http://localhost:3001/api/cot/EURUSD | jq '.data | length'
echo

# Test COT Analysis
echo "4. Testing COT Analysis (EURUSD):"
curl -s -X POST -H "Content-Type: application/json" -d '{"lookbackWeeks": 52}' http://localhost:3001/api/cot/analyze/EURUSD | jq '.analysis.confidence'
echo

# Test COT Report Generation
echo "5. Testing COT Report Generation:"
curl -s "http://localhost:3001/api/cot/report?timeframe=4w" | jq '.summary.totalInstruments'
echo

# Test COT Update
echo "6. Testing COT Update Trigger:"
curl -s -X POST http://localhost:3001/api/cot/update | jq '.message'
echo

echo "=========================================="
echo "COT API testing complete!"
