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

# Make Python files executable
chmod +x policy_recommend.py
chmod +x upsell_predictor.py

# Start the server
if [ "$NODE_ENV" = "production" ]; then
    # Start with production settings
    NODE_ENV=production node --optimize_for_size --max_old_space_size=460 app.js
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
