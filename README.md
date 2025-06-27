# WP to Mail by Baha 📱✉️

A WhatsApp to Email notification system that monitors your WhatsApp Web messages and sends email notifications when you receive new messages from your top contacts.

## Features

- 🔍 **Smart Monitoring**: Automatically tracks your top 3 most active contacts
- 📧 **Email Notifications**: Sends detailed email alerts with contact information
- 🎯 **Contact Detection**: Extracts contact names and phone numbers
- 💾 **Message History**: Prevents duplicate notifications with intelligent tracking
- 🌐 **Web Interface**: Beautiful, modern web UI for easy control
- 🛡️ **Reliable**: Built-in error handling and graceful shutdown

## Quick Start with Web Interface

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/wp-to-mail.git
   cd wp-to-mail
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure email settings**
   ```bash
   cp config.template.env .env
   ```
   
   Edit `.env` file with your email credentials:
   ```env
   EMAIL_USER=your-email@gmail.com
   EMAIL_PASS=your-app-password
   EMAIL_TO=recipient@gmail.com
   HEADLESS=false
   ```

4. **Start the web interface**
   ```bash
   npm run web
   ```

5. **Open your browser and visit**: `http://localhost:3000`

6. **Click "Start Monitoring"** and scan the QR code in the WhatsApp Web browser window

## Command Line Usage

If you prefer to run without the web interface:

```bash
npm start
```

## Email Setup (Gmail)

1. **Enable 2-Factor Authentication** on your Gmail account
2. **Generate an App Password**:
   - Go to [Google App Passwords](https://myaccount.google.com/apppasswords)
   - Select "Mail" and your device
   - Use the generated password in `EMAIL_PASS`
3. **Use your regular Gmail address** in `EMAIL_USER`

## How It Works

1. **Authentication**: Scan QR code to connect to WhatsApp Web
2. **Contact Analysis**: Identifies your top 3 most active contacts
3. **Monitoring**: Continuously watches for new messages
4. **Notification**: Sends email alerts with contact details when new messages arrive
5. **Smart Tracking**: Remembers processed messages to avoid duplicates

## Configuration Options

- `HEADLESS=true`: Run browser in background (no visible window)
- `HEADLESS=false`: Show browser window (useful for debugging)

## File Structure

```
wp-to-mail/
├── app.js                    # Core WhatsApp monitoring logic
├── server.js                 # Web interface server
├── public/
│   └── index.html           # Web UI
├── processed-messages.json  # Message history (auto-generated)
├── whatsapp-notifier.log   # Application logs
└── .env                    # Configuration file
```

## Troubleshooting

### Email Issues
- Ensure 2FA is enabled on Gmail
- Use App Password, not regular password
- Check firewall/antivirus settings
- Try different network connection

### WhatsApp Issues
- Make sure WhatsApp Web works in regular browser
- Keep the browser window visible during initial setup
- Ensure stable internet connection

### Browser Issues
- Close other Chrome/Chromium instances
- Clear browser cache
- Try running with `HEADLESS=false` for debugging

## Development

```bash
# Install dependencies
npm install

# Run web interface
npm run web

# Run command line version
npm start

# Development mode
npm run dev
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Author

**Baha** - *Creator of WP to Mail*

---

⭐ If you find this project useful, please give it a star on GitHub! 