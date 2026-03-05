const mongoose = require('mongoose');

const milestoneSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true
    },
    description: {
      type: String,
      required: true
    },
    type: {
      type: String,
      enum: ['skill', 'certification', 'experience', 'education'],
      required: true
    },
    priority: {
      type: String,
      enum: ['High', 'Medium', 'Low'],
      default: 'Medium'
    },
    estimatedTime: {
      type: Number, // in weeks
      required: true
    },
    resources: [
      {
        type: String
      }
    ],
    prerequisites: [
      {
        type: String
      }
    ]
  },
  {
    timestamps: true
  }
);

const careerPathSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      required: true
    },
    category: {
      type: String,
      required: true,
      enum: [
        'Information Technology',
        'Data Science',
        'Marketing',
        'Finance',
        'Healthcare',
        'Education',
        'Engineering',
        'Design',
        'Sales',
        'Human Resources',
        'Operations',
        'Consulting'
      ]
    },
    level: {
      type: String,
      required: true,
      enum: ['Entry', 'Mid', 'Senior', 'Executive']
    },
    estimatedDuration: {
      type: Number, // in months
      required: true
    },
    difficulty: {
      type: String,
      required: true,
      enum: ['Easy', 'Medium', 'Hard', 'Expert']
    },
    prerequisites: [
      {
        type: String
      }
    ],
    skills: [
      {
        type: String
      }
    ],
    certifications: [
      {
        type: String
      }
    ],
    averageSalary: {
      min: {
        type: Number,
        required: true
      },
      max: {
        type: Number,
        required: true
      },
      currency: {
        type: String,
        default: 'PHP'
      }
    },
    jobMarketDemand: {
      type: String,
      required: true,
      enum: ['Low', 'Medium', 'High', 'Very High']
    },
    growthPotential: {
      type: Number, // percentage
      required: true
    },
    relatedJobs: [
      {
        type: String
      }
    ],
    milestones: [milestoneSchema],
    isActive: {
      type: Boolean,
      default: true
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    tags: [
      {
        type: String
      }
    ],
    industry: {
      type: String
    },
    workEnvironment: {
      type: String,
      enum: ['Remote', 'Hybrid', 'On-site', 'Flexible']
    },
    careerProgression: [
      {
        title: String,
        description: String,
        requirements: [String],
        averageSalary: {
          min: Number,
          max: Number,
          currency: String
        }
      }
    ]
  },
  {
    timestamps: true
  }
);

// Index for better query performance
careerPathSchema.index({ category: 1, level: 1 });
careerPathSchema.index({ isActive: 1 });
careerPathSchema.index({ createdAt: -1 });

module.exports = mongoose.model('CareerPath', careerPathSchema);








