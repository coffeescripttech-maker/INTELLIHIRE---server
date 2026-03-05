const mongoose = require('mongoose');

const pdsExtractedDataSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  documentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Document',
    required: true
  },
  data: { type: mongoose.Schema.Types.Mixed, required: true }, // use Mixed
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('PdsExtractedData', pdsExtractedDataSchema);
