const nodemailer = require('nodemailer');

// Email configuration
const emailConfig = {
  // For development/testing - using Gmail SMTP
  // In production, use a proper email service like SendGrid, AWS SES, etc.
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: process.env.EMAIL_PORT || 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.EMAIL_USER || 'newdexm@gmail.com',
    pass: process.env.EMAIL_PASS || 'pvtb eirh wsox zfyy' // Use App Password for Gmail
  }
};

// Create transporter
const transporter = nodemailer.createTransport(emailConfig);

// Verify connection configuration
const verifyEmailConnection = async () => {
  try {
    await transporter.verify();
    console.log('✅ Email server is ready to send messages');
    return true;
  } catch (error) {
    console.error('❌ Email server connection failed:', error.message);
    return false;
  }
};

// Send email function
const sendEmail = async (to, subject, html, text = null) => {
  try {
    const mailOptions = {
      from: `"InteliHire" <${emailConfig.auth.user}>`,
      to: to,
      subject: subject,
      html: html,
      text: text || html.replace(/<[^>]*>/g, '') // Strip HTML for text version
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('📧 Email sent successfully:', result.messageId);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error('❌ Failed to send email:', error.message);
    return { success: false, error: error.message };
  }
};

module.exports = {
  transporter,
  sendEmail,
  verifyEmailConnection,
  emailConfig
};
