const express = require('express');
const path = require('path');
const fs = require('fs');
require('dotenv').config(); // Load environment variables
const WhatsAppEmailNotifier = require('./app.js');

const app = express();
const PORT = process.env.PORT || 3000;

let notifier = null;
let isRunning = false;

// Serve static files from public directory
app.use(express.static('public'));
app.use(express.json());

// Function to update environment configuration
function updateEnvConfig(phoneNumber, emailAddress) {
  try {
    // Read the current .env file
    const envPath = path.join(__dirname, '.env');
    let envContent = fs.readFileSync(envPath, 'utf8');
    
    // Update the values
    envContent = envContent.replace(/WHATSAPP_PHONE=.*/, `WHATSAPP_PHONE=${phoneNumber}`);
    envContent = envContent.replace(/EMAIL_TO=.*/, `EMAIL_TO=${emailAddress}`);
    
    // Write back to .env file
    fs.writeFileSync(envPath, envContent);
    
    // Update process.env
    delete require.cache[require.resolve('dotenv')];
    require('dotenv').config();
    
    console.log(`Updated configuration: Phone=${phoneNumber}, Email=${emailAddress}`);
    return true;
  } catch (error) {
    console.error('Error updating environment configuration:', error);
    return false;
  }
}

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
    const { phoneNumber, emailAddress } = req.body;
    
    // Validate input
    if (!phoneNumber || !emailAddress) {
      return res.status(400).json({ 
        success: false, 
        message: 'Phone number and email address are required!' 
      });
    }

    // Validate phone number format
    const phoneRegex = /^\+[1-9]\d{1,14}$/;
    if (!phoneRegex.test(phoneNumber)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid phone number format. Please use international format (e.g., +905551234567)' 
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailAddress)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid email address format!' 
      });
    }

    // Update environment configuration
    const configUpdated = updateEnvConfig(phoneNumber, emailAddress);
    if (!configUpdated) {
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to update configuration. Please try again.' 
      });
    }

    // Email configuration is already set in .env, no need to validate
    console.log('Using preconfigured email settings for notifications');

    notifier = new WhatsAppEmailNotifier();
    await notifier.initialize();
    isRunning = true;
    
    res.json({ 
      success: true, 
      message: `🎉 WhatsApp monitoring started successfully!\n\n📱 Monitoring phone: ${phoneNumber}\n📧 Notifications to: ${emailAddress}\n\n✅ The system is now active and will send email notifications for new WhatsApp messages.\n\n📋 Please scan the QR code in the browser window that opened to connect your WhatsApp account.` 
    });
    
    // Start monitoring in the background
    setTimeout(() => {
      if (notifier && isRunning) {
        notifier.startMonitoring().catch(error => {
          console.error('Error in monitoring process:', error);
        });
      }
    }, 3000);
    
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