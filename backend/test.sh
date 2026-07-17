#!/bin/bash
# Quick test script for reel generator

echo "MindStream Reel Generator Test"
echo "==============================="
echo ""

# Check Python
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 not found"
    exit 1
fi

# Check venv
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate
source venv/bin/activate

# Install deps
echo "Installing dependencies..."
pip install -q -r requirements.txt 2>/dev/null

# Check and set default API keys if not present
if [ -z "$GEMINI_API_KEY" ]; then
    echo "🔑 Using default GEMINI_API_KEY"
    export GEMINI_API_KEY='AQ.Ab8RN6LPTpCWct4ApZgO7wMwSAVxG1LMQC8jS6ntoc6TGh97Ig'
fi

if [ -z "$PEXELS_API_KEY" ]; then
    echo "🔑 Using default PEXELS_API_KEY"
    export PEXELS_API_KEY='REDACTED_PEXELS_KEY'
fi

# Run test
echo ""
echo "Running reel generator..."
python reel_generator.py

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Success! Play with:"
    echo "   mpv output/reels/sample-job-001.mp4"
else
    echo ""
    echo "❌ Failed - check errors above"
fi
