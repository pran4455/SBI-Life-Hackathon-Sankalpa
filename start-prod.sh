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

# Start Streamlit first
echo "Starting Streamlit dashboard..."
streamlit run dashboard.py \
    --server.port $STREAMLIT_PORT \
    --server.address 0.0.0.0 \
    --server.baseUrlPath "/dashboard" \
    --server.headless true \
    --server.maxUploadSize 50 \
    --server.maxMessageSize 50 \
    --browser.gatherUsageStats false \
    --server.enableCORS true \
    --server.enableXsrfProtection false > /tmp/streamlit_stdout.log 2> /tmp/streamlit_stderr.log &
STREAMLIT_PID=$!

# Wait for Streamlit to start
sleep 5

# Start Flask chatbot
echo "Starting chatbot server..."
gunicorn -c gunicorn.conf.py wsgi:app --bind 0.0.0.0:$CHATBOT_PORT > /tmp/chatbot_stdout.log 2> /tmp/chatbot_stderr.log &
CHATBOT_PID=$!

# Wait for chatbot to start
sleep 5

# Start the main application
echo "Starting Node.js server..."
node app.js &
APP_PID=$!

# Monitor processes
while true; do
    if ! kill -0 $APP_PID 2>/dev/null; then
        echo "Main application died unexpectedly"
        exit 1
    fi
    if ! kill -0 $CHATBOT_PID 2>/dev/null; then
        echo "Chatbot died unexpectedly"
        exit 1
    fi
    if ! kill -0 $STREAMLIT_PID 2>/dev/null; then
        echo "Streamlit died unexpectedly"
        exit 1
    fi
    sleep 5
done
