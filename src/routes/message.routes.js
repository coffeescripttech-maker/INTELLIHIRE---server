const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { auth, authorize } = require('../middleware/auth.middleware');
const Message = require('../models/message.model');
const User = require('../models/user.model');

// Validation middleware
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// Get default admin for messaging (applicants)
router.get('/admin/default', auth, async (req, res) => {
  try {
    // Get the first admin user or a designated admin
    const admin = await User.findOne({ role: 'admin' }).select(
      '_id firstName lastName email role'
    );

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'No admin user found'
      });
    }

    res.json({
      success: true,
      admin: {
        _id: admin._id,
        name: `${admin.firstName} ${admin.lastName}`,
        email: admin.email,
        role: admin.role
      }
    });
  } catch (error) {
    console.error('Error fetching default admin:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching admin',
      error: error.message
    });
  }
});

// Get users for messaging (search/autocomplete)
router.get('/users/search', auth, async (req, res) => {
  try {
    const { search, role, limit = 20 } = req.query;

    const query = {
      _id: { $ne: req.user._id } // Exclude current user
    };

    if (role && role !== 'all') {
      query.role = role;
    }

    if (search) {
      query.$or = [
        { firstName: new RegExp(search, 'i') },
        { lastName: new RegExp(search, 'i') },
        { email: new RegExp(search, 'i') }
      ];
    }

    const users = await User.find(query)
      .select('firstName lastName email role')
      .limit(parseInt(limit))
      .sort({ firstName: 1 });

    res.json({
      success: true,
      users: users.map(u => ({
        _id: u._id,
        name: `${u.firstName} ${u.lastName}`,
        email: u.email,
        role: u.role,
        displayName: `${u.firstName} ${u.lastName} (${u.email}) - ${u.role}`
      }))
    });
  } catch (error) {
    console.error('Error searching users:', error);
    res.status(500).json({
      success: false,
      message: 'Error searching users',
      error: error.message
    });
  }
});

// Get inbox messages
router.get('/inbox', auth, async (req, res) => {
  try {
    const { page, limit, status, priority, category, search } = req.query;

    const result = await Message.getInbox(req.user._id, {
      page,
      limit,
      status,
      priority,
      category,
      search
    });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error fetching inbox:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching inbox',
      error: error.message
    });
  }
});

// Get sent messages
router.get('/sent', auth, async (req, res) => {
  try {
    const { page, limit, search } = req.query;

    const result = await Message.getSent(req.user._id, {
      page,
      limit,
      search
    });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error fetching sent messages:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching sent messages',
      error: error.message
    });
  }
});

// Get message statistics
router.get('/stats', auth, async (req, res) => {
  try {
    const stats = await Message.getStats(req.user._id);

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Error fetching message stats:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching message statistics',
      error: error.message
    });
  }
});

// Get message by ID
router.get('/:id', auth, async (req, res) => {
  try {
    const message = await Message.findById(req.params.id)
      .populate('senderId', 'firstName lastName email role')
      .populate('recipientId', 'firstName lastName email role')
      .populate('relatedJobId', 'title')
      .populate('relatedApplicationId');

    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      });
    }

    // Check if user is sender or recipient
    if (
      message.senderId._id.toString() !== req.user._id.toString() &&
      message.recipientId._id.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this message'
      });
    }

    // Mark as read if recipient is viewing
    if (
      message.recipientId._id.toString() === req.user._id.toString() &&
      !message.isRead
    ) {
      message.isRead = true;
      message.status = 'read';
      message.readAt = new Date();
      await message.save();
    }

    res.json({
      success: true,
      message
    });
  } catch (error) {
    console.error('Error fetching message:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching message',
      error: error.message
    });
  }
});

