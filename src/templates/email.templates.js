const handlebars = require('handlebars');

// Base email template with modern styling matching your UI
const baseTemplate = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{title}}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #374151;
            background: linear-gradient(135deg, #f3f4f6 0%, #ffffff 50%, #dbeafe 100%);
            min-height: 100vh;
            padding: 20px;
        }
        
         .email-container {
             max-width: 600px;
             margin: 0 auto;
             background: rgba(255, 255, 255, 0.9);
             backdrop-filter: blur(20px);
             border-radius: 24px;
             box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
             border: 1px solid rgba(255, 255, 255, 0.5);
             overflow: hidden;
             position: relative;
         }
         
         .email-container::before {
             content: '';
             position: absolute;
             top: 0;
             left: 0;
             right: 0;
             bottom: 0;
             background: url('data:image/svg+xml,%3Csvg width="60" height="60" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg"%3E%3Cg fill="none" fill-rule="evenodd"%3E%3Cg fill="%233b82f6" fill-opacity="0.02"%3E%3Ccircle cx="30" cy="30" r="1.5"/%3E%3C/g%3E%3C/g%3E%3C/svg%3E') repeat;
             pointer-events: none;
         }
        
         .email-header {
             background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
             padding: 40px 30px;
             text-align: center;
             position: relative;
             z-index: 2;
         }
        
        .email-header::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: url('data:image/svg+xml,%3Csvg width="60" height="60" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg"%3E%3Cg fill="none" fill-rule="evenodd"%3E%3Cg fill="%23ffffff" fill-opacity="0.1"%3E%3Ccircle cx="30" cy="30" r="2"/%3E%3C/g%3E%3C/g%3E%3C/svg%3E') repeat;
            opacity: 0.3;
        }
        
         .logo {
             position: relative;
             z-index: 1;
             color: white;
             font-size: 32px;
             font-weight: 700;
             margin-bottom: 12px;
             letter-spacing: -0.5px;
         }
         
         .header-subtitle {
             position: relative;
             z-index: 1;
             color: rgba(255, 255, 255, 0.95);
             font-size: 16px;
             font-weight: 500;
         }
        
         .email-content {
             padding: 40px 30px;
             position: relative;
             z-index: 1;
         }
        
         .content-title {
             font-size: 28px;
             font-weight: 700;
             background: linear-gradient(135deg, #1f2937 0%, #374151 100%);
             background-clip: text;
             -webkit-background-clip: text;
             -webkit-text-fill-color: transparent;
             margin-bottom: 20px;
             text-align: center;
             letter-spacing: -0.5px;
         }
        
        .content-message {
            font-size: 16px;
            color: #6b7280;
            margin-bottom: 30px;
            line-height: 1.7;
        }
        
         .cta-button {
             display: inline-block;
             background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
             color: white;
             text-decoration: none;
             padding: 16px 32px;
             border-radius: 12px;
             font-weight: 600;
             font-size: 16px;
             text-align: center;
             margin: 20px 0;
             box-shadow: 0 10px 25px -5px rgba(59, 130, 246, 0.3);
             transition: all 0.3s ease;
         }
         
         .cta-button:hover {
             background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
             transform: translateY(-2px);
             box-shadow: 0 15px 35px -5px rgba(59, 130, 246, 0.4);
         }
        
         .info-box {
             background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
             border: 1px solid #93c5fd;
             border-radius: 16px;
             padding: 20px;
             margin: 20px 0;
         }
         
         .info-box-title {
             font-weight: 600;
             color: #1d4ed8;
             margin-bottom: 8px;
         }
         
         .info-box-text {
             color: #1e40af;
             font-size: 14px;
         }
        
        .warning-box {
            background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
            border: 1px solid #f59e0b;
            border-radius: 16px;
            padding: 20px;
            margin: 20px 0;
        }
        
        .warning-box-title {
            font-weight: 600;
            color: #92400e;
            margin-bottom: 8px;
        }
        
        .warning-box-text {
            color: #78350f;
            font-size: 14px;
        }
        
         .email-footer {
             background: #f9fafb;
             padding: 30px;
             text-align: center;
             border-top: 1px solid #e5e7eb;
             position: relative;
             z-index: 1;
         }
        
        .footer-text {
            color: #6b7280;
            font-size: 14px;
            margin-bottom: 16px;
        }
        
        .footer-links {
            margin-top: 20px;
        }
        
         .footer-link {
             color: #2563eb;
             text-decoration: none;
             margin: 0 10px;
             font-size: 14px;
             font-weight: 500;
         }
         
         .footer-link:hover {
             color: #1d4ed8;
             text-decoration: underline;
         }
        
        .token-display {
            background: #f3f4f6;
            border: 1px solid #d1d5db;
            border-radius: 8px;
            padding: 12px;
            font-family: 'Courier New', monospace;
            font-size: 12px;
            word-break: break-all;
            margin: 15px 0;
            color: #374151;
        }
        
        @media (max-width: 600px) {
            .email-container {
                margin: 10px;
                border-radius: 16px;
            }
            
            .email-header, .email-content, .email-footer {
                padding: 20px;
            }
            
            .content-title {
                font-size: 20px;
            }
            
            .cta-button {
                display: block;
                width: 100%;
            }
        }
    </style>
</head>
<body>
    <div class="email-container">
        <div class="email-header">
            <div class="logo">InteliHire</div>
            <div class="header-subtitle">AI-Powered Job Matching Platform</div>
        </div>
        
        <div class="email-content">
            <h1 class="content-title">{{title}}</h1>
            <div class="content-message">
                {{message}}
            </div>
            
            {{#if ctaButton}}
            <div style="text-align: center;">
                <a href="{{ctaButton.url}}" class="cta-button">{{ctaButton.text}}</a>
            </div>
            {{/if}}
            
            {{#if infoBox}}
            <div class="info-box">
                <div class="info-box-title">{{infoBox.title}}</div>
                <div class="info-box-text">{{infoBox.text}}</div>
            </div>
            {{/if}}
            
            {{#if warningBox}}
            <div class="warning-box">
                <div class="warning-box-title">{{warningBox.title}}</div>
                <div class="warning-box-text">{{warningBox.text}}</div>
            </div>
            {{/if}}
            
            {{#if token}}
            <div class="token-display">
                Reset Token:<br>
                {{token}}
            </div>
            {{/if}}
        </div>
        
        <div class="email-footer">
            <div class="footer-text">
                This email was sent from InteliHire. If you didn't request this, please ignore this email.
            </div>
            <div class="footer-links">
                <a href="{{baseUrl}}/login" class="footer-link">Login</a>
                <a href="{{baseUrl}}/register" class="footer-link">Register</a>
                <a href="{{baseUrl}}" class="footer-link">Home</a>
            </div>
        </div>
    </div>
</body>
</html>
`;

// Password reset email template
const passwordResetTemplate = handlebars.compile(baseTemplate);

// Email template data
const getPasswordResetEmailData = (
  email,
  resetToken,
  baseUrl = 'https://intellihire-client.vercel.app'
) => {
  return {
    title: 'Reset Your Password',
    message: `Hello! We received a request to reset your password for your InteliHire account. Click the button below to create a new password.`,
    ctaButton: {
      text: 'Reset Password',
      url: `${baseUrl}/reset-password?token=${resetToken}`
    },
    infoBox: {
      title: '⏰ Token Expires in 1 Hour',
      text: 'For security reasons, this password reset link will expire in 1 hour. If you need to reset your password after that, please request a new reset email.'
    },
    warningBox: {
      title: '🔒 Security Notice',
      text: "If you didn't request this password reset, please ignore this email. Your account remains secure and no changes have been made."
    },
    token: process.env.NODE_ENV === 'development' ? resetToken : null,
    baseUrl: baseUrl
  };
};

// Welcome email template
const getWelcomeEmailData = (firstName, baseUrl = 'https://intellihire-client.vercel.app') => {
  return {
    title: 'Welcome to InteliHire!',
    message: `Hi ${firstName}! Welcome to InteliHire! We're excited to have you join our AI-powered job matching platform. Your account has been successfully created and you can now start exploring amazing career opportunities.`,
    ctaButton: {
      text: 'Get Started',
      url: `${baseUrl}/dashboard`
    },
    infoBox: {
      title: "🚀 What's Next?",
      text: 'Complete your profile, upload your resume, and let our AI match you with the perfect job opportunities!'
    },
    baseUrl: baseUrl
  };
};

// Email sending functions
const sendPasswordResetEmail = async (email, resetToken, baseUrl) => {
  const templateData = getPasswordResetEmailData(email, resetToken, baseUrl);
  const html = passwordResetTemplate(templateData);

  return {
    to: email,
    subject: 'Reset Your InteliHire Password',
    html: html
  };
};

const sendWelcomeEmail = async (email, firstName, baseUrl) => {
  const templateData = getWelcomeEmailData(firstName, baseUrl);
  const html = passwordResetTemplate(templateData);

  return {
    to: email,
    subject: 'Welcome to InteliHire!',
    html: html
  };
};

const sendEmailVerificationEmail = async (
  email,
  firstName,
  verificationToken,
  baseUrl
) => {
  const templateData = {
    title: 'Verify Your Email',
    firstName: firstName || 'User',
    message: `Hi ${
      firstName || 'there'
    }, Thank you for registering with InteliHire! To complete your registration and start your journey, please verify your email address by clicking the button below.`,
    ctaButton: {
      text: 'Verify Email Address',
      url: `${baseUrl}/verify-email/${verificationToken}`
    },
    infoBox: {
      title: '⏰ Important',
      text: 'This verification link will expire in 24 hours. Please verify your email soon to access all features.'
    },
    baseUrl: baseUrl,
    year: new Date().getFullYear()
  };

  const html = passwordResetTemplate(templateData);

  return {
    to: email,
    subject: '✅ Verify Your Email - InteliHire',
    html
  };
};

// Application Status Update Email Templates
const sendApplicationStatusEmail = async (
  email,
  firstName,
  applicationData,
  baseUrl
) => {
  const {
    status,
    jobTitle,
    companyName,
    notes,
    interviewDate,
    interviewLocation,
    interviewType,
    rejectionReason
  } = applicationData;

  // Status-specific messages and styling
  const statusConfig = {
    applied: {
      title: '📝 Application Received',
      emoji: '📝',
      color: '#3b82f6',
      message: `Your application for ${jobTitle} at ${companyName} has been received and is under review.`,
      ctaText: 'View Application',
      ctaUrl: `${baseUrl}/dashboard/applicant/applications`
    },
    screening: {
      title: '🔍 Application Under Review',
      emoji: '🔍',
      color: '#f59e0b',
      message: `Good news! Your application for ${jobTitle} at ${companyName} is currently being reviewed by our team.`,
      ctaText: 'View Application Status',
      ctaUrl: `${baseUrl}/dashboard/applicant/applications`
    },
    interview: {
      title: '🎉 Interview Invitation',
      emoji: '🎉',
      color: '#8b5cf6',
      message: `Congratulations, ${firstName}! We are pleased to invite you for an interview for the ${jobTitle} position at ${companyName}.`,
      ctaText: 'View Interview Details',
      ctaUrl: `${baseUrl}/dashboard/applicant/applications`
    },
    offered: {
      title: '🌟 Job Offer',
      emoji: '🌟',
      color: '#10b981',
      message: `Fantastic news, ${firstName}! We are delighted to offer you the ${jobTitle} position at ${companyName}.`,
      ctaText: 'View Offer Details',
      ctaUrl: `${baseUrl}/dashboard/applicant/applications`
    },
    hired: {
      title: '🎊 Welcome Aboard!',
      emoji: '🎊',
      color: '#059669',
      message: `Congratulations, ${firstName}! Welcome to the ${companyName} team as our new ${jobTitle}. We look forward to working with you!`,
      ctaText: 'Access Dashboard',
      ctaUrl: `${baseUrl}/dashboard/applicant`
    },
    rejected: {
      title: '📋 Application Update',
      emoji: '📋',
      color: '#6b7280',
      message: `Thank you for your interest in the ${jobTitle} position at ${companyName}. After careful consideration, we have decided to move forward with other candidates.`,
      ctaText: 'Browse More Jobs',
      ctaUrl: `${baseUrl}/jobs`
    },
    withdrawn: {
      title: '↩️ Application Withdrawn',
      emoji: '↩️',
      color: '#6b7280',
      message: `Your application for ${jobTitle} at ${companyName} has been withdrawn as requested.`,
      ctaText: 'Browse Jobs',
      ctaUrl: `${baseUrl}/jobs`
    }
  };

  const config = statusConfig[status] || statusConfig.applied;

  const templateData = {
    title: config.title,
    message: `Hi ${firstName},${config.message}`,
    ctaButton: {
      text: config.ctaText,
      url: config.ctaUrl
    },
    baseUrl: baseUrl,
    year: new Date().getFullYear()
  };

  // Add status notes if provided
  if (notes) {
    templateData.infoBox = {
      title: '💬 Message from Recruiter',
      text: notes
    };
  }

  // Add interview details if status is interview
  if (status === 'interview' && interviewDate) {
    const interviewInfo = [];

    if (interviewDate) {
      const date = new Date(interviewDate);
      interviewInfo.push(
        `📅 Date & Time: ${date.toLocaleString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })}`
      );
    }

    if (interviewType) {
      const typeLabel =
        interviewType === 'in-person'
          ? 'In-Person'
          : interviewType === 'phone'
          ? 'Phone Call'
          : interviewType === 'video'
          ? 'Video Call'
          : interviewType;
      interviewInfo.push(`🎥 Type: ${typeLabel}`);
    }

    if (interviewLocation) {
      interviewInfo.push(`📍 Location: ${interviewLocation}`);
    }

    templateData.infoBox = {
      title: '📅 Interview Details',
      text: interviewInfo.join('<br>')
    };
  }

  // Add rejection reason if status is rejected and reason provided
  if (status === 'rejected' && rejectionReason) {
    templateData.warningBox = {
      title: '💡 Feedback',
      text: rejectionReason
    };
  }

  const html = passwordResetTemplate(templateData);

  return {
    to: email,
    subject: `${config.emoji} ${config.title} - ${jobTitle} at ${companyName}`,
    html
  };
};

// Campaign Newsletter Template
const sendCampaignEmail = async (email, subject, content, attachedJobs = []) => {
  let emailHtml = baseTemplate.replace('{{title}}', subject);
  emailHtml = emailHtml.replace('{{message}}', content);
  
  // Add attached jobs if any
  if (attachedJobs && attachedJobs.length > 0) {
    let jobsSection = '<div style="margin-top: 30px;">';
    jobsSection += '<h3 style="color: #1f2937; font-size: 20px; margin-bottom: 20px;">📢 Featured Job Opportunities</h3>';
    
    attachedJobs.forEach(job => {
      jobsSection += `
        <div style="background: #f9fafb; border: 2px solid #e5e7eb; border-radius: 12px; padding: 20px; margin-bottom: 15px;">
          <h4 style="color: #1f2937; font-size: 18px; margin-bottom: 10px;">${job.title}</h4>
          <p style="color: #6b7280; margin-bottom: 10px;">${job.description ? job.description.substring(0, 200) + '...' : 'No description available'}</p>
          <div style="display: flex; gap: 15px; margin-bottom: 15px; flex-wrap: wrap;">
            <span style="color: #3b82f6; font-size: 14px;">📍 ${job.location || 'N/A'}</span>
            <span style="color: #10b981; font-size: 14px;">💰 ${job.salaryMin ? '₱' + job.salaryMin.toLocaleString() : 'Negotiable'}</span>
            <span style="color: #8b5cf6; font-size: 14px;">💼 ${job.employmentType || 'Full-time'}</span>
          </div>
          <a href="${process.env.CLIENT_URL}/jobs/${job._id}" style="display: inline-block; background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; text-decoration: none; padding: 10px 20px; border-radius: 8px; font-weight: 600; font-size: 14px;">View Job Details</a>
        </div>
      `;
    });
    
    jobsSection += '</div>';
    emailHtml = emailHtml.replace('{{#if infoBox}}', jobsSection + '{{#if infoBox}}');
  }
  
  return {
    to: email,
    subject: subject,
    html: emailHtml
  };
};

// Campaign Type Templates for Email Marketing
const campaignTemplates = {
  newsletter: {
    subject: '📰 InteliHire Monthly Newsletter - {{month}} {{year}}',
    content: `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
  <!-- Header -->
  <div style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); padding: 40px 30px; text-align: center;">
    <h1 style="color: white; font-size: 32px; font-weight: 700; margin: 0 0 10px 0;">InteliHire</h1>
    <p style="color: rgba(255,255,255,0.9); font-size: 16px; margin: 0;">Your Monthly Career Update</p>
  </div>
  
  <!-- Content -->
  <div style="padding: 40px 30px;">
    <h2 style="color: #1f2937; font-size: 24px; font-weight: 700; margin: 0 0 20px 0;">Hi {{firstName}}! 👋</h2>
    
    <p style="color: #6b7280; font-size: 16px; line-height: 1.7; margin: 0 0 20px 0;">
      Welcome to this month's newsletter! We're excited to share the latest job opportunities, career tips, and platform updates with you.
    </p>
    
    <!-- Highlights Section -->
    <div style="background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); border-radius: 12px; padding: 20px; margin: 20px 0;">
      <h3 style="color: #1d4ed8; font-size: 18px; font-weight: 600; margin: 0 0 15px 0;">🌟 This Month's Highlights</h3>
      <ul style="color: #1e40af; margin: 0; padding-left: 20px;">
        <li style="margin-bottom: 10px;">New job opportunities in your field</li>
        <li style="margin-bottom: 10px;">Platform improvements and new features</li>
        <li style="margin-bottom: 10px;">Career development resources</li>
      </ul>
    </div>
    
    <p style="color: #6b7280; font-size: 16px; line-height: 1.7; margin: 20px 0;">
      Stay tuned for more updates and don't forget to check your dashboard regularly for personalized job matches!
    </p>
    
    <!-- CTA Button -->
    <div style="text-align: center; margin: 30px 0;">
      <a href="{{baseUrl}}/dashboard" style="display: inline-block; background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 16px;">View Dashboard</a>
    </div>
  </div>
  
  <!-- Footer -->
  <div style="background: #f9fafb; padding: 20px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
    <p style="color: #6b7280; font-size: 14px; margin: 0;">© {{year}} InteliHire. All rights reserved.</p>
  </div>
</div>
    `
  },
  
  job_alert: {
    subject: '🎯 New Job Opportunities Match Your Profile',
    content: `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
  <!-- Header -->
  <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 40px 30px; text-align: center;">
    <h1 style="color: white; font-size: 32px; font-weight: 700; margin: 0 0 10px 0;">🎯 New Job Matches</h1>
    <p style="color: rgba(255,255,255,0.9); font-size: 16px; margin: 0;">Opportunities tailored for you</p>
  </div>
  
  <!-- Content -->
  <div style="padding: 40px 30px;">
    <h2 style="color: #1f2937; font-size: 24px; font-weight: 700; margin: 0 0 20px 0;">Hi {{firstName}}! 👋</h2>
    
    <p style="color: #6b7280; font-size: 16px; line-height: 1.7; margin: 0 0 20px 0;">
      Great news! Our AI has found new job opportunities that match your skills and preferences. Don't miss out on these exciting positions!
    </p>
    
    <!-- Alert Box -->
    <div style="background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%); border-left: 4px solid #10b981; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <p style="color: #065f46; font-size: 14px; font-weight: 600; margin: 0 0 8px 0;">⚡ Act Fast!</p>
      <p style="color: #047857; font-size: 14px; margin: 0;">These positions are actively hiring. Apply now to increase your chances!</p>
    </div>
    
    <p style="color: #6b7280; font-size: 16px; line-height: 1.7; margin: 20px 0;">
      Check out the featured jobs below or visit your dashboard to see all available opportunities.
    </p>
    
    <!-- CTA Button -->
    <div style="text-align: center; margin: 30px 0;">
      <a href="{{baseUrl}}/jobs" style="display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 16px;">Browse Jobs</a>
    </div>
  </div>
  
  <!-- Footer -->
  <div style="background: #f9fafb; padding: 20px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
    <p style="color: #6b7280; font-size: 14px; margin: 0;">© {{year}} InteliHire. All rights reserved.</p>
  </div>
</div>
    `
  },
  
  reminder: {
    subject: '⏰ Reminder: Complete Your Profile on InteliHire',
    content: `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
  <!-- Header -->
  <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 40px 30px; text-align: center;">
    <h1 style="color: white; font-size: 32px; font-weight: 700; margin: 0 0 10px 0;">⏰ Friendly Reminder</h1>
    <p style="color: rgba(255,255,255,0.9); font-size: 16px; margin: 0;">Don't miss out on opportunities</p>
  </div>
  
  <!-- Content -->
  <div style="padding: 40px 30px;">
    <h2 style="color: #1f2937; font-size: 24px; font-weight: 700; margin: 0 0 20px 0;">Hi {{firstName}}! 👋</h2>
    
    <p style="color: #6b7280; font-size: 16px; line-height: 1.7; margin: 0 0 20px 0;">
      We noticed that your profile is incomplete. A complete profile helps our AI match you with better job opportunities!
    </p>
    
    <!-- Reminder Box -->
    <div style="background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border-left: 4px solid #f59e0b; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <p style="color: #92400e; font-size: 14px; font-weight: 600; margin: 0 0 12px 0;">📋 Complete These Steps:</p>
      <ul style="color: #78350f; margin: 0; padding-left: 20px;">
        <li style="margin-bottom: 8px;">Upload your resume/CV</li>
        <li style="margin-bottom: 8px;">Add your work experience</li>
        <li style="margin-bottom: 8px;">List your skills and certifications</li>
        <li>Set your job preferences</li>
      </ul>
    </div>
    
    <p style="color: #6b7280; font-size: 16px; line-height: 1.7; margin: 20px 0;">
      Take a few minutes to complete your profile and unlock the full potential of InteliHire!
    </p>
    
    <!-- CTA Button -->
    <div style="text-align: center; margin: 30px 0;">
      <a href="{{baseUrl}}/dashboard/applicant/profile" style="display: inline-block; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 16px;">Complete Profile</a>
    </div>
  </div>
  
  <!-- Footer -->
  <div style="background: #f9fafb; padding: 20px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
    <p style="color: #6b7280; font-size: 14px; margin: 0;">© {{year}} InteliHire. All rights reserved.</p>
  </div>
</div>
    `
  },
  
  announcement: {
    subject: '📢 Important Announcement from InteliHire',
    content: `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
  <!-- Header -->
  <div style="background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); padding: 40px 30px; text-align: center;">
    <h1 style="color: white; font-size: 32px; font-weight: 700; margin: 0 0 10px 0;">📢 Announcement</h1>
    <p style="color: rgba(255,255,255,0.9); font-size: 16px; margin: 0;">Important update from InteliHire</p>
  </div>
  
  <!-- Content -->
  <div style="padding: 40px 30px;">
    <h2 style="color: #1f2937; font-size: 24px; font-weight: 700; margin: 0 0 20px 0;">Hi {{firstName}}! 👋</h2>
    
    <p style="color: #6b7280; font-size: 16px; line-height: 1.7; margin: 0 0 20px 0;">
      We have an important announcement to share with you regarding InteliHire platform updates and new features.
    </p>
    
    <!-- Announcement Box -->
    <div style="background: linear-gradient(135deg, #f3e8ff 0%, #e9d5ff 100%); border-left: 4px solid #8b5cf6; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <p style="color: #5b21b6; font-size: 14px; font-weight: 600; margin: 0 0 12px 0;">🎉 What's New:</p>
      <p style="color: #6b21a8; font-size: 14px; line-height: 1.6; margin: 0;">
        [Add your announcement details here. This could be about new features, system maintenance, policy updates, or special events.]
      </p>
    </div>
    
    <p style="color: #6b7280; font-size: 16px; line-height: 1.7; margin: 20px 0;">
      Thank you for being a valued member of the InteliHire community. We're committed to providing you with the best job matching experience!
    </p>
    
    <!-- CTA Button -->
    <div style="text-align: center; margin: 30px 0;">
      <a href="{{baseUrl}}/dashboard" style="display: inline-block; background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); color: white; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 16px;">Learn More</a>
    </div>
  </div>
  
  <!-- Footer -->
  <div style="background: #f9fafb; padding: 20px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
    <p style="color: #6b7280; font-size: 14px; margin: 0;">© {{year}} InteliHire. All rights reserved.</p>
  </div>
</div>
    `
  },
  
  custom: {
    subject: 'Message from InteliHire',
    content: `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
  <!-- Header -->
  <div style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); padding: 40px 30px; text-align: center;">
    <h1 style="color: white; font-size: 32px; font-weight: 700; margin: 0 0 10px 0;">InteliHire</h1>
    <p style="color: rgba(255,255,255,0.9); font-size: 16px; margin: 0;">AI-Powered Job Matching Platform</p>
  </div>
  
  <!-- Content -->
  <div style="padding: 40px 30px;">
    <h2 style="color: #1f2937; font-size: 24px; font-weight: 700; margin: 0 0 20px 0;">Hi {{firstName}}! 👋</h2>
    
    <p style="color: #6b7280; font-size: 16px; line-height: 1.7; margin: 0 0 20px 0;">
      [Write your custom message here. You can use HTML tags for formatting.]
    </p>
    
    <p style="color: #6b7280; font-size: 16px; line-height: 1.7; margin: 20px 0;">
      Thank you for being part of the InteliHire community!
    </p>
    
    <!-- CTA Button -->
    <div style="text-align: center; margin: 30px 0;">
      <a href="{{baseUrl}}/dashboard" style="display: inline-block; background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 16px;">Visit Dashboard</a>
    </div>
  </div>
  
  <!-- Footer -->
  <div style="background: #f9fafb; padding: 20px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
    <p style="color: #6b7280; font-size: 14px; margin: 0;">© {{year}} InteliHire. All rights reserved.</p>
  </div>
</div>
    `
  }
};

// Function to get campaign template by type
const getCampaignTemplate = (type, customData = {}) => {
  const template = campaignTemplates[type] || campaignTemplates.custom;
  const currentDate = new Date();
  
  // Replace common placeholders
  let subject = template.subject
    .replace('{{month}}', currentDate.toLocaleString('default', { month: 'long' }))
    .replace('{{year}}', currentDate.getFullYear().toString());
  
  let content = template.content
    .replace(/{{baseUrl}}/g, process.env.CLIENT_URL || 'http://localhost:3000')
    .replace(/{{year}}/g, currentDate.getFullYear().toString());
  
  // Apply custom data if provided
  Object.keys(customData).forEach(key => {
    const regex = new RegExp(`{{${key}}}`, 'g');
    subject = subject.replace(regex, customData[key]);
    content = content.replace(regex, customData[key]);
  });
  
  return {
    subject,
    content
  };
};

module.exports = {
  passwordResetTemplate,
  getPasswordResetEmailData,
  getWelcomeEmailData,
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendEmailVerificationEmail,
  sendApplicationStatusEmail,
  sendCampaignEmail,
  campaignTemplates,
  getCampaignTemplate
};
