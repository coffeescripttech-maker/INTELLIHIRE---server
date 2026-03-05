const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');

const bannerTemplateSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Template name is required'],
      trim: true,
      maxlength: [100, 'Template name cannot exceed 100 characters']
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters']
    },
    category: {
      type: String,
      required: [true, 'Template category is required'],
      enum: [
        'promotion',
        'announcement',
        'system',
        'event',
        'job',
        'company',
        'custom'
      ],
      default: 'custom'
    },
    tags: [
      {
        type: String,
        trim: true,
        lowercase: true
      }
    ],
    templateData: {
      title: {
        type: String,
        required: true,
        trim: true
      },
      description: {
        type: String,
        required: true,
        trim: true
      },
      imageUrl: {
        type: String,
        required: true,
        trim: true
      },
      linkUrl: {
        type: String,
        trim: true
      },
      position: {
        type: String,
        enum: ['top', 'middle', 'bottom', 'sidebar'],
        default: 'top'
      },
      priority: {
        type: Number,
        min: 1,
        max: 10,
        default: 5
      },
      targetAudience: {
        type: String,
        enum: ['all', 'applicants', 'employers', 'admin'],
        default: 'all'
      },
      // Template-specific styling
      styling: {
        backgroundColor: String,
        textColor: String,
        buttonColor: String,
        borderRadius: String,
        fontSize: String,
        fontWeight: String
      },
      // Template-specific content placeholders
      placeholders: [
        {
          key: String,
          label: String,
          type: {
            type: String,
            enum: ['text', 'url', 'number', 'select', 'date'],
            default: 'text'
          },
          required: Boolean,
          defaultValue: String,
          options: [String] // For select type
        }
      ]
    },
    previewImage: {
      type: String,
      trim: true
    },
    isPublic: {
      type: Boolean,
      default: false
    },
    usageCount: {
      type: Number,
      default: 0,
      min: 0
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    lastUsedAt: Date
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Indexes for efficient queries
bannerTemplateSchema.index({ category: 1, isPublic: 1 });
bannerTemplateSchema.index({ tags: 1 });
bannerTemplateSchema.index({ usageCount: -1 });
bannerTemplateSchema.index({ createdAt: -1 });

// Add pagination plugin
bannerTemplateSchema.plugin(mongoosePaginate);

// Virtual for template popularity
bannerTemplateSchema.virtual('popularity').get(function () {
  const daysSinceCreation =
    (Date.now() - this.createdAt) / (1000 * 60 * 60 * 24);
  return this.usageCount / Math.max(daysSinceCreation, 1);
});

// Static method to get templates by category
bannerTemplateSchema.statics.getTemplatesByCategory = function (
  category,
  isPublic = true
) {
  const query = { category };
  if (isPublic !== null) {
    query.isPublic = isPublic;
  }

  return this.find(query)
    .sort({ usageCount: -1, createdAt: -1 })
    .populate('createdBy', 'name email');
};

// Static method to search templates
bannerTemplateSchema.statics.searchTemplates = function (
  searchTerm,
  filters = {}
) {
  const query = {
    $or: [
      { name: new RegExp(searchTerm, 'i') },
      { description: new RegExp(searchTerm, 'i') },
      { tags: { $in: [new RegExp(searchTerm, 'i')] } }
    ]
  };

  // Apply additional filters
  if (filters.category) query.category = filters.category;
  if (filters.isPublic !== undefined) query.isPublic = filters.isPublic;
  if (filters.tags && filters.tags.length > 0) {
    query.tags = { $in: filters.tags };
  }

  return this.find(query)
    .sort({ usageCount: -1, createdAt: -1 })
    .populate('createdBy', 'name email');
};

// Instance method to increment usage count
bannerTemplateSchema.methods.incrementUsage = function () {
  this.usageCount += 1;
  this.lastUsedAt = new Date();
  return this.save();
};

// Instance method to create banner from template
bannerTemplateSchema.methods.createBannerFromTemplate = function (
  overrides = {}
) {
  const bannerData = {
    ...this.templateData,
    ...overrides
  };

  // Replace placeholders with actual values
  if (overrides.placeholderValues) {
    this.templateData.placeholders.forEach(placeholder => {
      const value = overrides.placeholderValues[placeholder.key];
      if (value !== undefined) {
        // Replace placeholder in template data
        bannerData.title = bannerData.title.replace(
          `{{${placeholder.key}}}`,
          value
        );
        bannerData.description = bannerData.description.replace(
          `{{${placeholder.key}}}`,
          value
        );
        bannerData.linkUrl = bannerData.linkUrl.replace(
          `{{${placeholder.key}}}`,
          value
        );
      }
    });
  }

  return bannerData;
};

module.exports = mongoose.model('BannerTemplate', bannerTemplateSchema);
