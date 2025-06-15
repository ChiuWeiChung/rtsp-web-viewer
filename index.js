const express = require('express');
const morgan = require('morgan');
const path = require('path');
const { streamHandler, testConnection } = require('./rtspToMjpeg');

// Create Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Logging middleware
app.use(morgan('dev'));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Route to serve the MJPEG stream
app.get('/stream', (req, res, next) => {
  try {
    // Validate RTSP URL
    const rtspUrl = req.query.url;
    if (!rtspUrl) {
      return res.status(400).json({ error: '需要提供 RTSP URL' });
    }
    
    // Basic URL validation
    if (!rtspUrl.startsWith('rtsp://')) {
      return res.status(400).json({ error: 'RTSP URL 格式不正確，必須以 rtsp:// 開頭' });
    }
    
    // Get options from query parameters
    const options = {
      transport: req.query.transport === 'udp' ? 'udp' : 'tcp',
      forceDecode: req.query.forceDecode === '1',
      isTest: req.query.test === '1'
    };
    
    console.log(`Stream options: transport=${options.transport}, forceDecode=${options.forceDecode}, isTest=${options.isTest}`);
    
    // Check if this is just a test connection
    if (options.isTest) {
      console.log(`Testing connection to: ${rtspUrl}`);
      testConnection(rtspUrl, options)
        .then(() => {
          res.status(200).json({ success: true, message: '連接成功' });
        })
        .catch(err => {
          console.error('Test connection failed:', err.message);
          res.status(400).json({ success: false, error: err.message });
        });
      return;
    }

    // Stream handler for actual streaming
    streamHandler(req, res, options);
  } catch (err) {
    console.error('Stream error:', err);
    next(err);
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Route for the home page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 404 handler
app.use((req, res) => {
  res.status(404).send('頁面不存在');
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Application error:', err);
  res.status(500).json({ 
    error: '伺服器錯誤',
    message: process.env.NODE_ENV === 'development' ? err.message : '請稍後再試'
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
}); 