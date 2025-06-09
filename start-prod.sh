#!/bin/bash

# Set environment variables
export NODE_ENV=production
export PORT=10000
export CHATBOT_PORT=8001
export STREAMLIT_PORT=8501

# Python optimizations for memory efficiency
export PYTHONOPTIMIZE=2
export PYTHONUNBUFFERED=1
export PYTHONDONTWRITEBYTECODE=1
export PYTHONMALLOC=malloc
export MPLBACKEND=Agg
export MALLOC_TRIM_THRESHOLD_=65536
export PYTHONHASHSEED=0
export PYTHONIOENCODING=utf-8

# Node.js optimizations for free tier
export NODE_OPTIONS="--max-old-space-size=256 --optimize-for-size"
export UV_THREADPOOL_SIZE=1

# Streamlit optimizations
export STREAMLIT_SERVER_HEADLESS=true
export STREAMLIT_BROWSER_GATHER_USAGE_STATS=false
export STREAMLIT_SERVER_ENABLE_CORS=true
export STREAMLIT_SERVER_ENABLE_XSRF_PROTECTION=false
export STREAMLIT_SERVER_MAX_UPLOAD_SIZE=50
export STREAMLIT_SERVER_MAX_MESSAGE_SIZE=50
export DATA_DIR=/opt/render/project/src/data
# Start the application
node app.js
