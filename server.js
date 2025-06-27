const express = require('express');
const path = require('path');
const WhatsAppEmailNotifier = require('./app.js');

const app = express();
const PORT = process.env.PORT || 3000;

let notifier = null;
let isRunning = false;

// Serve static files from public directory
app.use(express.static('public'));
app.use(express.json());

// Home route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API route to start monitoring
app.post('/api/start', async (req, res) => {
  if (isRunning) {
    return res.json({ success: false, message: 'WhatsApp monitoring is already running!' });
  }

  try {
    // Validate required environment variables
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS || !process.env.EMAIL_TO) {
      throw new Error('Missing required email configuration. Please check your .env file.');
    }

    notifier = new WhatsAppEmailNotifier();
    await notifier.initialize();
    isRunning = true;
    
    res.json({ 
      success: true, 
      message: 'WhatsApp monitoring started successfully! Please scan the QR code in the browser window that opened.' 
    });
  } catch (error) {
    console.error('Error starting WhatsApp monitoring:', error.message);
    res.status(500).json({ 
      success: false, 
      message: `Failed to start monitoring: ${error.message}` 
    });
  }
});

// API route to stop monitoring
app.post('/api/stop', async (req, res) => {
  if (!isRunning || !notifier) {
    return res.json({ success: false, message: 'No monitoring process is currently running.' });
  }

  try {
    await notifier.stop();
    notifier = null;
    isRunning = false;
    
    res.json({ 
      success: true, 
      message: 'WhatsApp monitoring stopped successfully!' 
    });
  } catch (error) {
    console.error('Error stopping WhatsApp monitoring:', error.message);
    res.status(500).json({ 
      success: false, 
      message: `Failed to stop monitoring: ${error.message}` 
    });
  }
});

// API route to get status
app.get('/api/status', (req, res) => {
  res.json({ 
    running: isRunning,
    message: isRunning ? 'WhatsApp monitoring is active' : 'WhatsApp monitoring is inactive'
  });
});

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('Received SIGINT, shutting down gracefully...');
  if (notifier && isRunning) {
    await notifier.stop();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  if (notifier && isRunning) {
    await notifier.stop();
  }
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`🚀 WP to Mail by Baha is running at http://localhost:${PORT}`);
  console.log('Open this URL in your browser to start the application');
}); 