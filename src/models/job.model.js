const mongoose = require('mongoose');

const jobSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true
    },
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'JobCategory',
      required: true
    },
    description: String,
    responsibilities: String,
    requirements: String,
    benefits: String,
    location: {
      type: String,
      required: true
    },
    employmentType: {
      type: String,
      enum: ['Full-time', 'Part-time', 'Contract', 'Temporary', 'Internship'],
      required: true
    },
    salaryMin: Number,
    salaryMax: Number,
    salaryCurrency: String,
    salaryPeriod: {
      type: String,
      enum: ['hourly', 'daily', 'weekly', 'monthly', 'yearly']
    },
    isSalaryNegotiable: Boolean,
    experienceLevel: {
      type: String,
      enum: ['Entry Level', 'Junior', 'Mid-Level', 'Senior', 'Expert']
    },
    experienceYearsMin: Number,
    experienceYearsMax: Number,
    educationLevel: {
      type: String,
      enum: ['High School', 'Associate', 'Bachelor', 'Master', 'Doctorate']
    },
    skills: [String],
    eligibility: [String],
    postedDate: {
      type: Date,
      default: Date.now
    },
    expiryDate: {
      type: Date,
      required: true
    },
    applicationDeadline: Date,
    applicationEmail: String,
    applicationUrl: String,
    status: {
      type: String,
      enum: ['draft', 'active', 'paused', 'closed', 'archived'],
      default: 'draft'
    },
    isFeatured: {
      type: Boolean,
      default: false
    },
    isUrgent: {
      type: Boolean,
      default: false
    },
    allowsRemote: {
      type: Boolean,
      default: false
    },
    department: String,
    positionCount: {
      type: Number,
      default: 1
    },
    viewCount: {
      type: Number,
      default: 0
    },
    applicationCount: {
      type: Number,
      default: 0
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  {
    timestamps: true
  }
);

// Indexes
jobSchema.index({ title: 'text', description: 'text' });
jobSchema.index({ companyId: 1 });
jobSchema.index({ categoryId: 1 });
jobSchema.index({ status: 1 });
jobSchema.index({ postedDate: 1 });
jobSchema.index({ expiryDate: 1 });
jobSchema.index({ location: 1 });
jobSchema.index({ employmentType: 1 });
jobSchema.index({ isFeatured: 1 });
jobSchema.index({ skills: 1 });

module.exports = mongoose.model('Job', jobSchema);
