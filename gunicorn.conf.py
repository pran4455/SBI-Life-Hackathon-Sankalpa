# Gunicorn configuration file
import multiprocessing
import os

# Server socket
bind = f"0.0.0.0:{os.environ.get('CHATBOT_PORT', '8001')}"
backlog = 2048

# Worker processes
workers = multiprocessing.cpu_count() * 2 + 1
worker_class = 'sync'
worker_connections = 1000
timeout = 120
keepalive = 2

# Process naming
proc_name = 'sankalpa-chatbot'

# Logging
accesslog = '-'
errorlog = '-'
loglevel = 'info'

# SSL
keyfile = None
certfile = None

# Development
reload = False
