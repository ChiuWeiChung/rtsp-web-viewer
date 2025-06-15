const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const { spawn } = require('child_process');
const url = require('url');
const net = require('net');

// Set the path to the ffmpeg binary
ffmpeg.setFfmpegPath(ffmpegStatic);

// Configure RTSP stream URL - replace with your RTSP stream URL
const defaultRtspUrl = process.env.RTSP_URL || 'rtsp://example.com/stream';

// Function to test RTSP connection
const testConnection = async (rtspUrl, options = {}) => {
  return new Promise((resolve, reject) => {
    // Parse URL to get host and port
    const parsedUrl = url.parse(rtspUrl);
    const host = parsedUrl.hostname;
    const port = parsedUrl.port || 554; // Default RTSP port
    
    console.log(`Testing TCP connection to ${host}:${port} using ${options.transport || 'tcp'} transport`);
    
    // Timeout after 5 seconds
    const socket = net.createConnection(port, host);
    socket.setTimeout(5000);
    
    socket.on('connect', () => {
      console.log(`Successfully connected to ${host}:${port}`);
      socket.end();
      resolve();
    });
    
    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error(`Connection to ${host}:${port} timed out`));
    });
    
    socket.on('error', (err) => {
      reject(new Error(`Connection failed: ${err.message}`));
    });
  });
};

