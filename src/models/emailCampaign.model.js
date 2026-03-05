const mongoose = require('mongoose');

const emailCampaignSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    subject: {
      type: String,
      required: true,
      trim: true
    },
    content: {
      type: String,
      required: true
    },
    type: {
      type: String,
      enum: ['newsletter', 'job_alert', 'reminder', 'announcement', 'custom'],
      default: 'custom'
    },
    status: {
      type: String,
      enum: ['draft', 'scheduled', 'sending', 'sent', 'failed'],
      default: 'draft'
    },
    recipients: {
      type: {
        type: String,
        enum: ['all', 'applicants', 'employers', 'custom'],
        default: 'all'
      },
      customEmails: [String],
      filters: {
        role: [String],
        verified: Boolean,
        active: Boolean
      }
    },
    scheduledDate: {
      type: Date
    },
    sentDate: {
      type: Date
    },
    stats: {
      totalRecipients: {
        type: Number,
        default: 0
      },
      sent: {
        type: Number,
        default: 0
      },
      failed: {
        type: Number,
        default: 0
      },
      opened: {
        type: Number,
        default: 0
      },
      clicked: {
        type: Number,
        default: 0
      }
    },
    attachedJobs: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Job'
      }
    ],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    template: {
      type: String,
      enum: ['default', 'job_listing', 'newsletter', 'announcement'],
      default: 'default'
    },
    metadata: {
      type: Map,
      of: String
    }
  },
  {
    timestamps: true
  }
);

// Indexes for faster queries
emailCampaignSchema.index({ status: 1, scheduledDate: 1 });
emailCampaignSchema.index({ createdBy: 1 });
emailCampaignSchema.index({ type: 1 });
emailCampaignSchema.index({ createdAt: -1 });

module.exports = mongoose.model('EmailCampaign', emailCampaignSchema);
