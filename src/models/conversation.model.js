const mongoose = require('mongoose');

/**
 * Conversation Model
 * Represents a unique conversation thread between two users
 */
const conversationSchema = new mongoose.Schema(
  {
    // Participants in the conversation (always 2 users for direct messaging)
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
      }
    ],

    // Last message in this conversation (for quick preview)
    lastMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message'
    },

    // Last message content (denormalized for performance)
    lastMessageContent: {
      type: String,
      default: ''
    },

    // Last message timestamp (for sorting conversations)
    lastMessageAt: {
      type: Date,
      default: Date.now
    },

    // Unread count per participant
    unreadCount: {
      type: Map,
      of: Number,
      default: {}
    },

    // Metadata
    isArchived: {
      type: Map,
      of: Boolean,
      default: {}
    },

    isPinned: {
      type: Map,
      of: Boolean,
      default: {}
    },

    // Subject/Title (optional, for easier identification)
    subject: {
      type: String,
      default: ''
    }
  },
  {
    timestamps: true
  }
);

// Indexes for performance
conversationSchema.index({ participants: 1 });
conversationSchema.index({ lastMessageAt: -1 });
conversationSchema.index({ participants: 1, lastMessageAt: -1 });

/**
 * Static method to find or create a conversation between two users
 */
conversationSchema.statics.findOrCreateConversation = async function (
  userId1,
  userId2
) {
  // Sort user IDs to ensure consistent participant order
  const participants = [userId1, userId2].sort();

  let conversation = await this.findOne({
    participants: { $all: participants, $size: 2 }
  }).populate('lastMessage');

  if (!conversation) {
    conversation = await this.create({
      participants,
      unreadCount: new Map([
        [userId1.toString(), 0],
        [userId2.toString(), 0]
      ]),
      isArchived: new Map([
        [userId1.toString(), false],
        [userId2.toString(), false]
      ]),
      isPinned: new Map([
        [userId1.toString(), false],
        [userId2.toString(), false]
      ])
    });
  }

  return conversation;
};

/**
 * Static method to get all conversations for a user
 */
conversationSchema.statics.getUserConversations = async function (
  userId,
  options = {}
) {
  const { page = 1, limit = 50, includeArchived = false } = options;

  const query = {
    participants: userId
  };

  if (!includeArchived) {
    query[`isArchived.${userId}`] = { $ne: true };
  }

  const conversations = await this.find(query)
    .populate('participants', 'firstName lastName email role profilePicture')
    .populate({
      path: 'lastMessage',
      populate: {
        path: 'senderId recipientId',
        select: 'firstName lastName email role'
      }
    })
    .sort({ lastMessageAt: -1 })
    .skip((page - 1) * limit)
    .limit(parseInt(limit));

  const total = await this.countDocuments(query);

  // Transform conversations to include "other user" info
  const transformedConversations = conversations.map(conv => {
    const otherUser = conv.participants.find(
      p => p._id.toString() !== userId.toString()
    );

    return {
      _id: conv._id,
      otherUser: {
        _id: otherUser._id,
        firstName: otherUser.firstName,
        lastName: otherUser.lastName,
        email: otherUser.email,
        role: otherUser.role,
        profilePicture: otherUser.profilePicture
      },
      lastMessage: conv.lastMessage,
      lastMessageContent: conv.lastMessageContent,
      lastMessageAt: conv.lastMessageAt,
      unreadCount: conv.unreadCount.get(userId.toString()) || 0,
      isArchived: conv.isArchived.get(userId.toString()) || false,
      isPinned: conv.isPinned.get(userId.toString()) || false,
      subject: conv.subject,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt
    };
  });

  return {
    conversations: transformedConversations,
    totalPages: Math.ceil(total / limit),
    currentPage: parseInt(page),
    total
  };
};

/**
 * Instance method to update last message
 */
conversationSchema.methods.updateLastMessage = async function (message) {
  this.lastMessage = message._id;
  this.lastMessageContent = message.content;
  this.lastMessageAt = message.createdAt || new Date();

  // Update subject if this is the first message
  if (!this.subject && message.subject) {
    this.subject = message.subject;
  }

  await this.save();
  return this;
};

/**
 * Instance method to increment unread count for a user
 */
conversationSchema.methods.incrementUnread = async function (userId) {
  const currentCount = this.unreadCount.get(userId.toString()) || 0;
  this.unreadCount.set(userId.toString(), currentCount + 1);
  await this.save();
  return this;
};

/**
 * Instance method to reset unread count for a user
 */
conversationSchema.methods.resetUnread = async function (userId) {
  this.unreadCount.set(userId.toString(), 0);
  await this.save();
  return this;
};

module.exports = mongoose.model('Conversation', conversationSchema);
