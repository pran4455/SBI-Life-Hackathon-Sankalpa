//This is start_chatbot.js

const { spawn } = require('child_process');
const path = require('path');

let flaskProcess = null;

function startChainlitServer() {
  // Don't start if already running
  if (flaskProcess && !flaskProcess.killed) {
    console.log('Flask chatbot server is already running');
    return flaskProcess;
  }

  console.log('Starting Flask chatbot server...');
  
  const chatbotPath = path.join(__dirname, 'chatbot_server.py');
  
  flaskProcess = spawn('python', [chatbotPath], {
    stdio: 'pipe'
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
