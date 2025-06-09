#!/bin/bash

# Setup storage directory
if [ -n "$RENDER_STORAGE_PATH" ]; then
    echo "Setting up storage directory..."
    mkdir -p "$RENDER_STORAGE_PATH"
    
    # Initialize database
    echo "Initializing database..."
    node -e "require('./dbSetup.js').initDB()"

    # Copy Excel file to storage if it doesn't exist
    if [ ! -f "$RENDER_STORAGE_PATH/sbilife.xlsx" ]; then
        echo "Copying Excel file to storage..."
        cp sbilife.xlsx "$RENDER_STORAGE_PATH/"
    fi

    # Create symbolic links
    ln -sf "$RENDER_STORAGE_PATH/users.db" ./users.db
    ln -sf "$RENDER_STORAGE_PATH/sbilife.xlsx" ./sbilife.xlsx
fi

# Set environment variables with defaults
export PORT=${PORT:-10000}
export CHATBOT_PORT=${CHATBOT_PORT:-8001}
export STREAMLIT_PORT=${STREAMLIT_PORT:-8501}
export NODE_ENV=${NODE_ENV:-production}

# Make Python files executable
chmod +x policy_recommend.py
chmod +x upsell_predictor.py
chmod +x chatbot_server.py
chmod +x wsgi.py
chmod +x dashboard.py

echo "Starting the application..."
if [ "$NODE_ENV" = "production" ]; then
    echo "Starting in production mode..."
    
    # Install curl if not present
    which curl || { apt-get update && apt-get install -y curl; }
    
    # Start the main application
    echo "Starting Node.js server on port $PORT..."
    node app.js &
    APP_PID=$!
    
    # Wait for up to 120 seconds for the server to start
    echo "Waiting for server to become available..."
    COUNTER=0
    while [ $COUNTER -lt 120 ]; do
        echo "Attempt $COUNTER: Checking server health..."
        if curl -s "http://localhost:$PORT/healthz" > /dev/null; then
            echo "Server is up and running!"
            break
        fi
        
        # Check if process is still running
        if ! kill -0 $APP_PID 2>/dev/null; then
            echo "Server process died unexpectedly"
            exit 1
        fi
        
        sleep 2
        let COUNTER=COUNTER+1
    done

    if [ $COUNTER -ge 120 ]; then
        echo "Server failed to start within 240 seconds"
        kill -9 $APP_PID 2>/dev/null
        exit 1
    fi

    # Start Flask chatbot with Gunicorn in the background
    echo "Starting chatbot server on port $CHATBOT_PORT..."
    gunicorn -c gunicorn.conf.py wsgi:app --bind 0.0.0.0:$CHATBOT_PORT &
    CHATBOT_PID=$!

    # Start Streamlit dashboard in the background
    echo "Starting Streamlit dashboard on port $STREAMLIT_PORT..."
    streamlit run dashboard.py \
        --server.port $STREAMLIT_PORT \
        --server.address 0.0.0.0 \
        --server.headless true \
        --server.maxUploadSize 50 \
        --server.maxMessageSize 50 \
        --browser.gatherUsageStats false \
        --server.enableCORS true \
        --server.enableXsrfProtection false &
    STREAMLIT_PID=$!

    # Wait for all processes
#    wait $APP_PID $CHATBOT_PID $STREAMLIT_PID
else
    # Development mode
    node app.js
fi
