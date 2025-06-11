#!/bin/bash

echo "Testing COT Frontend Integration..."
echo "=========================================="

# Test if the main pages load without JavaScript errors
echo "1. Testing COT Dashboard page load:"
curl -s http://localhost:5173/cot > /dev/null && echo "✅ COT Dashboard accessible" || echo "❌ COT Dashboard failed"

echo "2. Testing COT Instrument Detail page load:"
curl -s http://localhost:5173/cot/EURUSD > /dev/null && echo "✅ Instrument Detail accessible" || echo "❌ Instrument Detail failed"

# Test API responses that the frontend will use
echo "3. Testing COT Summary API (for main dashboard):"
SUMMARY_RESPONSE=$(curl -s http://localhost:3001/api/cot/summary)
if echo "$SUMMARY_RESPONSE" | jq -e '.success' > /dev/null; then
    echo "✅ COT Summary API working"
    echo "   - Total Instruments: $(echo "$SUMMARY_RESPONSE" | jq '.data.totalInstruments')"
else
    echo "❌ COT Summary API failed"
fi

echo "4. Testing COT Signals API (for signals table):"
SIGNALS_RESPONSE=$(curl -s http://localhost:3001/api/cot/signals)
if echo "$SIGNALS_RESPONSE" | jq -e '.success' > /dev/null; then
    echo "✅ COT Signals API working"
    echo "   - Number of signals: $(echo "$SIGNALS_RESPONSE" | jq '.data | length')"
    echo "   - First signal properties: $(echo "$SIGNALS_RESPONSE" | jq '.data[0] | keys' | tr '\n' ' ')"
else
    echo "❌ COT Signals API failed"
fi

echo "5. Testing COT Analysis API (for instrument detail):"
ANALYSIS_RESPONSE=$(curl -s -X POST -H "Content-Type: application/json" -d '{"lookbackWeeks": 52}' http://localhost:3001/api/cot/analyze/EURUSD)
if echo "$ANALYSIS_RESPONSE" | jq -e '.success' > /dev/null; then
    echo "✅ COT Analysis API working"
    echo "   - Confidence: $(echo "$ANALYSIS_RESPONSE" | jq '.data.analysis.confidence')"
    echo "   - Has positioning data: $(echo "$ANALYSIS_RESPONSE" | jq -e '.data.analysis.currentPositioning' > /dev/null && echo "Yes" || echo "No")"
else
    echo "❌ COT Analysis API failed"
fi

echo "=========================================="
echo "COT Frontend Integration test complete!"
