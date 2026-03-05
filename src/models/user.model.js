const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true
    },
    password: {
      type: String,
      required: true
    },
    role: {
      type: String,
      enum: ['applicant', 'admin', 'employer'],
      required: true
    },
    firstName: String,
    lastName: String,
    phoneNumber: String,
    address: {
      street: String,
      city: String,
      province: String,
      zipCode: String
    },
    gender: String,
    dob: Date,
    summary: String,
    experience: { type: [Object], default: [] },
    education: { type: [Object], default: [] },
    certification: { type: [Object], default: [] },
    profilePicture: String,
    pdsFile: String,
    savedJobs: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Job' }],
    activeCareerPaths: [
      { type: mongoose.Schema.Types.ObjectId, ref: 'CareerPath' }
    ],
    completedMilestones: [{ type: mongoose.Schema.Types.ObjectId }],
    careerInterests: [String],
    preferences: {
      employmentType: String,
      workEnvironment: String,
      salaryRange: {
        min: Number,
        max: Number,
        currency: String
      },
      careerInterests: [String],
      skillsToDevelop: [String]
    },
    isVerified: {
      type: Boolean,
      default: false
    },
    emailVerificationToken: {
      type: String
    },
    emailVerificationExpires: {
      type: Date
    },
    isActive: {
      type: Boolean,
      default: true
    },
    lastLogin: Date,
    createdAt: {
      type: Date,
      default: Date.now
    },
    updatedAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
