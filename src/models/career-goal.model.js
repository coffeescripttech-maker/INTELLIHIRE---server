const mongoose = require('mongoose');

const careerGoalSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      required: true
    },
    targetDate: {
      type: Date,
      required: true
    },
    status: {
      type: String,
      enum: ['Planning', 'In Progress', 'Completed', 'Paused', 'Cancelled'],
      default: 'Planning'
    },
    progress: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    milestones: [
      {
        title: String,
        description: String,
        targetDate: Date,
        status: {
          type: String,
          enum: ['Not Started', 'In Progress', 'Completed'],
          default: 'Not Started'
        },
        completedAt: Date
      }
    ],
    category: {
      type: String,
      enum: [
        'Career Advancement',
        'Skill Development',
        'Education',
        'Certification',
        'Job Change',
        'Salary Increase',
        'Leadership',
        'Entrepreneurship',
        'Work-Life Balance',
        'Networking'
      ]
    },
    priority: {
      type: String,
      enum: ['High', 'Medium', 'Low'],
      default: 'Medium'
    },
    tags: [
      {
        type: String
      }
    ],
    notes: [
      {
        content: String,
        createdAt: {
          type: Date,
          default: Date.now
        }
      }
    ],
    resources: [
      {
        title: String,
        url: String,
        type: {
          type: String,
          enum: ['Course', 'Book', 'Article', 'Video', 'Tool', 'Other']
        }
      }
    ],
    reminders: [
      {
        date: Date,
        message: String,
        isActive: {
          type: Boolean,
          default: true
        }
      }
    ],
    achievements: [
      {
        title: String,
        description: String,
        achievedAt: {
          type: Date,
          default: Date.now
        },
        evidence: String // URL or description of proof
      }
    ],
    challenges: [
      {
        title: String,
        description: String,
        status: {
          type: String,
          enum: ['Active', 'Resolved', 'Postponed'],
          default: 'Active'
        },
        createdAt: {
          type: Date,
          default: Date.now
        },
        resolvedAt: Date
      }
    ],
    mentor: {
      name: String,
      contact: String,
      role: String
    },
    budget: {
      allocated: Number,
      currency: String,
      spent: {
        type: Number,
        default: 0
      }
    },
    isPublic: {
      type: Boolean,
      default: false
    },
    sharedWith: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    ]
  },
  {
    timestamps: true
  }
);

// Index for better query performance
careerGoalSchema.index({ userId: 1, createdAt: -1 });
careerGoalSchema.index({ userId: 1, status: 1 });
careerGoalSchema.index({ targetDate: 1 });

// Virtual for days remaining
careerGoalSchema.virtual('daysRemaining').get(function () {
  const now = new Date();
  const target = new Date(this.targetDate);
  const diffTime = target - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
});

// Virtual for completion status
careerGoalSchema.virtual('isOverdue').get(function () {
  return this.daysRemaining < 0 && this.status !== 'Completed';
});

// Method to update progress
careerGoalSchema.methods.updateProgress = function (newProgress) {
  this.progress = Math.min(100, Math.max(0, newProgress));

  // Auto-update status based on progress
  if (this.progress === 100) {
    this.status = 'Completed';
  } else if (this.progress > 0 && this.status === 'Planning') {
    this.status = 'In Progress';
  }

  return this.save();
};

// Method to add milestone
careerGoalSchema.methods.addMilestone = function (milestoneData) {
  this.milestones.push(milestoneData);
  return this.save();
};

// Method to complete milestone
careerGoalSchema.methods.completeMilestone = function (milestoneIndex) {
  if (this.milestones[milestoneIndex]) {
    this.milestones[milestoneIndex].status = 'Completed';
    this.milestones[milestoneIndex].completedAt = new Date();

    // Recalculate overall progress
    const completedMilestones = this.milestones.filter(
      m => m.status === 'Completed'
    ).length;
    this.progress = Math.round(
      (completedMilestones / this.milestones.length) * 100
    );
  }
  return this.save();
};

// Method to add achievement
careerGoalSchema.methods.addAchievement = function (achievementData) {
  this.achievements.push(achievementData);
  return this.save();
};

// Method to add challenge
careerGoalSchema.methods.addChallenge = function (challengeData) {
  this.challenges.push(challengeData);
  return this.save();
};

// Method to resolve challenge
careerGoalSchema.methods.resolveChallenge = function (challengeIndex) {
  if (this.challenges[challengeIndex]) {
    this.challenges[challengeIndex].status = 'Resolved';
    this.challenges[challengeIndex].resolvedAt = new Date();
  }
  return this.save();
};

module.exports = mongoose.model('CareerGoal', careerGoalSchema);
