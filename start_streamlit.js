const { spawn } = require('child_process');
const path = require('path');

function startStreamlitServer() {
    console.log('Starting Streamlit server...');
    
    const streamlitProcess = spawn('streamlit', [
        'run',
        path.join(__dirname, 'dashboard.py'),
        '--server.port', process.env.STREAMLIT_PORT || '8501',
        '--server.address', '0.0.0.0',
        '--server.baseUrlPath', '/dashboard',
        '--server.maxUploadSize', '50',
        '--server.maxMessageSize', '50',
        '--server.enableCORS', 'true',
        '--server.enableXsrfProtection', 'false',
        '--browser.gatherUsageStats', 'false',
        '--server.headless', 'true'
    ], {
        stdio: 'inherit',
        env: {
            ...process.env,
            PYTHONUNBUFFERED: '1',
            PYTHONOPTIMIZE: '2',
            PYTHONDONTWRITEBYTECODE: '1',
            PYTHONMALLOC: 'malloc',
            MALLOC_TRIM_THRESHOLD_: '65536',
            PYTHONHASHSEED: '0',
            PYTHONIOENCODING: 'utf-8'
        }
    });

    streamlitProcess.on('error', (error) => {
        console.error('Failed to start Streamlit server:', error);
    });

    streamlitProcess.on('exit', (code) => {
        if (code !== 0) {
            console.error(`Streamlit server exited with code ${code}`);
        }
    });

    return streamlitProcess;
}

module.exports = { startStreamlitServer };
