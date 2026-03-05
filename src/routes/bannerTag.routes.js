const express = require('express');
const router = express.Router();
const BannerTag = require('../models/bannerTag.model');
const { auth } = require('../middleware/auth.middleware');

// Get all active tags
router.get('/', async (req, res) => {
  try {
    const tags = await BannerTag.getActiveTags();
    res.json({
      success: true,
      data: tags
    });
  } catch (error) {
    console.error('Error fetching banner tags:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching tags',
      error: error.message
    });
  }
});

// Get all tags (including inactive) - Admin only
router.get('/all', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin role required.'
      });
    }

    const tags = await BannerTag.find().sort({ name: 1 });
    res.json({
      success: true,
      data: tags
    });
  } catch (error) {
    console.error('Error fetching all banner tags:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching all tags',
      error: error.message
    });
  }
});

// Create new tag - Admin only
router.post('/', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin role required.'
      });
    }

    const { name, description, color } = req.body;

    // Check if tag already exists
    const existingTag = await BannerTag.findOne({ name });
    if (existingTag) {
      return res.status(400).json({
        success: false,
        message: 'Tag with this name already exists'
      });
    }

    const tag = new BannerTag({
      name,
      description,
      color,
      createdBy: req.user.id
    });

    await tag.save();

    res.status(201).json({
      success: true,
      message: 'Tag created successfully',
      data: tag
    });
  } catch (error) {
    console.error('Error creating banner tag:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while creating tag',
      error: error.message
    });
  }
});

// Update tag - Admin only
router.put('/:id', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin role required.'
      });
    }

    const { name, description, color, isActive } = req.body;

    // Check if tag exists
    const tag = await BannerTag.findById(req.params.id);
    if (!tag) {
      return res.status(404).json({
        success: false,
        message: 'Tag not found'
      });
    }

    // Check if name is being changed and if it conflicts
    if (name && name !== tag.name) {
      const existingTag = await BannerTag.findOne({ name });
      if (existingTag) {
        return res.status(400).json({
          success: false,
          message: 'Tag with this name already exists'
        });
      }
    }

    const updatedTag = await BannerTag.findByIdAndUpdate(
      req.params.id,
      { name, description, color, isActive },
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      message: 'Tag updated successfully',
      data: updatedTag
    });
  } catch (error) {
    console.error('Error updating banner tag:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating tag',
      error: error.message
    });
  }
});

// Delete tag - Admin only
router.delete('/:id', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin role required.'
      });
    }

    const tag = await BannerTag.findById(req.params.id);
    if (!tag) {
      return res.status(404).json({
        success: false,
        message: 'Tag not found'
      });
    }

    // Check if tag is being used
    if (tag.usageCount > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete tag that is being used by banners'
      });
    }

    await BannerTag.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Tag deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting banner tag:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting tag',
      error: error.message
    });
  }
});

module.exports = router;
