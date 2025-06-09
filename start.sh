#!/bin/bash

# Use Render's persistent storage or fallback to local directory
export DATA_DIR=${RENDER_EXTERNAL_STORAGE_MOUNT_PATH:-/opt/render/project/src/data}

# Create and set permissions for data directory
echo "Setting up data directory at: $DATA_DIR"
mkdir -p "$DATA_DIR"
chmod -R 777 "$DATA_DIR"

# Verify directory permissions
if [ ! -w "$DATA_DIR" ]; then
    echo "Error: Cannot write to data directory: $DATA_DIR"
    exit 1
fi

# Set environment variables
export NODE_ENV=production
export SQLITE_DB_PATH="$DATA_DIR/users.db"

# Print environment information
echo "Environment: $NODE_ENV"
echo "Data directory: $DATA_DIR"
echo "Database path: $SQLITE_DB_PATH"

# Start the application
node app.js