// Stream handler for Express route
const streamHandler = (req, res, options = {}) => {
  // Get RTSP URL from query parameter or use default
  const rtspUrl = req.query.url || defaultRtspUrl;
  
  // Get transport options
  const transport = options.transport || 'tcp';
  const forceDecode = options.forceDecode || false;
  
  console.log(`Starting stream from: ${rtspUrl} with transport: ${transport}${forceDecode ? ', force decoding enabled' : ''}`);
  
  // Set response headers for MJPEG stream
  res.writeHead(200, {
    'Content-Type': 'multipart/x-mixed-replace; boundary=ffmpeg_mjpeg_boundary',
    'Cache-Control': 'no-cache',
    'Connection': 'close',
    'Pragma': 'no-cache'
  });

  // Create boundary for MJPEG frames
  const boundary = '--ffmpeg_mjpeg_boundary\r\n';
  
  // Flag to track if the connection is still active
  let isConnectionActive = true;
  
  // Store frame buffer
  let frameBuffer = null;
  let isFrameComplete = false;
  
  // Store child process reference
  let childProcess = null;
  
  // Handle client disconnect
  req.on('close', () => {
    isConnectionActive = false;
    console.log('Client disconnected, stopping stream');
    
    // Kill child process when client disconnects
    if (childProcess) {
      try {
        childProcess.kill('SIGTERM');
        console.log('Stream process terminated');
      } catch (e) {
        console.error('Error killing child process:', e.message);
      }
    }
  });

  // Direct approach using child_process.spawn instead of fluent-ffmpeg
  try {
    // Log the FFmpeg version for debugging
    console.log(`Using FFmpeg binary: ${ffmpegStatic}`);
    
    // Build FFmpeg command arguments with correct syntax
    // We'll use a simpler approach, forcing FFmpeg to produce individual JPEG frames
    const ffmpegArgs = [
      '-hide_banner',
      '-loglevel', 'warning',
      '-rtsp_transport', transport,
      '-i', rtspUrl,
      '-an',                      // No audio
      '-f', 'image2pipe',         // Output individual images
      '-vcodec', 'mjpeg',         // Output codec as MJPEG
      '-q:v', '5',                // Quality level (1-31, lower is better)
      '-r', '20',                  // Frame rate
      '-'                         // Output to stdout
    ];

    // Log the full command for debugging
    console.log(`FFmpeg command: ${ffmpegStatic} ${ffmpegArgs.join(' ')}`);
    
    // Start FFmpeg process
    childProcess = spawn(ffmpegStatic, ffmpegArgs);

    // Log start of process
    console.log('FFmpeg process started with PID:', childProcess.pid);

    // Handle process exit
    childProcess.on('exit', (code, signal) => {
      if (code === 1) {
        console.error(`FFmpeg exited with code ${code}: could not connect to RTSP stream`);
      } else if (signal) {
        console.log(`FFmpeg was terminated with signal ${signal}`);
      } else if (code !== 0) {
        console.error(`FFmpeg exited with code ${code}`);
      } else {
        console.log('FFmpeg process completed');
      }
      
      if (isConnectionActive) {
        res.end();
      }
    });

    // Handle process errors
    childProcess.on('error', (err) => {
      console.error('Error starting FFmpeg process:', err.message);
      if (isConnectionActive) {
        res.end();
      }
    });

    // Collect and log stderr output for debugging
    let stderrBuffer = '';
    childProcess.stderr.on('data', (data) => {
      const message = data.toString();
      stderrBuffer += message;
      
      // Log significant FFmpeg messages immediately
      if (message.includes('Error') || message.includes('error') || 
          message.includes('Failed') || message.includes('Opening')) {
        console.error('FFmpeg:', message.trim());
      }
    });
    
    // Log complete stderr buffer on process exit
    childProcess.on('close', () => {
      if (stderrBuffer) {
        console.log('Complete FFmpeg log:', stderrBuffer);
      }
    });

    // Flag to track if we've received any frames
    let framesReceived = 0;
    
    // Simple JPEG magic number check for detecting valid JPEG data
    const isJpegStart = (data) => {
      return data.length >= 2 && data[0] === 0xFF && data[1] === 0xD8;
    };
    
    const isJpegEnd = (data) => {
      return data.length >= 2 && data[data.length - 2] === 0xFF && data[data.length - 1] === 0xD9;
    };
    
    // Handle data from stdout (the video frames)
    childProcess.stdout.on('data', (chunk) => {
      if (!isConnectionActive) return;
      
      try {
        // Check if this is a complete JPEG frame
        if (isJpegStart(chunk) && isJpegEnd(chunk)) {
          // Complete frame in one chunk
          framesReceived++;
          
          if (framesReceived === 1) {
            console.log('First complete frame received');
          }
          
          // Send the frame
          res.write(boundary);
          res.write('Content-Type: image/jpeg\r\n');
          res.write(`Content-Length: ${chunk.length}\r\n\r\n`);
          res.write(chunk);
          res.write('\r\n');
          return;
        }
        
        // Handle partial frames
        if (isJpegStart(chunk)) {
          // Start of a new frame
          frameBuffer = chunk;
          isFrameComplete = false;
        } else if (frameBuffer && !isFrameComplete) {
          // Continue building the frame
          frameBuffer = Buffer.concat([frameBuffer, chunk]);
          
          // Check if we have a complete frame now
          if (isJpegEnd(frameBuffer)) {
            isFrameComplete = true;
            framesReceived++;
            
            if (framesReceived === 1) {
              console.log('First complete frame assembled');
            }
            
            // Send the complete frame
            res.write(boundary);
            res.write('Content-Type: image/jpeg\r\n');
            res.write(`Content-Length: ${frameBuffer.length}\r\n\r\n`);
            res.write(frameBuffer);
            res.write('\r\n');
            
            // Clear buffer
            frameBuffer = null;
          }
        }
      } catch (e) {
        console.error('Error processing frame:', e.message);
      }
    });
    
    // Set a timeout to check if we've received any frames
    setTimeout(() => {
      if (framesReceived === 0 && isConnectionActive) {
        console.error('No frames received after 10 seconds, terminating process');
        if (childProcess) {
          childProcess.kill('SIGTERM');
        }
        if (isConnectionActive) {
          res.end();
        }
      } else if (framesReceived > 0) {
        console.log(`Received ${framesReceived} frames after 10 seconds`);
      }
    }, 10000);
    
  } catch (err) {
    console.error('Failed to start FFmpeg process:', err.message);
    if (isConnectionActive) {
      res.end();
    }
  }
};

module.exports = {
  streamHandler,
  testConnection
}; 