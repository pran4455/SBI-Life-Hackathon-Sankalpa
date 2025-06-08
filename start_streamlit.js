const { spawn } = require('child_process');

function startStreamlitServer() {
    console.log('Starting Streamlit server...');
    
    const streamlitProcess = spawn('streamlit', [
        'run',
        'dashboard.py',
        '--server.port', process.env.STREAMLIT_PORT || '8501',
        '--server.address', '0.0.0.0'
    ]);

    streamlitProcess.stdout.on('data', (data) => {
        console.log(`Streamlit: ${data}`);
    });

    streamlitProcess.stderr.on('data', (data) => {
        console.error(`Streamlit Error: ${data}`);
    });

    streamlitProcess.on('close', (code) => {
        if (code !== 0) {
            console.error(`Streamlit process exited with code ${code}`);
        }
    });

    return streamlitProcess;
}

module.exports = { startStreamlitServer };
