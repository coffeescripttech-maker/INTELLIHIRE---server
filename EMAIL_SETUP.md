# Email Setup Guide for InteliHire

## Overview

This guide will help you set up email functionality for InteliHire using Nodemailer with Gmail SMTP.

## Prerequisites

1. Install dependencies:

```bash
npm install nodemailer handlebars
```

## Environment Variables

Add these to your `.env` file:

```env
# Email Configuration (Gmail SMTP)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password

# Client URL (for email links)
CLIENT_URL=http://localhost:3000
```

## Gmail Setup

### Step 1: Enable 2-Factor Authentication

1. Go to your Google Account settings
2. Navigate to Security
3. Enable 2-Step Verification

### Step 2: Generate App Password

1. In Security settings, find "App passwords"
2. Select "Mail" and your device
3. Copy the generated 16-character password
4. Use this password in `EMAIL_PASS`

### Step 3: Update Environment Variables

```env
EMAIL_USER=your-gmail@gmail.com
EMAIL_PASS=your-16-character-app-password
```

## Email Templates

### Features

- **Modern Design**: Matches your current UI with glassmorphism effects
- **Responsive**: Works on desktop and mobile
- **Branded**: InteliHire branding and colors
- **Security**: Clear security notices and token expiration info

### Templates Available

1. **Password Reset Email**: Sent when user requests password reset
2. **Welcome Email**: Sent after successful registration
3. **Custom Email**: For future use cases

## Testing

### Development Mode

- If email service fails to connect, tokens are logged to console
- No emails sent, but functionality works for testing

### Production Mode

- Full email functionality with proper SMTP
- Professional email templates sent to users

## Email Service Features

### Password Reset Flow

1. User enters email on forgot password page
2. System generates JWT token (1-hour expiration)
3. Email sent with reset link: `/reset-password?token=...`
4. User clicks link and sets new password
5. Token validated and password updated

### Welcome Email Flow

1. User completes registration
2. Welcome email sent automatically
3. Includes onboarding information and next steps

## Troubleshooting

### Common Issues

1. **"Invalid login"**: Check EMAIL_USER and EMAIL_PASS
2. **"Connection timeout"**: Verify EMAIL_HOST and EMAIL_PORT
3. **"Authentication failed"**: Ensure App Password is correct

### Debug Mode

Check server console for email service status:

- ✅ Email server is ready to send messages
- ❌ Email server connection failed

## Alternative Email Services

### SendGrid

```env
SENDGRID_API_KEY=your-sendgrid-api-key
```

### AWS SES

```env
AWS_ACCESS_KEY_ID=your-aws-access-key
AWS_SECRET_ACCESS_KEY=your-aws-secret-key
AWS_REGION=us-east-1
```

## Security Notes

- Tokens expire in 1 hour
- Use strong JWT secrets in production
- Consider rate limiting for password reset requests
- Monitor email sending for abuse prevention
