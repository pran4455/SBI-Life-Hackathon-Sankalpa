#!/bin/bash

# Set production environment
export NODE_ENV=production
export PORT=10000
export UV_THREADPOOL_SIZE=1

# Enable Node.js optimizations
export NODE_OPTIONS="--optimize_for_size --max_old_space_size=460"

# Enable Python optimizations
export PYTHONOPTIMIZE=2
export PYTHONUNBUFFERED=1
export PYTHONDONTWRITEBYTECODE=1
export MALLOC_TRIM_THRESHOLD_=65536
export PYTHONMALLOC=malloc
export MPLBACKEND=Agg

# Start the application
node app.js
