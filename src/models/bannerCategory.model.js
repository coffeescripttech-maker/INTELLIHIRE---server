const mongoose = require('mongoose');

const bannerCategorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Category name is required'],
      unique: true,
      trim: true,
      maxlength: [50, 'Category name cannot exceed 50 characters']
    },
    description: {
      type: String,
      trim: true,
      maxlength: [200, 'Description cannot exceed 200 characters']
    },
    color: {
      type: String,
      default: '#3B82F6',
      validate: {
        validator: function (v) {
          return /^#[0-9A-F]{6}$/i.test(v);
        },
        message: 'Color must be a valid hex color code'
      }
    },
    icon: {
      type: String,
      trim: true
    },
    isActive: {
      type: Boolean,
      default: true
    },
    usageCount: {
      type: Number,
      default: 0
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    }
  },
  {
    timestamps: true
  }
);

// Indexes
bannerCategorySchema.index({ name: 1 }, { unique: true });
bannerCategorySchema.index({ isActive: 1 });
bannerCategorySchema.index({ createdBy: 1 });

// Static methods
bannerCategorySchema.statics.getActiveCategories = function () {
  return this.find({ isActive: true }).sort({ name: 1 });
};

bannerCategorySchema.statics.incrementUsage = function (categoryId) {
  return this.findByIdAndUpdate(
    categoryId,
    { $inc: { usageCount: 1 } },
    { new: true }
  );
};

bannerCategorySchema.statics.decrementUsage = function (categoryId) {
  return this.findByIdAndUpdate(
    categoryId,
    { $inc: { usageCount: -1 } },
    { new: true }
  );
};

module.exports = mongoose.model('BannerCategory', bannerCategorySchema);
