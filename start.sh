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
export NODE_ENV=${NODE_ENV:-production}

# Make Python files executable
chmod +x policy_recommend.py
chmod +x upsell_predictor.py
chmod +x chatbot_server.py
chmod +x wsgi.py

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

    # Keep the script running
    wait $APP_PID
else
    # Start in development mode
    node app.js
fi
chmod +x chatbot_server.py
chmod +x wsgi.py

echo "Starting the application..."
# Start the application with PM2 for better process management
if [ "$NODE_ENV" = "production" ]; then
    # Install PM2 globally if not already installed
    npm install -g pm2
    
    # Start Flask chatbot with Gunicorn in the background
    pm2 start "gunicorn -c gunicorn.conf.py wsgi:app --bind 0.0.0.0:$CHATBOT_PORT" --name "chatbot" --wait-ready
    
    # Wait for chatbot server to be ready
    sleep 5
    
    # Start the main application
    pm2 start app.js --name "sankalpa" --wait-ready
    
    # Save the PM2 process list
    pm2 save
    
    # Display logs
    pm2 logs
else
    # Development mode
    node app.js
fi
