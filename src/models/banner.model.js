const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');

const bannerSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Banner title is required'],
      trim: true,
      maxlength: [100, 'Title cannot exceed 100 characters']
    },
    description: {
      type: String,
      required: [true, 'Banner description is required'],
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters']
    },
    imageUrl: {
      type: String,
      required: [true, 'Image URL is required'],
      trim: true
    },
    linkUrl: {
      type: String,
      trim: true,
      validate: {
        validator: function (v) {
          return !v || /^https?:\/\/.+/.test(v);
        },
        message: 'Link URL must be a valid HTTP/HTTPS URL'
      }
    },
    position: {
      type: String,
      enum: ['top', 'middle', 'bottom', 'sidebar'],
      default: 'top',
      required: true
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'scheduled'],
      default: 'active',
      required: true
    },
    priority: {
      type: Number,
      min: [1, 'Priority must be at least 1'],
      max: [10, 'Priority cannot exceed 10'],
      default: 1,
      required: true
    },
    startDate: {
      type: Date,
      validate: {
        validator: function (v) {
          return !v || !this.endDate || v < this.endDate;
        },
        message: 'Start date must be before end date'
      }
    },
    endDate: {
      type: Date,
      validate: {
        validator: function (v) {
          return !v || !this.startDate || v > this.startDate;
        },
        message: 'End date must be after start date'
      }
    },
    startDateTime: {
      type: Date,
      validate: {
        validator: function (v) {
          return !v || !this.endDateTime || v < this.endDateTime;
        },
        message: 'Start date/time must be before end date/time'
      }
    },
    endDateTime: {
      type: Date,
      validate: {
        validator: function (v) {
          return !v || !this.startDateTime || v > this.startDateTime;
        },
        message: 'End date/time must be after start date/time'
      }
    },
    timezone: {
      type: String,
      default: 'UTC'
    },
    recurring: {
      type: Boolean,
      default: false
    },
    recurringPattern: {
      type: String,
      enum: ['none', 'daily', 'weekly', 'monthly'],
      default: 'none'
    },
    category: {
      type: String,
      trim: true,
      maxlength: [50, 'Category cannot exceed 50 characters']
    },
    tags: [
      {
        type: String,
        trim: true,
        maxlength: [30, 'Tag cannot exceed 30 characters']
      }
    ],
    targetAudience: {
      type: String,
      enum: ['all', 'applicants', 'employers', 'admin'],
      default: 'all',
      required: true
    },
    clicks: {
      type: Number,
      default: 0,
      min: [0, 'Clicks cannot be negative']
    },
    impressions: {
      type: Number,
      default: 0,
      min: [0, 'Impressions cannot be negative']
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    lastModifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Virtual for CTR calculation
bannerSchema.virtual('ctr').get(function () {
  if (this.impressions === 0) return 0;
  return ((this.clicks / this.impressions) * 100).toFixed(2);
});

// Index for efficient queries
bannerSchema.index({ status: 1, position: 1 });
bannerSchema.index({ targetAudience: 1, status: 1 });
bannerSchema.index({ priority: 1, createdAt: -1 });
bannerSchema.index({ startDate: 1, endDate: 1 });
bannerSchema.index({ startDateTime: 1, endDateTime: 1 });
bannerSchema.index({ recurring: 1, recurringPattern: 1 });
bannerSchema.index({ timezone: 1 });
bannerSchema.index({ category: 1 });
bannerSchema.index({ tags: 1 });

// Add pagination plugin
bannerSchema.plugin(mongoosePaginate);

// Pre-save middleware to update lastModifiedBy
bannerSchema.pre('save', function (next) {
  if (this.isModified() && !this.isNew) {
    this.lastModifiedBy = this.createdBy; // In real app, this would be the current user
  }
  next();
});

// Static method to get active banners for a specific audience
bannerSchema.statics.getActiveBanners = function (
  audience = 'all',
  position = null
) {
  const now = new Date();
  const query = {
    $or: [
      { status: 'active' },
      {
        status: 'scheduled',
        $or: [
          { startDateTime: { $exists: false } },
          { startDateTime: { $lte: now } }
        ],
        $or: [
          { endDateTime: { $exists: false } },
          { endDateTime: { $gte: now } }
        ]
      }
    ],
    $or: [{ targetAudience: audience }, { targetAudience: 'all' }],
    $and: [
      {
        $or: [{ startDate: { $exists: false } }, { startDate: { $lte: now } }]
      },
      {
        $or: [{ endDate: { $exists: false } }, { endDate: { $gte: now } }]
      }
    ]
  };

  if (position) {
    query.position = position;
  }

  return this.find(query)
    .sort({ priority: 1, createdAt: -1 })
    .populate('createdBy', 'name email')
    .populate('lastModifiedBy', 'name email');
};

// Instance method to increment clicks
bannerSchema.methods.incrementClicks = function () {
  this.clicks += 1;
  return this.save();
};

// Instance method to increment impressions
bannerSchema.methods.incrementImpressions = function () {
  this.impressions += 1;
  return this.save();
};

module.exports = mongoose.model('Banner', bannerSchema);
