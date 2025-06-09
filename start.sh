#!/bin/bash

# Use Render's persistent storage
export DATA_DIR=${RENDER_EXTERNAL_STORAGE_MOUNT_PATH:-/opt/render/project/src/data}

mkdir -p "$DATA_DIR"
chmod -R 777 "$DATA_DIR"

# Set environment variables
export NODE_ENV=production

# Start the application
node app.js
