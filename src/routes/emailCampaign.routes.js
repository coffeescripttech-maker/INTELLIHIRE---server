const express = require('express');
const router = express.Router();
const EmailCampaign = require('../models/emailCampaign.model');
const User = require('../models/user.model');
const Job = require('../models/job.model');
const emailService = require('../services/email.service');
const { auth, authorize } = require('../middleware/auth.middleware');
const { getCampaignTemplate } = require('../templates/email.templates');

// Get all campaigns
router.get('/', auth, authorize('admin'), async (req, res) => {
  try {
    const { status, type, page = 1, limit = 10 } = req.query;
    const query = {};

    if (status) query.status = status;
    if (type) query.type = type;

    const campaigns = await EmailCampaign.find(query)
      .populate('createdBy', 'firstName lastName email')
      .populate('attachedJobs', 'title company')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const count = await EmailCampaign.countDocuments(query);

    res.json({
      campaigns,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
      total: count
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching campaigns', error: error.message });
  }
});

// Get single campaign
router.get('/:id', auth, authorize('admin'), async (req, res) => {
  try {
    const campaign = await EmailCampaign.findById(req.params.id)
      .populate('createdBy', 'firstName lastName email')
      .populate('attachedJobs');

    if (!campaign) {
      return res.status(404).json({ message: 'Campaign not found' });
    }

    res.json(campaign);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching campaign', error: error.message });
  }
});

// Create campaign
router.post('/', auth, authorize('admin'), async (req, res) => {
  try {
    const campaignData = {
      ...req.body,
      createdBy: req.user._id
    };

    const campaign = new EmailCampaign(campaignData);
    await campaign.save();

    res.status(201).json({
      message: 'Campaign created successfully',
      campaign
    });
  } catch (error) {
    res.status(500).json({ message: 'Error creating campaign', error: error.message });
  }
});

// Update campaign
router.put('/:id', auth, authorize('admin'), async (req, res) => {
  try {
    const campaign = await EmailCampaign.findById(req.params.id);

    if (!campaign) {
      return res.status(404).json({ message: 'Campaign not found' });
    }

    // Don't allow updating sent campaigns
    if (campaign.status === 'sent') {
      return res.status(400).json({ message: 'Cannot update sent campaigns' });
    }

    Object.assign(campaign, req.body);
    await campaign.save();

    res.json({
      message: 'Campaign updated successfully',
      campaign
    });
  } catch (error) {
    res.status(500).json({ message: 'Error updating campaign', error: error.message });
  }
});

// Delete campaign
router.delete('/:id', auth, authorize('admin'), async (req, res) => {
  try {
    const campaign = await EmailCampaign.findById(req.params.id);

    if (!campaign) {
      return res.status(404).json({ message: 'Campaign not found' });
    }

    // Don't allow deleting sent campaigns
    if (campaign.status === 'sent' || campaign.status === 'sending') {
      return res.status(400).json({ message: 'Cannot delete sent or sending campaigns' });
    }

    await EmailCampaign.findByIdAndDelete(req.params.id);

    res.json({ message: 'Campaign deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting campaign', error: error.message });
  }
});

// Get recipient count
router.post('/recipients/count', auth, authorize('admin'), async (req, res) => {
  try {
    const { recipients } = req.body;
    let count = 0;

    if (recipients.type === 'all') {
      count = await User.countDocuments({ isActive: true });
    } else if (recipients.type === 'applicants') {
      count = await User.countDocuments({ role: 'applicant', isActive: true });
    } else if (recipients.type === 'employers') {
      count = await User.countDocuments({ role: 'employer', isActive: true });
    } else if (recipients.type === 'custom' && recipients.customEmails) {
      count = recipients.customEmails.length;
    }

    res.json({ count });
  } catch (error) {
    res.status(500).json({ message: 'Error counting recipients', error: error.message });
  }
});

// Send campaign immediately
router.post('/:id/send', auth, authorize('admin'), async (req, res) => {
  try {
    const campaign = await EmailCampaign.findById(req.params.id)
      .populate('attachedJobs');

    if (!campaign) {
      return res.status(404).json({ message: 'Campaign not found' });
    }

    if (campaign.status === 'sent') {
      return res.status(400).json({ message: 'Campaign already sent' });
    }

    // Update status to sending
    campaign.status = 'sending';
    await campaign.save();

    // Get recipients
    let recipients = [];
    if (campaign.recipients.type === 'all') {
      recipients = await User.find({ isActive: true }).select('email firstName');
    } else if (campaign.recipients.type === 'applicants') {
      recipients = await User.find({ role: 'applicant', isActive: true }).select('email firstName');
    } else if (campaign.recipients.type === 'employers') {
      recipients = await User.find({ role: 'employer', isActive: true }).select('email firstName');
    } else if (campaign.recipients.type === 'custom') {
      recipients = campaign.recipients.customEmails.map(email => ({ email, firstName: 'User' }));
    }

    campaign.stats.totalRecipients = recipients.length;

    // Send emails
    let sentCount = 0;
    let failedCount = 0;

    for (const recipient of recipients) {
      try {
        // Generate email HTML based on template
        let emailHtml = campaign.content;
        
        // Replace placeholders
        emailHtml = emailHtml.replace(/{{firstName}}/g, recipient.firstName || 'User');
        emailHtml = emailHtml.replace(/{{email}}/g, recipient.email);

        // Add attached jobs if any
        if (campaign.attachedJobs && campaign.attachedJobs.length > 0) {
          let jobsHtml = '<div style="margin-top: 20px;"><h3>Featured Jobs:</h3>';
          campaign.attachedJobs.forEach(job => {
            jobsHtml += `
              <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 15px; margin: 10px 0;">
                <h4>${job.title}</h4>
                <p>${job.description ? job.description.substring(0, 150) + '...' : ''}</p>
                <a href="${process.env.CLIENT_URL}/jobs/${job._id}" style="color: #3b82f6;">View Job</a>
              </div>
            `;
          });
          jobsHtml += '</div>';
          emailHtml += jobsHtml;
        }

        const result = await emailService.sendCustomEmail(
          recipient.email,
          campaign.subject,
          emailHtml
        );

        if (result.success) {
          sentCount++;
        } else {
          failedCount++;
        }
      } catch (error) {
        console.error(`Failed to send to ${recipient.email}:`, error);
        failedCount++;
      }
    }

    // Update campaign stats
    campaign.stats.sent = sentCount;
    campaign.stats.failed = failedCount;
    campaign.status = 'sent';
    campaign.sentDate = new Date();
    await campaign.save();

    res.json({
      message: 'Campaign sent successfully',
      stats: {
        total: recipients.length,
        sent: sentCount,
        failed: failedCount
      }
    });
  } catch (error) {
    // Update campaign status to failed
    await EmailCampaign.findByIdAndUpdate(req.params.id, { status: 'failed' });
    res.status(500).json({ message: 'Error sending campaign', error: error.message });
  }
});

// Schedule campaign
router.post('/:id/schedule', auth, async (req, res) => {
  try {
    const { scheduledDate } = req.body;
    const campaign = await EmailCampaign.findById(req.params.id);

    if (!campaign) {
      return res.status(404).json({ message: 'Campaign not found' });
    }

    if (new Date(scheduledDate) <= new Date()) {
      return res.status(400).json({ message: 'Scheduled date must be in the future' });
    }

    campaign.scheduledDate = scheduledDate;
    campaign.status = 'scheduled';
    await campaign.save();

    res.json({
      message: 'Campaign scheduled successfully',
      campaign
    });
  } catch (error) {
    res.status(500).json({ message: 'Error scheduling campaign', error: error.message });
  }
});

// Get campaign statistics
router.get('/stats/overview', auth, async (req, res) => {
  try {
    const totalCampaigns = await EmailCampaign.countDocuments();
    const sentCampaigns = await EmailCampaign.countDocuments({ status: 'sent' });
    const scheduledCampaigns = await EmailCampaign.countDocuments({ status: 'scheduled' });
    const draftCampaigns = await EmailCampaign.countDocuments({ status: 'draft' });

    // Get total emails sent
    const campaigns = await EmailCampaign.find({ status: 'sent' });
    const totalEmailsSent = campaigns.reduce((sum, c) => sum + (c.stats.sent || 0), 0);
    const totalEmailsFailed = campaigns.reduce((sum, c) => sum + (c.stats.failed || 0), 0);

    res.json({
      totalCampaigns,
      sentCampaigns,
      scheduledCampaigns,
      draftCampaigns,
      totalEmailsSent,
      totalEmailsFailed,
      successRate: totalEmailsSent > 0 
        ? ((totalEmailsSent / (totalEmailsSent + totalEmailsFailed)) * 100).toFixed(2)
        : 0
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching statistics', error: error.message });
  }
});

// Test email
router.post('/test', auth, async (req, res) => {
  try {
    const { email, subject, content } = req.body;

    const result = await emailService.sendCustomEmail(email, subject, content);

    if (result.success) {
      res.json({ message: 'Test email sent successfully' });
    } else {
      res.status(500).json({ message: 'Failed to send test email', error: result.error });
    }
  } catch (error) {
    res.status(500).json({ message: 'Error sending test email', error: error.message });
  }
});

// Get email template by campaign type
router.get('/templates/:type', auth, authorize('admin'), async (req, res) => {
  try {
    const { type } = req.params;
    const validTypes = ['newsletter', 'job_alert', 'reminder', 'announcement', 'custom'];
    
    if (!validTypes.includes(type)) {
      return res.status(400).json({ 
        message: 'Invalid template type', 
        validTypes 
      });
    }
    
    const template = getCampaignTemplate(type);
    
    res.json({
      type,
      template
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching template', error: error.message });
  }
});

module.exports = router;
