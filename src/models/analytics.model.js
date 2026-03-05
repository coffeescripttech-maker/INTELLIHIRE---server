const mongoose = require('mongoose');

const analyticsSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: [
        'job-views',
        'applications',
        'user-registrations',
        'document-uploads',
        'job-postings'
      ],
      required: true
    },
    date: {
      type: Date,
      required: true
    },
    data: {
      totalViews: Number,
      uniqueViews: Number,
      jobViews: {
        type: Map,
        of: Number
      },
      categoryViews: {
        type: Map,
        of: Number
      },
      totalApplications: Number,
      applicationsByJob: {
        type: Map,
        of: Number
      },
      applicationsByCategory: {
        type: Map,
        of: Number
      },
      applicationsByStatus: {
        applied: Number,
        screening: Number,
        interview: Number,
        offered: Number,
        hired: Number,
        rejected: Number
      },
      userRegistrations: {
        total: Number,
        byRole: {
          applicant: Number,
          employer: Number,
          admin: Number
        }
      },
      documentUploads: {
        total: Number,
        byType: {
          pds: Number,
          resume: Number,
          cv: Number,
          coverLetter: Number,
          certificate: Number,
          other: Number
        }
      },
      jobPostings: {
        total: Number,
        active: Number,
        byCategory: {
          type: Map,
          of: Number
        },
        byLocation: {
          type: Map,
          of: Number
        }
      }
    }
  },
  {
    timestamps: true
  }
);

// Indexes
analyticsSchema.index({ type: 1 });
analyticsSchema.index({ date: 1 });
analyticsSchema.index({ type: 1, date: 1 });

module.exports = mongoose.model('Analytics', analyticsSchema);
