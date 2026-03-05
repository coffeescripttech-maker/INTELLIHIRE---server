const { sendEmail, verifyEmailConnection } = require('../config/email.config');
const {
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendEmailVerificationEmail,
  sendApplicationStatusEmail
} = require('../templates/email.templates');

class EmailService {
  constructor() {
    this.isConnected = false;
    this.init();
  }

  async init() {
    this.isConnected = await verifyEmailConnection();
  }

  async sendEmailVerification(
    email,
    firstName,
    verificationToken,
    baseUrl = process.env.CLIENT_URL || 'https://intellihire-client.vercel.app'
  ) {
    try {
      if (!this.isConnected) {
        console.log(
          '📧 Email service not connected, logging verification link for development...'
        );
        console.log(`Verification link for ${email}:`);
        console.log(`${baseUrl}/verify-email/${verificationToken}`);
        return { success: true, message: 'Link logged for development' };
      }

      const emailData = await sendEmailVerificationEmail(
        email,
        firstName,
        verificationToken,
        baseUrl
      );
      const result = await sendEmail(
        emailData.to,
        emailData.subject,
        emailData.html
      );

      if (result.success) {
        console.log(`✅ Verification email sent to ${email}`);
        return {
          success: true,
          message: 'Verification email sent successfully'
        };
      } else {
        console.error(
          `❌ Failed to send verification email to ${email}:`,
          result.error
        );
        return { success: false, error: result.error };
      }
    } catch (error) {
      console.error('❌ Email service error:', error.message);
      return { success: false, error: error.message };
    }
  }

  async sendPasswordReset(
    email,
    resetToken,
    baseUrl = process.env.CLIENT_URL || 'http://localhost:3000'
  ) {
    try {
      if (!this.isConnected) {
        console.log(
          '📧 Email service not connected, logging token for development...'
        );
        console.log(`Reset token for ${email}: ${resetToken}`);
        return { success: true, message: 'Token logged for development' };
      }

      const emailData = await sendPasswordResetEmail(
        email,
        resetToken,
        baseUrl
      );
      const result = await sendEmail(
        emailData.to,
        emailData.subject,
        emailData.html
      );

      if (result.success) {
        console.log(`✅ Password reset email sent to ${email}`);
        return {
          success: true,
          message: 'Password reset email sent successfully'
        };
      } else {
        console.error(
          `❌ Failed to send password reset email to ${email}:`,
          result.error
        );
        return { success: false, error: result.error };
      }
    } catch (error) {
      console.error('❌ Email service error:', error.message);
      return { success: false, error: error.message };
    }
  }

  async sendWelcome(
    email,
    firstName,
    baseUrl = process.env.p || 'http://localhost:3000'
  ) {
    try {
      if (!this.isConnected) {
        console.log(
          '📧 Email service not connected, skipping welcome email...'
        );
        return {
          success: true,
          message: 'Welcome email skipped (development mode)'
        };
      }

      const emailData = await sendWelcomeEmail(email, firstName, baseUrl);
      const result = await sendEmail(
        emailData.to,
        emailData.subject,
        emailData.html
      );

      if (result.success) {
        console.log(`✅ Welcome email sent to ${email}`);
        return { success: true, message: 'Welcome email sent successfully' };
      } else {
        console.error(
          `❌ Failed to send welcome email to ${email}:`,
          result.error
        );
        return { success: false, error: result.error };
      }
    } catch (error) {
      console.error('❌ Email service error:', error.message);
      return { success: false, error: error.message };
    }
  }

  async sendApplicationStatusUpdate(
    email,
    firstName,
    applicationData,
    baseUrl = process.env.CLIENT_URL || 'http://localhost:3000'
  ) {
    try {
      if (!this.isConnected) {
        console.log('📧 Email service not connected, logging status update...');
        console.log(`Status update email for ${email}:`, applicationData);
        return { success: true, message: 'Email logged for development' };
      }

      const emailData = await sendApplicationStatusEmail(
        email,
        firstName,
        applicationData,
        baseUrl
      );

      const result = await sendEmail(
        emailData.to,
        emailData.subject,
        emailData.html
      );

      if (result.success) {
        console.log(
          `✅ Application status email sent to ${email} (${applicationData.status})`
        );
        return {
          success: true,
          message: 'Status update email sent successfully'
        };
      } else {
        console.error(
          `❌ Failed to send status update email to ${email}:`,
          result.error
        );
        return { success: false, error: result.error };
      }
    } catch (error) {
      console.error('❌ Email service error:', error.message);
      return { success: false, error: error.message };
    }
  }

  async sendCustomEmail(to, subject, html, text = null) {
    try {
      if (!this.isConnected) {
        console.log('📧 Email service not connected, skipping custom email...');
        return {
          success: true,
          message: 'Custom email skipped (development mode)'
        };
      }

      const result = await sendEmail(to, subject, html, text);

      if (result.success) {
        console.log(`✅ Custom email sent to ${to}`);
        return { success: true, message: 'Custom email sent successfully' };
      } else {
        console.error(`❌ Failed to send custom email to ${to}:`, result.error);
        return { success: false, error: result.error };
      }
    } catch (error) {
      console.error('❌ Email service error:', error.message);
      return { success: false, error: error.message };
    }
  }

  getConnectionStatus() {
    return this.isConnected;
  }
}

// Create singleton instance
const emailService = new EmailService();

module.exports = emailService;
