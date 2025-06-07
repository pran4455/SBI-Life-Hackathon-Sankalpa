#!/bin/bash

# Create storage directory if it doesn't exist
if [ -n "$RENDER_STORAGE_PATH" ]; then
    echo "Setting up storage directory..."
    mkdir -p $RENDER_STORAGE_PATH

    # Initialize database if it doesn't exist
    if [ ! -f "$RENDER_STORAGE_PATH/users.db" ]; then
        echo "Initializing database..."
        # Copy existing database if it exists
        if [ -f "users.db" ]; then
            cp users.db $RENDER_STORAGE_PATH/
        else
            node -e "require('./dbsetup.js').initDB()"
        fi
    fi

    # Copy Excel file to storage if it doesn't exist
    if [ ! -f "$RENDER_STORAGE_PATH/sbilife.xlsx" ]; then
        echo "Copying Excel file to storage..."
        cp sbilife.xlsx $RENDER_STORAGE_PATH/
    fi

    # Create symbolic link for the database
    ln -sf $RENDER_STORAGE_PATH/users.db ./users.db
    ln -sf $RENDER_STORAGE_PATH/sbilife.xlsx ./sbilife.xlsx
fi

# Make Python files executable
chmod +x policy_recommend.py
chmod +x upsell_predictor.py
chmod +x chatbot_server.py
chmod +x wsgi.py

echo "Starting the application..."
# Start the application with PM2 for better process management
if [ "$NODE_ENV" = "production" ]; then
    # Install PM2 globally if not already installed
    npm install -g pm2
    
    # Start Flask chatbot with Gunicorn in the background
    pm2 start "gunicorn -c gunicorn.conf.py wsgi:app" --name "chatbot"
    
    # Start the main application
    pm2 start app.js --name "sankalpa"
    
    # Save the PM2 process list
    pm2 save
    
    # Display logs
    pm2 logs
else
    # Development mode
    node app.js
fi
