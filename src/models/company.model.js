const mongoose = require('mongoose');

const companySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    logo: String,
    description: String,
    industry: String,
    website: String,
    contactEmail: String,
    contactPhone: String,
    address: {
      street: String,
      city: String,
      province: String,
      zipCode: String
    },
    isGovernment: {
      type: Boolean,
      default: false
    },
    isVerified: {
      type: Boolean,
      default: false
    },
    verificationNotes: String,
    verificationDate: Date,
    verificationDocuments: [{
      type: String  // URLs to uploaded documents
    }],
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    // PDS Scoring Configuration (customizable per company)
    scoringConfig: {
      education: {
        label: String,
        maxPoints: Number,
        weight: Number,
        enabled: Boolean,
        description: String,
        subCriteria: [{
          name: String,
          points: Number,
          description: String
        }]
      },
      experience: {
        label: String,
        maxPoints: Number,
        weight: Number,
        enabled: Boolean,
        description: String,
        subCriteria: [{
          name: String,
          points: Number,
          description: String
        }]
      },
      training: {
        label: String,
        maxPoints: Number,
        weight: Number,
        enabled: Boolean,
        description: String,
        subCriteria: [{
          name: String,
          points: Number,
          description: String
        }]
      },
      eligibility: {
        label: String,
        maxPoints: Number,
        weight: Number,
        enabled: Boolean,
        description: String,
        subCriteria: [{
          name: String,
          points: Number,
          description: String
        }]
      },
      skills: {
        label: String,
        maxPoints: Number,
        weight: Number,
        enabled: Boolean,
        description: String,
        subCriteria: [{
          name: String,
          points: Number,
          description: String
        }]
      },
      awards: {
        label: String,
        maxPoints: Number,
        weight: Number,
        enabled: Boolean,
        description: String,
        subCriteria: [{
          name: String,
          points: Number,
          description: String
        }]
      },
      relevantExperience: {
        label: String,
        maxPoints: Number,
        weight: Number,
        enabled: Boolean,
        description: String,
        subCriteria: [{
          name: String,
          points: Number,
          description: String
        }]
      },
      certifications: {
        label: String,
        maxPoints: Number,
        weight: Number,
        enabled: Boolean,
        description: String,
        subCriteria: [{
          name: String,
          points: Number,
          description: String
        }]
      }
    }
  },
  {
    timestamps: true
  }
);

// Indexes
companySchema.index({ name: 1 });
companySchema.index({ industry: 1 });
companySchema.index({ isGovernment: 1 });

module.exports = mongoose.model('Company', companySchema);
