#!/bin/bash

# Set environment variables
export NODE_ENV=production
export PORT=10000
export CHATBOT_PORT=8000
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

# Function to check if a service is ready with timeout
check_service() {
    local url=$1
    local max_attempts=10  # Reduced from 30 to 10
    local attempt=1
    local timeout=5  # 5 second timeout for each attempt
    
    while [ $attempt -le $max_attempts ]; do
        echo "Attempting to connect to $url (attempt $attempt/$max_attempts)..."
        if curl -s --max-time $timeout "$url" > /dev/null; then
            echo "Successfully connected to $url"
            return 0
        fi
        echo "Waiting for service at $url..."
        sleep 2
        attempt=$((attempt + 1))
    done
    echo "Failed to connect to $url after $max_attempts attempts"
    return 1
}

# Start all services in parallel
echo "Starting all services..."

# Start Streamlit
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
    --server.enableXsrfProtection false \
    --server.runOnSave false \
    --server.enableStaticServing true \
    --logger.level=error > /tmp/streamlit_stdout.log 2> /tmp/streamlit_stderr.log &
STREAMLIT_PID=$!

# Start Flask chatbot
echo "Starting chatbot server..."
gunicorn -c gunicorn.conf.py wsgi:app --bind 0.0.0.0:$CHATBOT_PORT --workers 1 --threads 2 --timeout 30 > /tmp/chatbot_stdout.log 2> /tmp/chatbot_stderr.log &
CHATBOT_PID=$!

# Start Node.js app
echo "Starting Node.js server..."
node app.js &
APP_PID=$!

# Wait for all services to be ready with a global timeout
echo "Waiting for services to be ready..."
timeout=60  # 60 second global timeout
start_time=$(date +%s)

while true; do
    current_time=$(date +%s)
    elapsed=$((current_time - start_time))
    
    if [ $elapsed -gt $timeout ]; then
        echo "Global timeout reached. Some services may not be ready."
        break
    fi
    
    # Check all services
    streamlit_ready=0
    chatbot_ready=0
    app_ready=0
    
    if curl -s --max-time 5 "http://localhost:$STREAMLIT_PORT/healthz" > /dev/null; then
        streamlit_ready=1
    fi
    
    if curl -s --max-time 5 "http://localhost:$CHATBOT_PORT/healthz" > /dev/null; then
        chatbot_ready=1
    fi
    
    if curl -s --max-time 5 "http://localhost:$PORT/healthz" > /dev/null; then
        app_ready=1
    fi
    
    if [ $streamlit_ready -eq 1 ] && [ $chatbot_ready -eq 1 ] && [ $app_ready -eq 1 ]; then
        echo "All services are ready!"
        break
    fi
    
    echo "Waiting for services... ($elapsed/$timeout seconds)"
    sleep 5
done

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
