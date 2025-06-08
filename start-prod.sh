#!/bin/bash

# Set environment variables
export NODE_ENV=production
export PORT=10000
export CHATBOT_PORT=8001
export STREAMLIT_PORT=8501

# Python optimizations
export PYTHONUNBUFFERED=1
export PYTHONDONTWRITEBYTECODE=1

# Node.js optimizations
export NODE_OPTIONS="--max-old-space-size=4096"

# Enable Python optimizations
export PYTHONOPTIMIZE=2
export PYTHONMALLOC=malloc
export MPLBACKEND=Agg

# Streamlit specific configurations
export STREAMLIT_SERVER_PORT=$STREAMLIT_PORT
export STREAMLIT_SERVER_ADDRESS=0.0.0.0
export STREAMLIT_SERVER_HEADLESS=true
export STREAMLIT_BROWSER_GATHER_USAGE_STATS=false

# Start the application
node app.js
