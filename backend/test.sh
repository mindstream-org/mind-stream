#!/bin/bash
# MindStream Phase 3 — Reel Generator Test
#
# Usage:
#   ./test.sh                  # Run with default sample (data/sample_emotion_result.json)
#   ./test.sh --emotion anxious --context '{"active_tab_category":"social_media",...}'
#
# How it works:
#   Phase 1 (Extension) captures browser context → POST /check-in
#   Phase 2 (Friend's script) detects emotion → writes _result.json
#   server.js combines them → spawns this script with --job-id --emotion --context
#
# This test simulates that combined output.

set -e

echo "MindStream Phase 3 — Reel Generator Test"
echo ""

# --- Python check ---
if ! command -v python3 &> /dev/null; then
    echo "ERROR: Python 3 not found"
    exit 1
fi

# --- Venv setup ---
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

source venv/bin/activate

echo "Installing dependencies..."
pip install -q -r requirements.txt 2>/dev/null

# # --- API keys (set via env or use defaults) ---
# if [ -z "$GEMINI_API_KEY" ]; then
#     echo "Using default GEMINI_API_KEY"
#     export GEMINI_API_KEY='AIzaSyBNyFh2UyLRRtBCK2P0pqr629bKPj9zWE4'
# fi

# if [ -z "$PEXELS_API_KEY" ]; then
#     echo "Using default PEXELS_API_KEY"
#     export PEXELS_API_KEY='6Vta0QamMfVjjdTA8vg2AhdKrFGDBIs7SdFLYT2cnDWvSQqki3xeuU2v'
# fi

# echo ""

# --- Run ---
if [ $# -gt 0 ]; then
    # Custom args passed — forward to reel_generator.py
    echo "Running with custom args: $@"
    python reel_generator.py "$@"
else
    # No args — run with default sample data
    echo "Running with default sample: data/sample_emotion_result.json"
    # echo "(Edit this file to change emotion/context)"
    echo ""
    python reel_generator.py
fi

echo ""

# --- Check result ---
if [ $? -eq 0 ]; then
    echo "SUCCESS — reel saved to output/reels/"
else
    echo "FAILED — check errors above"
    exit 1
fi
