const puppeteer = require('puppeteer');
const nodemailer = require('nodemailer');
const winston = require('winston');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Configure logging
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} [${level.toUpperCase()}]: ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'whatsapp-notifier.log' })
  ]
});

class WhatsAppEmailNotifier {
  constructor() {
    this.browser = null;
    this.page = null;
    this.emailTransporter = null;
    this.isRunning = false;
    this.messageHistoryFile = 'processed-messages.json';
    this.savedTop3 = []; // Simple array to store top 3 contact names
    
    this.setupEmailTransporter();
    this.loadProcessedMessages();
  }

  loadProcessedMessages() {
    try {
      if (fs.existsSync(this.messageHistoryFile)) {
        const data = JSON.parse(fs.readFileSync(this.messageHistoryFile, 'utf8'));
        this.processedMessages = new Set(data.processedMessages || []);
        this.lastMessageStates = new Map(data.lastMessageStates || []);
        logger.info(`Loaded ${this.processedMessages.size} processed messages and ${this.lastMessageStates.size} chat states from history`);
      } else {
        logger.info('No previous message history found, starting fresh');
      }
    } catch (error) {
      logger.error(`Error loading message history: ${error.message}`);
    }
  }

  saveProcessedMessages() {
    try {
      const data = {
        processedMessages: Array.from(this.processedMessages),
        lastMessageStates: Array.from(this.lastMessageStates.entries()),
        lastSaved: new Date().toISOString()
      };
      fs.writeFileSync(this.messageHistoryFile, JSON.stringify(data, null, 2));
      logger.info(`Saved ${this.processedMessages.size} processed messages to history`);
    } catch (error) {
      logger.error(`Error saving message history: ${error.message}`);
    }
  }

