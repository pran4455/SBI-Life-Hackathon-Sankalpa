# SBI-Life-Hackathon-Sankalpa

## Server Configuration

The application server is configured to run with the following settings:

- Main server port: 10000 (configurable via PORT environment variable)
- Host: 0.0.0.0 (listens on all network interfaces)
- Chatbot server port: 8001 (configurable via CHATBOT_PORT environment variable)

### Port Configuration

When deploying to Render:
1. The server binds to 0.0.0.0 to accept connections on all available network interfaces
2. Port 10000 is used as the default port for the main application
3. A health check endpoint is available at `/health` to verify server status
4. Environment variables can be configured through render.yaml or the Render dashboard

### Local Development

For local development:
1. Set environment variables in `.env` file
2. Default ports will be used if not specified:
   - Main server: 10000
   - Chatbot server: 8001 (non-production only)
3. The server will output its configuration on startup