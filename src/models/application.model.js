const mongoose = require('mongoose');

const applicationSchema = new mongoose.Schema(
  {
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Job',
      required: true
    },
    applicantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    resumeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Document'
    },
    coverLetterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Document'
    },
    pdsId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Document'
    },
    additionalDocuments: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Document'
      }
    ],
    status: {
      type: String,
      enum: [
        'applied',
        'screening',
        'interview',
        'offered',
        'hired',
        'rejected',
        'withdrawn'
      ],
      default: 'applied'
    },
    notes: String,
    matchScore: Number,
    matchDetails: {
      educationScore: Number,
      experienceScore: Number,
      skillsScore: Number,
      eligibilityScore: Number
    },
    interviewDate: Date,
    interviewLocation: String,
    interviewType: {
      type: String,
      enum: ['in-person', 'phone', 'video']
    },
    rejectionReason: String
  },
  {
    timestamps: true
  }
);

// Indexes
applicationSchema.index({ jobId: 1 });
applicationSchema.index({ applicantId: 1 });
applicationSchema.index({ status: 1 });
applicationSchema.index({ jobId: 1, applicantId: 1 }, { unique: true });
applicationSchema.index({ matchScore: 1 });

module.exports = mongoose.model('Application', applicationSchema);
