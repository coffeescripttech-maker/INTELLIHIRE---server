const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth.middleware');
const Conversation = require('../models/conversation.model');
const Message = require('../models/message.model');

/**
 * GET /api/conversations
 * Get all conversations for the authenticated user
 */
router.get('/', auth, async (req, res) => {
  try {
    const { page, limit, includeArchived } = req.query;

    const result = await Conversation.getUserConversations(req.user._id, {
      page,
      limit,
      includeArchived: includeArchived === 'true'
    });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching conversations',
      error: error.message
    });
  }
});

/**
 * GET /api/conversations/:conversationId
 * Get a specific conversation by ID
 */
router.get('/:conversationId', auth, async (req, res) => {
  try {
    const conversation = await Conversation.findById(req.params.conversationId)
      .populate('participants', 'firstName lastName email role profilePicture')
      .populate({
        path: 'lastMessage',
        populate: {
          path: 'senderId recipientId',
          select: 'firstName lastName email role'
        }
      });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }

    // Verify user is a participant
    const isParticipant = conversation.participants.some(
      p => p._id.toString() === req.user._id.toString()
    );

    if (!isParticipant) {
      return res.status(403).json({
        success: false,
        message: 'You are not a participant in this conversation'
      });
    }

    res.json({
      success: true,
      conversation
    });
  } catch (error) {
    console.error('Error fetching conversation:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching conversation',
      error: error.message
    });
  }
});

/**
 * GET /api/conversations/:conversationId/messages
 * Get all messages in a conversation
 */
router.get('/:conversationId/messages', auth, async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const { conversationId } = req.params;

    // Verify user is a participant
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }

    const isParticipant = conversation.participants.some(
      p => p.toString() === req.user._id.toString()
    );

    if (!isParticipant) {
      return res.status(403).json({
        success: false,
        message: 'You are not a participant in this conversation'
      });
    }

    // Fetch messages
    const messages = await Message.find({ conversationId })
      .populate('senderId', 'firstName lastName email role profilePicture')
      .populate('recipientId', 'firstName lastName email role profilePicture')
      .sort({ createdAt: 1 }) // Oldest first (chat style)
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Message.countDocuments({ conversationId });

    // Mark messages as read for the current user
    await Message.updateMany(
      {
        conversationId,
        recipientId: req.user._id,
        isRead: false
      },
      {
        isRead: true,
        readAt: new Date(),
        status: 'read'
      }
    );

    // Reset unread count for this user
    await conversation.resetUnread(req.user._id);

    res.json({
      success: true,
      messages,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      total
    });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching messages',
      error: error.message
    });
  }
});

/**
 * POST /api/conversations/:conversationId/messages
 * Send a message in a conversation
 */
router.post('/:conversationId/messages', auth, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { content, subject, priority, category } = req.body;

    // Verify conversation exists
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }

    // Verify user is a participant
    const isParticipant = conversation.participants.some(
      p => p.toString() === req.user._id.toString()
    );

    if (!isParticipant) {
      return res.status(403).json({
        success: false,
        message: 'You are not a participant in this conversation'
      });
    }

    // Determine recipient (the other participant)
    const recipientId = conversation.participants.find(
      p => p.toString() !== req.user._id.toString()
    );

    // Create message
    const message = await Message.create({
      conversationId,
      senderId: req.user._id,
      recipientId,
      subject: subject || conversation.subject || 'No Subject',
      content,
      priority: priority || 'medium',
      category: category || 'general',
      status: 'unread',
      isRead: false
    });

    // Populate sender and recipient
    await message.populate('senderId', 'firstName lastName email role');
    await message.populate('recipientId', 'firstName lastName email role');

    // Update conversation
    await conversation.updateLastMessage(message);
    await conversation.incrementUnread(recipientId);

    res.status(201).json({
      success: true,
      message,
      conversation
    });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({
      success: false,
      message: 'Error sending message',
      error: error.message
    });
  }
});

/**
 * POST /api/conversations/start
 * Start a new conversation or get existing one
 */
router.post('/start', auth, async (req, res) => {
  try {
    const { recipientId, subject, content, priority, category } = req.body;

    if (!recipientId) {
      return res.status(400).json({
        success: false,
        message: 'Recipient ID is required'
      });
    }

    // Find or create conversation
    const conversation = await Conversation.findOrCreateConversation(
      req.user._id,
      recipientId
    );

    // If content provided, send the first message
    if (content) {
      const message = await Message.create({
        conversationId: conversation._id,
        senderId: req.user._id,
        recipientId,
        subject: subject || 'New Conversation',
        content,
        priority: priority || 'medium',
        category: category || 'general',
        status: 'unread',
        isRead: false
      });

      await message.populate('senderId', 'firstName lastName email role');
      await message.populate('recipientId', 'firstName lastName email role');

      await conversation.updateLastMessage(message);
      await conversation.incrementUnread(recipientId);

      return res.status(201).json({
        success: true,
        conversation,
        message
      });
    }

    res.json({
      success: true,
      conversation
    });
  } catch (error) {
    console.error('Error starting conversation:', error);
    res.status(500).json({
      success: false,
      message: 'Error starting conversation',
      error: error.message
    });
  }
});

/**
 * PATCH /api/conversations/:conversationId/archive
 * Archive/unarchive a conversation
 */
router.patch('/:conversationId/archive', auth, async (req, res) => {
  try {
    const conversation = await Conversation.findById(req.params.conversationId);

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }

    const currentStatus =
      conversation.isArchived.get(req.user._id.toString()) || false;
    conversation.isArchived.set(req.user._id.toString(), !currentStatus);
    await conversation.save();

    res.json({
      success: true,
      isArchived: !currentStatus,
      conversation
    });
  } catch (error) {
    console.error('Error archiving conversation:', error);
    res.status(500).json({
      success: false,
      message: 'Error archiving conversation',
      error: error.message
    });
  }
});

/**
 * PATCH /api/conversations/:conversationId/pin
 * Pin/unpin a conversation
 */
router.patch('/:conversationId/pin', auth, async (req, res) => {
  try {
    const conversation = await Conversation.findById(req.params.conversationId);

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }

    const currentStatus =
      conversation.isPinned.get(req.user._id.toString()) || false;
    conversation.isPinned.set(req.user._id.toString(), !currentStatus);
    await conversation.save();

    res.json({
      success: true,
      isPinned: !currentStatus,
      conversation
    });
  } catch (error) {
    console.error('Error pinning conversation:', error);
    res.status(500).json({
      success: false,
      message: 'Error pinning conversation',
      error: error.message
    });
  }
});

/**
 * DELETE /api/conversations/:conversationId
 * Delete a conversation (for current user only)
 */
router.delete('/:conversationId', auth, async (req, res) => {
  try {
    const conversation = await Conversation.findById(req.params.conversationId);

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }

    // Archive instead of delete (soft delete)
    conversation.isArchived.set(req.user._id.toString(), true);
    await conversation.save();

    res.json({
      success: true,
      message: 'Conversation deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting conversation:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting conversation',
      error: error.message
    });
  }
});

module.exports = router;
