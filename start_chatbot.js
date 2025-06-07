//This is start_chatbot.js

const { spawn } = require('child_process');
const path = require('path');

let flaskProcess = null;

async function checkServerConnection(port, maxRetries = 10) {
  const axios = require('axios');
  let retries = 0;
  
  while (retries < maxRetries) {
    try {
      await axios.get(`http://localhost:${port}/health`);
      console.log(`Server successfully started on port ${port}`);
      return true;
    } catch (error) {
      retries++;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  return false;
}

function startChainlitServer() {
  // Don't start if already running
  if (flaskProcess && !flaskProcess.killed) {
    console.log('Flask chatbot server is already running');
    return flaskProcess;
  }
  console.log('Starting Flask chatbot server...');
  
  const isProduction = process.env.NODE_ENV === 'production';
  const chatbotPath = path.join(__dirname, isProduction ? 'wsgi.py' : 'chatbot_server.py');
  
  flaskProcess = spawn(
    isProduction ? 'gunicorn' : 'python',
    isProduction 
      ? ['wsgi:app', '--bind', '0.0.0.0:8001', '--workers', '2', '--timeout', '120']
      : [chatbotPath],
    {
      stdio: 'pipe',
      env: {
        ...process.env,
        FLASK_ENV: isProduction ? 'production' : 'development',
        PYTHONUNBUFFERED: '1'
      }
  });
  
  flaskProcess.stdout.on('data', (data) => {
    console.log(`Flask Chatbot: ${data.toString().trim()}`);
  });
  
  flaskProcess.stderr.on('data', (data) => {
    console.error(`Flask Chatbot Error: ${data.toString().trim()}`);
  });
  
  flaskProcess.on('close', (code) => {
    console.log(`Flask chatbot process exited with code ${code}`);
    flaskProcess = null;
    if (code !== 0) {
      console.log('Restarting Flask chatbot server...');
      setTimeout(startChainlitServer, 5000);
    }
  });
  
  return flaskProcess;
}

module.exports = { startChainlitServer };
