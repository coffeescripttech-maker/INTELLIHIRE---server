const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    type: {
      type: String,
      enum: ['pds', 'resume', 'cv', 'cover-letter', 'certificate', 'other'],
      required: true
    },
    title: String,
    fileUrl: {
      type: String,
      required: true
    },
    fileSize: Number,
    fileType: String,
    isDefault: {
      type: Boolean,
      default: false
    },
    parsedData: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    }
  },
  {
    timestamps: true
  }
);

// Indexes
documentSchema.index({ userId: 1 });
documentSchema.index({ type: 1 });
documentSchema.index({ userId: 1, type: 1 });

module.exports = mongoose.model('Document', documentSchema);
