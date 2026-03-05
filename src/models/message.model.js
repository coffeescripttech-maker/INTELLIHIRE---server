const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    // Link to conversation thread
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true
    },

    subject: {
      type: String,
      required: true,
      trim: true
    },
    content: {
      type: String,
      required: true
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    recipientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    status: {
      type: String,
      enum: ['unread', 'read', 'replied', 'archived'],
      default: 'unread'
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium'
    },
    category: {
      type: String,
      enum: [
        'general',
        'support',
        'technical',
        'billing',
        'feedback',
        'application'
      ],
      default: 'general'
    },
    isRead: {
      type: Boolean,
      default: false
    },
    readAt: {
      type: Date
    },
    repliedAt: {
      type: Date
    },
    replyToId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message'
    },
    attachments: [
      {
        name: String,
        url: String,
        size: String,
        type: String
      }
    ],
    relatedJobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Job'
    },
    relatedApplicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Application'
    },
    tags: [String],
    isArchived: {
      type: Boolean,
      default: false
    },
    isFlagged: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true
  }
);

// Indexes for performance
messageSchema.index({ senderId: 1, createdAt: -1 });
messageSchema.index({ recipientId: 1, createdAt: -1 });
messageSchema.index({ status: 1 });
messageSchema.index({ isRead: 1 });
messageSchema.index({ priority: 1 });
messageSchema.index({ category: 1 });

// Static method to get inbox messages
messageSchema.statics.getInbox = async function (userId, options = {}) {
  const { page = 1, limit = 10, status, priority, category, search } = options;

  const query = {
    recipientId: userId,
    isArchived: false
  };

  if (status && status !== 'all') query.status = status;
  if (priority && priority !== 'all') query.priority = priority;
  if (category && category !== 'all') query.category = category;
  if (search) {
    query.$or = [
      { subject: new RegExp(search, 'i') },
      { content: new RegExp(search, 'i') }
    ];
  }

  const messages = await this.find(query)
    .populate('senderId', 'firstName lastName email role')
    .populate('recipientId', 'firstName lastName email role')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(parseInt(limit));

  const total = await this.countDocuments(query);

  return {
    messages,
    totalPages: Math.ceil(total / limit),
    currentPage: parseInt(page),
    total
  };
};

// Static method to get sent messages
messageSchema.statics.getSent = async function (userId, options = {}) {
  const { page = 1, limit = 10, search } = options;

  const query = {
    senderId: userId
  };

  if (search) {
    query.$or = [
      { subject: new RegExp(search, 'i') },
      { content: new RegExp(search, 'i') }
    ];
  }

  const messages = await this.find(query)
    .populate('senderId', 'firstName lastName email role')
    .populate('recipientId', 'firstName lastName email role')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(parseInt(limit));

  const total = await this.countDocuments(query);

  return {
    messages,
    totalPages: Math.ceil(total / limit),
    currentPage: parseInt(page),
    total
  };
};

// Static method to get message statistics
messageSchema.statics.getStats = async function (userId) {
  const [totalMessages, unreadMessages, repliedMessages] = await Promise.all([
    this.countDocuments({ recipientId: userId }),
    this.countDocuments({ recipientId: userId, isRead: false }),
    this.countDocuments({ recipientId: userId, status: 'replied' })
  ]);

  // Calculate average response time
  const repliedMsgs = await this.find({
    recipientId: userId,
    status: 'replied',
    repliedAt: { $exists: true }
  });

  let averageResponseTime = 0;
  if (repliedMsgs.length > 0) {
    const totalResponseTime = repliedMsgs.reduce((sum, msg) => {
      const responseTime =
        new Date(msg.repliedAt).getTime() - new Date(msg.createdAt).getTime();
      return sum + responseTime;
    }, 0);
    averageResponseTime = Math.round(
      totalResponseTime / repliedMsgs.length / (1000 * 60 * 60)
    ); // in hours
  }

  return {
    totalMessages,
    unreadMessages,
    repliedMessages,
    averageResponseTime
  };
};

module.exports = mongoose.model('Message', messageSchema);