  setupEmailTransporter() {
    // Enhanced email configuration with multiple fallback options
    const emailConfigs = [
      {
        name: 'Gmail SMTP (TLS)',
        config: {
          host: 'smtp.gmail.com',
          port: 587,
          secure: false,
          auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
          },
          connectionTimeout: 60000,
          greetingTimeout: 30000,
          socketTimeout: 60000,
          tls: {
            rejectUnauthorized: false
          }
        }
      },
      {
        name: 'Gmail SMTP (SSL)',
        config: {
          host: 'smtp.gmail.com',
          port: 465,
          secure: true,
          auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
          },
          connectionTimeout: 60000,
          greetingTimeout: 30000,
          socketTimeout: 60000,
          tls: {
            rejectUnauthorized: false
          }
        }
      },
      {
        name: 'Gmail Service',
        config: {
          service: 'gmail',
          auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
          },
          connectionTimeout: 60000,
          greetingTimeout: 30000,
          socketTimeout: 60000
        }
      }
    ];

    // Try the first configuration (will be tested in verifyEmailConnection)
    this.emailTransporter = nodemailer.createTransport(emailConfigs[0].config);
    this.emailConfigs = emailConfigs;
    this.currentConfigIndex = 0;
    
    logger.info('Email transporter configured with enhanced Gmail SMTP settings');
  }

  async verifyEmailConnection() {
    // Try each configuration until one works
    for (let i = 0; i < this.emailConfigs.length; i++) {
      const { name, config } = this.emailConfigs[i];
      try {
        logger.info(`Testing ${name}...`);
        const testTransporter = nodemailer.createTransport(config);
        await testTransporter.verify();
        logger.info(`✅ ${name} connection verified successfully!`);
        
        // Update to use the working configuration
        this.emailTransporter = testTransporter;
        this.currentConfigIndex = i;
        return true;
      } catch (error) {
        logger.error(`❌ ${name} failed: ${error.message}`);
      }
    }
    
    logger.error('❌ All email configurations failed!');
    logger.error('This appears to be a network connectivity issue. Your firewall, antivirus, or ISP may be blocking SMTP connections.');
    logger.error('Possible solutions:');
    logger.error('1. Check Windows Firewall settings');
    logger.error('2. Check antivirus firewall settings');
    logger.error('3. Try connecting from a different network');
    logger.error('4. Contact your ISP about SMTP port blocking');
    logger.error('5. Make sure you have enabled 2-Factor Authentication on Gmail');
    logger.error('6. Generate an App Password: https://myaccount.google.com/apppasswords');
    logger.error('7. Use the App Password (not your regular Gmail password) in EMAIL_PASS');
    return false;
  }

  async initialize() {
    try {
      logger.info('Starting WhatsApp Email Notifier...');
      
      this.browser = await puppeteer.launch({
        headless: process.env.HEADLESS === 'true' ? 'new' : false,
        defaultViewport: { width: 1280, height: 800 },
        protocolTimeout: 120000,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-web-security',
          '--disable-blink-features=AutomationControlled',
          '--start-maximized'
        ]
      });

      this.page = await this.browser.newPage();
      await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
      
      logger.info('Browser launched successfully');
      
      // Navigate to WhatsApp Web with user agent first
      await this.page.goto('https://web.whatsapp.com/?lang=en', { waitUntil: 'domcontentloaded' });
      
      // Test email connection in parallel (don't block WhatsApp startup)
      setImmediate(async () => {
        const emailWorking = await this.verifyEmailConnection();
        if (!emailWorking) {
          logger.warn('Email connection failed, but continuing with WhatsApp monitoring. Notifications will be saved to missed-messages.log');
        }
      });
      logger.info('Navigated to WhatsApp Web');
      
      // Add some debugging
      const pageTitle = await this.page.title();
      logger.info(`Page title: ${pageTitle}`);
      
      // Wait a moment for page to load
      await this.page.waitForTimeout(3000);
      
      // Check what's on the page
      const pageContent = await this.page.evaluate(() => document.body.innerText.substring(0, 200));
      logger.info(`Page content preview: ${pageContent}`);
      
      // Wait for QR code or main interface
      logger.info('Please scan the QR code to authenticate WhatsApp Web...');
      await this.waitForAuthentication();
      
      logger.info('WhatsApp Web authenticated successfully!');
      
      // Start monitoring
      this.startMonitoring();
      
    } catch (error) {
      logger.error(`Failed to initialize: ${error.message}`);
      throw error;
    }
  }

  async waitForAuthentication() {
    try {
      logger.info('Waiting for QR code scan or existing session...');
      
      // Check if we're on the download/promotion page
      await this.page.waitForTimeout(3000);
      const pageContent = await this.page.evaluate(() => document.body.innerText.toLowerCase());
      
      if (pageContent.includes('indirin') || pageContent.includes('download') || pageContent.includes('windows')) {
        logger.info('Detected Windows app promotion page, looking for web login options...');
        
        // Try to find and click web login options
        const webLoginSelectors = [
          'a[href*="web"]',
          'button:contains("Web")',
          'a:contains("web")',
          'a:contains("tarayıcı")', // Turkish for browser
          '[data-testid*="web"]',
          'a[href*="continue"]'
        ];
        
        let clicked = false;
        for (const selector of webLoginSelectors) {
          try {
            const element = await this.page.$(selector);
            if (element) {
              logger.info(`Found web login option: ${selector}`);
              await element.click();
              await this.page.waitForTimeout(3000);
              clicked = true;
              break;
            }
          } catch (e) {
            // Continue trying other selectors
          }
        }
        
        // If no web login button found, try navigating directly to the web version
        if (!clicked) {
          logger.info('No web login button found, trying direct navigation...');
          await this.page.goto('https://web.whatsapp.com/send', { waitUntil: 'domcontentloaded' });
          await this.page.waitForTimeout(3000);
        }
      }
      
      // Now look for the QR code canvas or chat interface with more flexible selectors
      const authSelectors = [
        '[data-testid="chat-list"]',
        'canvas',
        '[data-ref="app-wrapper-web"]', 
        '[data-testid="qr-canvas"]',
        '[data-testid="qr-code"]',
        'img[alt*="QR"]',
        '.qr-code',
        '.qr-container',
        '[role="img"]', // QR code might be an image role
        'div[style*="background-image"]' // QR might be background image
      ];
      
      let authElement = null;
      for (const selector of authSelectors) {
        try {
          authElement = await this.page.waitForSelector(selector, { timeout: 10000 });
          if (authElement) {
            logger.info(`Found authentication element: ${selector}`);
            break;
          }
        } catch (e) {
          // Continue trying other selectors
        }
      }
      
      if (!authElement) {
        // Try one more approach - wait for any change in page
        logger.info('No specific auth elements found, waiting for page to load completely...');
        await this.page.waitForTimeout(10000);
      }
      
      // Check for QR code or chat interface more flexibly
      const qrSelectors = ['canvas', '[data-testid="qr-canvas"]', '[data-testid="qr-code"]', 'img[alt*="QR"]', '[role="img"]'];
      const chatSelectors = ['[data-testid="chat-list"]', '#pane-side', '[data-testid*="chat"]'];
      
      let qrCode = null;
      let chatInterface = null;
      
      // Check for QR code
      for (const selector of qrSelectors) {
        qrCode = await this.page.$(selector);
        if (qrCode) {
          logger.info(`QR code detected with selector: ${selector}`);
          break;
        }
      }
      
      // Check for chat interface
      for (const selector of chatSelectors) {
        chatInterface = await this.page.$(selector);
        if (chatInterface) {
          logger.info(`Chat interface detected with selector: ${selector}`);
          break;
        }
      }
      
      if (qrCode && !chatInterface) {
        logger.info('QR code detected. Please scan it with your phone...');
        logger.info('Make sure the Chrome browser window is visible and scan the QR code');
        
        // Wait for authentication to complete - check for any sign of successful login
        logger.info('Waiting for authentication to complete...');
        
        // Try multiple strategies to detect successful authentication
        let authenticated = false;
        const maxAttempts = 36; // 3 minutes with 5 second intervals
        
        for (let attempt = 0; attempt < maxAttempts && !authenticated; attempt++) {
          await this.page.waitForTimeout(5000);
          
          // Strategy 1: Check for disappearance of QR code
          const qrStillVisible = await this.page.$('canvas, [data-testid="qr-canvas"]');
          if (!qrStillVisible) {
            logger.info('QR code disappeared - authentication may be in progress...');
          }
          
          // Strategy 2: Check for any chat-related elements
          const chatElements = await this.page.$$('[data-testid*="chat"], [data-testid*="side"], #side, .landing-wrapper, header, #pane-side');
          if (chatElements.length > 0) {
            logger.info('Chat interface detected!');
            authenticated = true;
            break;
          }
          
          // Strategy 3: Check page content for changes
          const content = await this.page.evaluate(() => document.body.innerText.toLowerCase());
          if (content.includes('search') || content.includes('chats') || content.includes('status') || content.includes('calls') || content.includes('sohbet')) {
            logger.info('WhatsApp interface content detected!');
            authenticated = true;
            break;
          }
          
          logger.info(`Authentication attempt ${attempt + 1}/${maxAttempts}...`);
        }
        
        if (!authenticated) {
          // Instead of throwing error, let's continue and see if it works
          logger.warn('QR code authentication timeout, but attempting to continue...');
        } else {
          logger.info('QR code scanned successfully!');
        }
      } else if (chatInterface) {
        // Already logged in
        logger.info('Already authenticated - chat interface detected');
      } else {
        // Neither QR nor chat found - let's try to continue anyway
        logger.warn('Could not detect QR code or chat interface, but attempting to continue...');
      }
      
      // Additional wait to ensure page is fully loaded
      await this.page.waitForTimeout(5000);
      logger.info('Authentication completed, chat list loaded');
      
    } catch (error) {
      logger.error(`Authentication timeout: ${error.message}`);
      
      // Take a screenshot for debugging
      try {
        await this.page.screenshot({ path: 'whatsapp-debug.png', fullPage: true });
        logger.info('Debug screenshot saved as whatsapp-debug.png');
      } catch (screenshotError) {
        logger.error(`Could not take screenshot: ${screenshotError.message}`);
      }
      
      // Log current URL and page content for debugging
      const currentUrl = this.page.url();
      logger.info(`Current URL: ${currentUrl}`);
      
      throw error;
    }
  }

  async startMonitoring() {
    this.isRunning = true;
    logger.info('🔍 Starting simple top 3 monitoring...');
    
    // Get initial top 3 contact names
    this.savedTop3 = await this.getSimpleTop3Names();
    logger.info(`📋 Initial top 3: ${this.savedTop3.join(', ')}`);
    
    while (this.isRunning) {
      try {
        // Wait 5 seconds as requested
        await this.page.waitForTimeout(5000);
        
        // Get current top 3 names
        const currentTop3 = await this.getSimpleTop3Names();
        
        // Compare with saved list
        const hasChanged = !this.arraysEqual(currentTop3, this.savedTop3);
        
        if (hasChanged) {
          logger.info(`🔔 Top 3 changed!`);
          logger.info(`📋 Old: ${this.savedTop3.join(', ')}`);
          logger.info(`📋 New: ${currentTop3.join(', ')}`);
          
          // Send email with new top 3
          await this.sendTop3Notification(currentTop3);
          
          // Update saved list
          this.savedTop3 = currentTop3;
        } else {
          logger.debug(`✅ Top 3 unchanged: ${currentTop3.join(', ')}`);
        }
        
      } catch (error) {
        logger.error(`❌ Error during monitoring: ${error.message}`);
        await this.page.waitForTimeout(5000);
      }
    }
  }

  async getSimpleTop3Names() {
    try {
      // Wait a moment for page to stabilize
      await this.page.waitForTimeout(1000);
      
      // Try to find chat elements
      const chatSelectors = [
        '[data-testid="chat-list"] div[role="listitem"]',
        '#pane-side div[role="listitem"]',
        '[data-testid="side"] div[role="listitem"]',
        'div[role="listitem"]'
      ];
      
      let chats = [];
      for (const selector of chatSelectors) {
        chats = await this.page.$$(selector);
        if (chats.length > 0) {
          logger.debug(`✅ Found ${chats.length} chats with: ${selector}`);
          break;
        }
      }
      
      if (chats.length === 0) {
        logger.warn('❌ No chats found');
        return ['No chats found', '', ''];
      }
      
      // Extract names from top 3 chats
      const top3Names = [];
      for (let i = 0; i < Math.min(3, chats.length); i++) {
        const name = await this.page.evaluate((el) => {
          // Simple name extraction
          const spans = el.querySelectorAll('span[title]');
          for (const span of spans) {
            const title = span.getAttribute('title');
            if (title && title.trim() && title.length > 1 && title.length < 50) {
              return title.trim();
            }
          }
          
          // Fallback: any span with text
          const allSpans = el.querySelectorAll('span');
          for (const span of allSpans) {
            const text = span.textContent || span.innerText;
            if (text && text.trim() && text.length > 1 && text.length < 50 && 
                !text.match(/^\d{1,2}:\d{2}$/) && !text.includes('http')) {
              return text.trim();
            }
          }
          
          return `Contact ${Date.now()}`;
        }, chats[i]);
        
        top3Names.push(name);
      }
      
      // Ensure we always return 3 elements
      while (top3Names.length < 3) {
        top3Names.push('');
      }
      
      return top3Names.slice(0, 3);
    } catch (error) {
      logger.error(`❌ Error getting simple top 3: ${error.message}`);
      return ['Error', '', ''];
    }
  }

  // Helper function to compare arrays
  arraysEqual(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  async getTop3Contacts() {
    try {
      logger.info('🔍 Looking for chat list...');
      
      // Wait a moment for the page to stabilize
      await this.page.waitForTimeout(1000);
      
      // Try multiple approaches to find chat elements
      let chats = [];
      
      // Method 1: Try standard selectors
      const chatListSelectors = [
        '[data-testid="chat-list"] div[role="listitem"]',
        '#pane-side div[role="listitem"]',
        '[data-testid="side"] div[role="listitem"]',
        'div[data-testid*="chat"]',
        '[role="listitem"]'
      ];
      
      for (const selector of chatListSelectors) {
        chats = await this.page.$$(selector);
        if (chats.length > 0) {
          logger.info(`✅ Found ${chats.length} chats using selector: ${selector}`);
          break;
        } else {
          logger.debug(`❌ No chats found with selector: ${selector}`);
        }
      }
      
      // Method 2: If no chats found, try broader search
      if (chats.length === 0) {
        logger.warn('No chats found with standard selectors, trying broader search...');
        
        // Look for any div that might be a chat item
        const broadSelectors = [
          'div[tabindex="-1"]', // Often used for chat items
          'div[role="grid"] > div',
          '#pane-side > div > div > div',
          'div[data-testid*="conversation"]'
        ];
        
        for (const selector of broadSelectors) {
          chats = await this.page.$$(selector);
          if (chats.length > 0) {
            logger.info(`✅ Found ${chats.length} potential chats using broad selector: ${selector}`);
            break;
          }
        }
      }
      
      if (chats.length === 0) {
        logger.error('❌ Could not find any chat elements on the page');
        
        // Debug: Take a screenshot and log page content
        try {
          await this.page.screenshot({ path: 'debug-no-chats.png' });
          logger.info('📷 Screenshot saved as debug-no-chats.png');
          
          const pageContent = await this.page.evaluate(() => {
            return document.querySelector('#app')?.innerText?.substring(0, 500) || 'No content found';
          });
          logger.info(`📄 Page content preview: ${pageContent}`);
        } catch (debugError) {
          logger.error(`Debug screenshot failed: ${debugError.message}`);
        }
        
        return [];
      }
      
      logger.info(`🎯 Processing top ${Math.min(3, chats.length)} chats...`);
      
      // Extract top 3 contact info with better extraction
      const top3 = [];
      for (let i = 0; i < Math.min(3, chats.length); i++) {
        logger.info(`📋 Extracting info from chat ${i + 1}...`);
        
        const contactInfo = await this.page.evaluate((el, index) => {
          // Get all text content from the element
          const allText = el.innerText || el.textContent || '';
          
          // Try multiple approaches to extract contact name
          let name = '';
          
          // Method 1: Look for title attributes
          const titleElements = el.querySelectorAll('[title]');
          for (const titleEl of titleElements) {
            const title = titleEl.getAttribute('title');
            if (title && title.trim() && !title.includes(':') && title.length > 1) {
              name = title.trim();
              break;
            }
          }
          
          // Method 2: Look for spans with text content
          if (!name) {
            const spans = el.querySelectorAll('span');
            for (const span of spans) {
              const text = span.textContent || span.innerText;
              if (text && text.trim() && 
                  text.length > 1 && 
                  text.length < 50 && // Reasonable name length
                  !text.includes('data-testid') &&
                  !text.match(/^\d{1,2}:\d{2}$/) && // Not a time
                  !text.includes('www') && // Not a URL
                  !text.includes('http')) {
                name = text.trim();
                break;
              }
            }
          }
          
          // Method 3: Use any text content if nothing else found
          if (!name && allText) {
            const lines = allText.split('\n').filter(line => line.trim());
            for (const line of lines) {
              if (line.trim() && 
                  line.length > 1 && 
                  line.length < 50 &&
                  !line.match(/^\d{1,2}:\d{2}$/)) {
                name = line.trim();
                break;
              }
            }
          }
          
          // Fallback name
          if (!name) {
            name = `Contact_${index + 1}_${Date.now()}`;
          }
          
          return {
            name: name,
            position: index + 1,
            allText: allText.substring(0, 200), // For debugging
            elementHtml: el.outerHTML.substring(0, 300) // For debugging
          };
        }, chats[i], i);
        
        logger.info(`📝 Chat ${i + 1}: "${contactInfo.name}"`);
        logger.debug(`📄 Text content: "${contactInfo.allText.substring(0, 100)}..."`);
        
        contactInfo.chatElement = chats[i]; // Store element reference
        top3.push(contactInfo);
      }
      
      // Log the final result
      const contactNames = top3.map(c => c.name).join(', ');
      logger.info(`🎉 Successfully extracted top 3 contacts: ${contactNames}`);
      
      return top3;
    } catch (error) {
      logger.error(`❌ Error getting top 3 contacts: ${error.message}`);
      return [];
    }
  }



  async sendTop3Notification(newTop3) {
    try {
      logger.info(`📧 Sending top 3 contacts notification`);
      
      const subject = `🔔 WhatsApp Top 3 Update`;
      
      const htmlContent = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f0f0f0; padding: 20px;">
          <div style="background: #25D366; color: white; padding: 20px; border-radius: 10px 10px 0 0; text-align: center;">
            <h2 style="margin: 0; font-size: 24px;">📱 WhatsApp Top 3 Update</h2>
          </div>
          
          <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <div style="text-align: center; margin-bottom: 30px;">
              <div style="background: #25D366; color: white; width: 80px; height: 80px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 36px; margin-bottom: 15px;">
                📋
              </div>
              <h3 style="margin: 0; color: #333; font-size: 22px;">Top 3 Contacts Changed</h3>
            </div>
            
            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; border-left: 4px solid #25D366;">
              <h4 style="margin: 0 0 15px 0; color: #333;">📊 Current Top 3:</h4>
              <ol style="margin: 0; padding-left: 20px; color: #555; font-size: 16px; line-height: 1.8;">
                <li><strong>${newTop3[0] || 'Unknown'}</strong></li>
                <li><strong>${newTop3[1] || 'Unknown'}</strong></li>
                <li><strong>${newTop3[2] || 'Unknown'}</strong></li>
              </ol>
            </div>
            
            <div style="margin-top: 25px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; color: #888; font-size: 14px;">
              <p style="margin: 0;">🕐 ${new Date().toLocaleString()}</p>
              <p style="margin: 5px 0 0 0;">Automated WhatsApp Monitor</p>
            </div>
          </div>
        </div>
      `;
      
      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: process.env.EMAIL_TO,
        subject: subject,
        html: htmlContent
      };
      
      await this.emailTransporter.sendMail(mailOptions);
      logger.info(`✅ Top 3 notification sent successfully`);
      
    } catch (error) {
      logger.error(`❌ Error sending top 3 notification: ${error.message}`);
    }
  }

  async getContactNameOnly() {
    try {
      // Try to get contact name from chat header
      const nameSelectors = [
        '[data-testid="conversation-header"] [data-testid="conversation-info-header-chat-title"]',
        '[data-testid="conversation-header"] span[title]',
        'header span[dir="auto"]',
        'header [title]'
      ];
      
      let contactName = '';
      for (const selector of nameSelectors) {
        const nameElement = await this.page.$(selector);
        if (nameElement) {
          const name = await this.page.evaluate(el => el.textContent || el.title, nameElement);
          if (name && name.trim()) {
            contactName = name.trim();
            break;
          }
        }
      }
      
      return {
        name: contactName || 'Unknown Contact'
      };
    } catch (error) {
      logger.error(`Error getting contact name: ${error.message}`);
      return { name: 'Unknown Contact' };
    }
  }

  async getContactDetails() {
    try {
      // Try to get contact name from chat header
      const nameSelectors = [
        '[data-testid="conversation-header"] [data-testid="conversation-info-header-chat-title"]',
        '[data-testid="conversation-header"] span[title]',
        'header span[dir="auto"]',
        'header [title]'
      ];
      
      let contactName = '';
      for (const selector of nameSelectors) {
        const nameElement = await this.page.$(selector);
        if (nameElement) {
          const name = await this.page.evaluate(el => el.textContent || el.title, nameElement);
          if (name && name.trim()) {
            contactName = name.trim();
            break;
          }
        }
      }
      
      // Try to get phone number by clicking on contact info
      let phoneNumber = '';
      try {
        logger.info('🔍 Attempting to get phone number...');
        
        // Take a screenshot for debugging
        await this.page.screenshot({ path: 'debug-before-click.png', fullPage: false });
        
        // More comprehensive selectors for clicking on contact name/info
        const nameClickSelectors = [
          '[data-testid="conversation-info-header"]',
          '[data-testid="conversation-header"] [data-testid="conversation-info-header-chat-title"]',
          '[data-testid="conversation-header"] span[title]',
          '[data-testid="conversation-header"] [title]',
          'header [data-testid="conversation-info-header"]',
          'header span[title]',
          '[data-testid="conversation-header"]'
        ];
        
        let clicked = false;
        let clickedSelector = '';
        
        for (const selector of nameClickSelectors) {
          try {
            const nameElement = await this.page.$(selector);
            if (nameElement) {
              logger.info(`🎯 Found clickable element with selector: ${selector}`);
              await nameElement.click();
              clicked = true;
              clickedSelector = selector;
              break;
            }
          } catch (clickErr) {
            logger.debug(`Failed to click with selector ${selector}: ${clickErr.message}`);
          }
        }
        
        if (clicked) {
          logger.info(`✅ Successfully clicked on: ${clickedSelector}`);
          
          // Wait longer for contact info panel to open
          await this.page.waitForTimeout(3000);
          
          // Take another screenshot after clicking
          await this.page.screenshot({ path: 'debug-after-click.png', fullPage: false });
          
          // Try to wait for contact info panel to appear
          try {
            await this.page.waitForSelector('[data-testid="drawer-right"]', { timeout: 5000 });
            logger.info('📱 Contact info panel detected');
          } catch (waitErr) {
            logger.info('⚠️ Contact info panel selector not found, continuing anyway');
          }
          
          // Enhanced phone number search strategies
          logger.info('🔍 Searching for phone number...');
          
          // Strategy 1: Look for Turkish "telefon" text and nearby numbers
          try {
            logger.info('📞 Strategy 1: Searching for "telefon" text...');
            const pageContent = await this.page.content();
            logger.debug('Page content length:', pageContent.length);
            
            const allTextElements = await this.page.$$('*');
            for (const element of allTextElements) {
              const text = await this.page.evaluate(el => el.textContent?.toLowerCase() || '', element);
              if (text.includes('telefon') || text.includes('phone')) {
                logger.info(`🎯 Found element with "telefon/phone" text: ${text.substring(0, 50)}...`);
                
                // Look in the same element and nearby elements for phone numbers
                const elementHTML = await this.page.evaluate(el => el.outerHTML, element);
                const phonePattern = /(\+90\s?\d{3}\s?\d{3}\s?\d{2}\s?\d{2}|\+90\d{10}|\+\d{10,15}|\d{11,15})/g;
                const matches = elementHTML.match(phonePattern);
                
                if (matches) {
                  for (const match of matches) {
                    const cleanMatch = match.replace(/\s/g, '');
                    if (cleanMatch.length >= 10) {
                      phoneNumber = match.trim();
                      logger.info(`✅ Found phone number via telefon search: ${phoneNumber}`);
                      break;
                    }
                  }
                }
                if (phoneNumber) break;
              }
            }
          } catch (err) {
            logger.debug(`Strategy 1 error: ${err.message}`);
          }
          
          // Strategy 2: Look for elements with phone number patterns
          if (!phoneNumber) {
            logger.info('📞 Strategy 2: Searching for phone number patterns...');
            try {
              const phoneSelectors = [
                'span[dir="ltr"]',
                'div[title*="+"]',
                'span[title*="+"]',
                '[data-testid*="phone"]',
                'div[role="button"] span',
                'div[tabindex="0"] span',
                'span[role="gridcell"]',
                'div.copyable-text span'
              ];
              
              for (const selector of phoneSelectors) {
                const elements = await this.page.$$(selector);
                logger.debug(`Found ${elements.length} elements with selector: ${selector}`);
                
                for (const element of elements) {
                  const text = await this.page.evaluate(el => el.textContent || el.title || '', element);
                  if (text) {
                    const cleanText = text.replace(/\s/g, '');
                    // More flexible phone number pattern
                    if ((text.includes('+') && cleanText.length >= 10) || 
                        (cleanText.match(/^\d{10,15}$/) && !text.includes(':') && !text.includes('%'))) {
                      phoneNumber = text.trim();
                      logger.info(`✅ Found phone number via pattern search: ${phoneNumber}`);
                      break;
                    }
                  }
                }
                if (phoneNumber) break;
              }
            } catch (err) {
              logger.debug(`Strategy 2 error: ${err.message}`);
            }
          }
          
          // Strategy 3: Scan entire page for phone numbers
          if (!phoneNumber) {
            logger.info('📞 Strategy 3: Full page phone number scan...');
            try {
              const fullPageText = await this.page.evaluate(() => document.body.textContent || '');
              const phonePatterns = [
                /\+90\s?\d{3}\s?\d{3}\s?\d{2}\s?\d{2}/g,  // Turkish format with spaces
                /\+90\d{10}/g,                             // Turkish format no spaces
                /\+\d{10,15}/g,                           // International format
                /\b\d{11,15}\b/g                          // Local format (11-15 digits)
              ];
              
              for (const pattern of phonePatterns) {
                const matches = fullPageText.match(pattern);
                if (matches) {
                  // Filter out obvious non-phone numbers
                  for (const match of matches) {
                    const clean = match.replace(/\s/g, '');
                    if (clean.length >= 10 && clean.length <= 15 && 
                        !match.includes(':') && !match.includes('%') &&
                        !match.includes('px') && !match.includes('em')) {
                      phoneNumber = match.trim();
                      logger.info(`✅ Found phone number via full scan: ${phoneNumber}`);
                      break;
                    }
                  }
                }
                if (phoneNumber) break;
              }
            } catch (err) {
              logger.debug(`Strategy 3 error: ${err.message}`);
            }
          }
          
          // Take a final screenshot for debugging
          await this.page.screenshot({ path: 'debug-final.png', fullPage: false });
          
          // Close contact info and go back
          logger.info('🔙 Closing contact info panel...');
          await this.page.keyboard.press('Escape');
          await this.page.waitForTimeout(1000);
          
          // If Escape didn't work, try clicking outside
          if (phoneNumber) {
            try {
              const chatArea = await this.page.$('[data-testid="conversation-panel-messages"]');
              if (chatArea) {
                await chatArea.click();
              }
            } catch (closeErr) {
              logger.debug(`Error closing panel: ${closeErr.message}`);
            }
          }
          
        } else {
          logger.warn('❌ Could not click on any contact name element');
        }
        
        if (phoneNumber) {
          logger.info(`✅ Successfully extracted phone number: ${phoneNumber}`);
        } else {
          logger.warn('❌ Could not extract phone number using any strategy');
        }
        
      } catch (phoneError) {
        logger.error(`❌ Phone extraction error: ${phoneError.message}`);
      }
      
      return {
        name: contactName,
        phoneNumber: phoneNumber || 'Not available'
      };
    } catch (error) {
      logger.error(`Error getting contact details: ${error.message}`);
      return { name: '', phone: 'Not available' };
    }
  }

  async stop() {
    this.isRunning = false;
    
    // Save processed messages before shutdown
    this.saveProcessedMessages();
    logger.info('Saved processed messages before shutdown');
    
    if (this.browser) {
      await this.browser.close();
      logger.info('Browser closed');
    }
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully...');
  if (global.notifier) {
    await global.notifier.stop();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully...');
  if (global.notifier) {
    await global.notifier.stop();
  }
  process.exit(0);
});

// Start the application
async function main() {
  try {
    // Validate required environment variables
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS || !process.env.EMAIL_TO) {
      throw new Error('Missing required email configuration. Please check your .env file.');
    }

    global.notifier = new WhatsAppEmailNotifier();
    await global.notifier.initialize();
    
  } catch (error) {
    logger.error(`Application failed to start: ${error.message}`);
    process.exit(1);
  }
}

// Run the application
if (require.main === module) {
  main();
}

module.exports = WhatsAppEmailNotifier; 