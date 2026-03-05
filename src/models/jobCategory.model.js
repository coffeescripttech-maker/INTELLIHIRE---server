const mongoose = require('mongoose');

const jobCategorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    description: String,
    icon: String,
    color: String,
    parentCategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'JobCategory'
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true
  }
);

// Indexes
jobCategorySchema.index({ name: 1 }, { unique: true });
jobCategorySchema.index({ parentCategory: 1 });

module.exports = mongoose.model('JobCategory', jobCategorySchema);
