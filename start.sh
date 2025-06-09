#!/bin/bash

# Create data directory if it doesn't exist
mkdir -p /opt/render/project/src/data

# Set proper permissions
chmod 777 /opt/render/project/src/data

# Set environment variables
export DATA_DIR=/opt/render/project/src/data
export NODE_ENV=production

# Start the application
node app.js
