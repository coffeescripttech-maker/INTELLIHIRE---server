const mongoose = require('mongoose');

const bannerTagSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Tag name is required'],
      unique: true,
      trim: true,
      maxlength: [30, 'Tag name cannot exceed 30 characters']
    },
    description: {
      type: String,
      trim: true,
      maxlength: [100, 'Description cannot exceed 100 characters']
    },
    color: {
      type: String,
      default: '#6B7280',
      validate: {
        validator: function (v) {
          return /^#[0-9A-F]{6}$/i.test(v);
        },
        message: 'Color must be a valid hex color code'
      }
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
bannerTagSchema.index({ name: 1 }, { unique: true });
bannerTagSchema.index({ isActive: 1 });
bannerTagSchema.index({ createdBy: 1 });

// Static methods
bannerTagSchema.statics.getActiveTags = function () {
  return this.find({ isActive: true }).sort({ name: 1 });
};

bannerTagSchema.statics.incrementUsage = function (tagId) {
  return this.findByIdAndUpdate(
    tagId,
    { $inc: { usageCount: 1 } },
    { new: true }
  );
};

bannerTagSchema.statics.decrementUsage = function (tagId) {
  return this.findByIdAndUpdate(
    tagId,
    { $inc: { usageCount: -1 } },
    { new: true }
  );
};

module.exports = mongoose.model('BannerTag', bannerTagSchema);