// Send new message
router.post(
  '/',
  [
    auth,
    body('recipientId').notEmpty(),
    body('subject').notEmpty(),
    body('content').notEmpty(),
    validate
  ],
  async (req, res) => {
    try {
      const {
        recipientId,
        subject,
        content,
        priority = 'medium',
        category = 'general',
        relatedJobId,
        relatedApplicationId,
        attachments
      } = req.body;

      const message = new Message({
        senderId: req.user._id,
        recipientId,
        subject,
        content,
        priority,
        category,
        relatedJobId,
        relatedApplicationId,
        attachments
      });

      await message.save();

      // Populate sender and recipient info
      await message.populate('senderId', 'firstName lastName email role');
      await message.populate('recipientId', 'firstName lastName email role');

      res.status(201).json({
        success: true,
        message: message,
        notification: 'Message sent successfully'
      });
    } catch (error) {
      console.error('Error sending message:', error);
      res.status(500).json({
        success: false,
        message: 'Error sending message',
        error: error.message
      });
    }
  }
);

// Reply to message
router.post(
  '/:id/reply',
  [auth, body('content').notEmpty(), validate],
  async (req, res) => {
    try {
      const originalMessage = await Message.findById(req.params.id);

      if (!originalMessage) {
        return res.status(404).json({
          success: false,
          message: 'Original message not found'
        });
      }

      // Create reply message
      const replyMessage = new Message({
        senderId: req.user._id,
        recipientId: originalMessage.senderId,
        subject: `Re: ${originalMessage.subject}`,
        content: req.body.content,
        priority: originalMessage.priority,
        category: originalMessage.category,
        replyToId: originalMessage._id,
        relatedJobId: originalMessage.relatedJobId,
        relatedApplicationId: originalMessage.relatedApplicationId
      });

      await replyMessage.save();

      // Update original message status
      originalMessage.status = 'replied';
      originalMessage.repliedAt = new Date();
      await originalMessage.save();

      await replyMessage.populate('senderId', 'firstName lastName email role');
      await replyMessage.populate(
        'recipientId',
        'firstName lastName email role'
      );

      res.status(201).json({
        success: true,
        message: replyMessage,
        notification: 'Reply sent successfully'
      });
    } catch (error) {
      console.error('Error replying to message:', error);
      res.status(500).json({
        success: false,
        message: 'Error sending reply',
        error: error.message
      });
    }
  }
);

// Mark message as read
router.patch('/:id/read', auth, async (req, res) => {
  try {
    const message = await Message.findById(req.params.id);

    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      });
    }

    if (message.recipientId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to mark this message as read'
      });
    }

    message.isRead = true;
    message.status = 'read';
    message.readAt = new Date();
    await message.save();

    res.json({
      success: true,
      message
    });
  } catch (error) {
    console.error('Error marking message as read:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating message',
      error: error.message
    });
  }
});

// Archive message
router.patch('/:id/archive', auth, async (req, res) => {
  try {
    const message = await Message.findById(req.params.id);

    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      });
    }

    if (message.recipientId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to archive this message'
      });
    }

    message.isArchived = true;
    message.status = 'archived';
    await message.save();

    res.json({
      success: true,
      message
    });
  } catch (error) {
    console.error('Error archiving message:', error);
    res.status(500).json({
      success: false,
      message: 'Error archiving message',
      error: error.message
    });
  }
});

// Flag message
router.patch('/:id/flag', auth, async (req, res) => {
  try {
    const message = await Message.findById(req.params.id);

    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      });
    }

    message.isFlagged = !message.isFlagged;
    await message.save();

    res.json({
      success: true,
      message
    });
  } catch (error) {
    console.error('Error flagging message:', error);
    res.status(500).json({
      success: false,
      message: 'Error flagging message',
      error: error.message
    });
  }
});

// Delete message
router.delete('/:id', auth, async (req, res) => {
  try {
    const message = await Message.findById(req.params.id);

    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      });
    }

    // Check if user is sender or recipient
    if (
      message.senderId.toString() !== req.user._id.toString() &&
      message.recipientId.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this message'
      });
    }

    await message.deleteOne();

    res.json({
      success: true,
      message: 'Message deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting message:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting message',
      error: error.message
    });
  }
});

module.exports = router;
