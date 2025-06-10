#!/bin/bash

echo "=== Starting Diagnostic Checks ==="
echo "Current directory: $(pwd)"
echo "Python version: $(python3 --version)"
echo "Node version: $(node --version)"
echo "NPM version: $(npm --version)"

echo -e "\n=== Checking Environment Variables ==="
echo "NODE_ENV: $NODE_ENV"
echo "PORT: $PORT"
echo "CHATBOT_PORT: $CHATBOT_PORT"
echo "STREAMLIT_PORT: $STREAMLIT_PORT"

echo -e "\n=== Checking Running Processes ==="
echo "Node.js processes:"
ps aux | grep node
echo -e "\nPython processes:"
ps aux | grep python
echo -e "\nStreamlit processes:"
ps aux | grep streamlit

echo -e "\n=== Checking Port Availability ==="
echo "Checking port $PORT (Node.js):"
netstat -tulpn | grep $PORT || echo "Port $PORT not in use"
echo -e "\nChecking port $CHATBOT_PORT (Chatbot):"
netstat -tulpn | grep $CHATBOT_PORT || echo "Port $CHATBOT_PORT not in use"
echo -e "\nChecking port $STREAMLIT_PORT (Streamlit):"
netstat -tulpn | grep $STREAMLIT_PORT || echo "Port $STREAMLIT_PORT not in use"

echo -e "\n=== Checking Service Health ==="
echo "Testing Node.js health endpoint:"
curl -v "http://localhost:$PORT/healthz" || echo "Node.js health check failed"
echo -e "\nTesting Chatbot health endpoint:"
curl -v "http://localhost:$CHATBOT_PORT/healthz" || echo "Chatbot health check failed"
echo -e "\nTesting Streamlit health endpoint:"
curl -v "http://localhost:$STREAMLIT_PORT/healthz" || echo "Streamlit health check failed"

echo -e "\n=== Checking Log Files ==="
echo "Node.js logs:"
tail -n 50 /tmp/app_stdout.log 2>/dev/null || echo "No Node.js logs found"
echo -e "\nChatbot logs:"
tail -n 50 /tmp/chatbot_stdout.log 2>/dev/null || echo "No Chatbot logs found"
echo -e "\nStreamlit logs:"
tail -n 50 /tmp/streamlit_stdout.log 2>/dev/null || echo "No Streamlit logs found"

echo -e "\n=== Checking File Permissions ==="
ls -la dashboard.py
ls -la app.js
ls -la start-prod.sh

echo -e "\n=== Checking Dependencies ==="
echo "Python packages:"
pip list | grep -E "streamlit|flask|gunicorn"
echo -e "\nNode.js packages:"
npm list --depth=0

echo -e "\n=== Checking Network Configuration ==="
echo "Network interfaces:"
ifconfig || ip addr
echo -e "\nRouting table:"
netstat -rn

echo -e "\n=== Diagnostic Complete ===" 