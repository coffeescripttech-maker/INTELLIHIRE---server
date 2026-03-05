const mongoose = require('mongoose');

const resumeSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Document',
      required: true
    },
    resumeData: {
      type: mongoose.Schema.Types.Mixed,
      required: true
    },
    metadata: {
      generatedAt: {
        type: Date,
        default: Date.now
      },
      atsOptimized: {
        type: Boolean,
        default: true
      },
      targetIndustry: {
        type: String,
        default: 'General'
      },
      targetRole: {
        type: String,
        default: 'Professional'
      },
      keywordCount: {
        type: Number,
        default: 0
      },
      atsScore: {
        type: Number,
        min: 0,
        max: 100,
        default: 0
      }
    },
    variants: [
      {
        industry: String,
        role: String,
        resumeData: mongoose.Schema.Types.Mixed,
        generatedAt: {
          type: Date,
          default: Date.now
        }
      }
    ],
    optimizedForJobs: [
      {
        jobTitle: String,
        companyName: String,
        jobDescription: String,
        resumeData: mongoose.Schema.Types.Mixed,
        optimizedAt: {
          type: Date,
          default: Date.now
        }
      }
    ],
    status: {
      type: String,
      enum: ['generated', 'optimized', 'archived'],
      default: 'generated'
    }
  },
  {
    timestamps: true
  }
);

// Index for efficient queries
resumeSchema.index({ userId: 1, documentId: 1 });
resumeSchema.index({ userId: 1, 'metadata.generatedAt': -1 });

module.exports = mongoose.model('Resume', resumeSchema);
