#!/bin/bash

# Use persistent path
DATA_DIR=${RENDER_EXTERNAL_STORAGE_MOUNT_PATH:-/data}
mkdir -p "$DATA_DIR"

if [ ! -f "$DATA_DIR/users.db" ]; then
    echo "Initializing database in persistent storage..."
    node -e "require('./dbsetup.js').initDB('$DATA_DIR/users.db')"
fi

if [ ! -f "$DATA_DIR/sbilife.xlsx" ]; then
    echo "Copying Excel file to persistent storage..."
    cp sbilife.xlsx "$DATA_DIR/"
fi
