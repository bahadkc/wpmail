const nodemailer = require('nodemailer');
require('dotenv').config();

async function testEmail() {
  console.log('Testing email configuration...');
  console.log('Email User:', process.env.EMAIL_USER);
  console.log('Email To:', process.env.EMAIL_TO);
  console.log('Email Pass length:', process.env.EMAIL_PASS ? process.env.EMAIL_PASS.length : 'NOT SET');

  // Try different Gmail configurations
  const configs = [
    {
      name: 'Gmail SMTP (TLS)',
      config: {
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS
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
        }
      }
    }
  ];

  for (const { name, config } of configs) {
    try {
      console.log(`\nTrying ${name}...`);
      
      const transporter = nodemailer.createTransport(config);
      
      // Test connection
      await transporter.verify();
      console.log(`✅ ${name} connection successful!`);
      
      // Try sending test email
      const result = await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: process.env.EMAIL_TO,
        subject: 'WhatsApp Notifier Test Email',
        text: 'This is a test email from your WhatsApp Email Notifier. If you receive this, the email configuration is working!',
        html: `
          <h2>✅ WhatsApp Email Notifier Test</h2>
          <p>This is a test email from your WhatsApp Email Notifier.</p>
          <p><strong>If you receive this, the email configuration is working!</strong></p>
          <p>Time: ${new Date().toLocaleString()}</p>
        `
      });
      
      console.log(`✅ ${name} test email sent successfully!`);
      console.log('Message ID:', result.messageId);
      return config;
      
    } catch (error) {
      console.log(`❌ ${name} failed:`, error.message);
    }
  }
  
  console.log('\n❌ All email configurations failed!');
  console.log('\nTroubleshooting steps:');
  console.log('1. Make sure you have enabled 2-Factor Authentication on Gmail');
  console.log('2. Generate an App Password: https://myaccount.google.com/apppasswords');
  console.log('3. Use the App Password (not your regular Gmail password)');
  console.log('4. Make sure "Less secure app access" is enabled if using regular password');
  
  return null;
}

testEmail().then(workingConfig => {
  if (workingConfig) {
    console.log('\n🎉 Email is working! Use this configuration in your app.');
    console.log('Working config:', JSON.stringify(workingConfig, null, 2));
  } else {
    console.log('\n💔 Email setup needs fixing.');
  }
}).catch(error => {
  console.error('Test failed:', error.message);
}); 