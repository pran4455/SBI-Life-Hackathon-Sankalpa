const express = require('express');
const app = express();

// Get port from environment variable
const PORT = process.env.PORT || 10000;

// Configure other middleware and routes here...

// Start server
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Server URL: http://0.0.0.0:${PORT}`);
});
