#!/bin/bash

# Ensure the data directory exists
mkdir -p /data

# Copy SQLite database if it doesn't exist in persistent storage
if [ ! -f "/data/users.db" ]; then
    echo "Initializing database in persistent storage..."
    node -e "require('./dbsetup.js').initDB()"
fi

# Copy Excel file to persistent storage
if [ ! -f "/data/sbilife.xlsx" ]; then
    echo "Copying Excel file to persistent storage..."
    cp sbilife.xlsx /data/
fi
