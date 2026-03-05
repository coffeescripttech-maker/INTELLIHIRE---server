const express = require('express');
const router = express.Router();
const BannerCategory = require('../models/bannerCategory.model');
const { auth } = require('../middleware/auth.middleware');

// Get all active categories
router.get('/', async (req, res) => {
  try {
    const categories = await BannerCategory.getActiveCategories();
    res.json({
      success: true,
      data: categories
    });
  } catch (error) {
    console.error('Error fetching banner categories:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching categories',
      error: error.message
    });
  }
});

// Get all categories (including inactive) - Admin only
router.get('/all', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin role required.'
      });
    }

    const categories = await BannerCategory.find().sort({ name: 1 });
    res.json({
      success: true,
      data: categories
    });
  } catch (error) {
    console.error('Error fetching all banner categories:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching all categories',
      error: error.message
    });
  }
});

// Create new category - Admin only
router.post('/', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin role required.'
      });
    }

    const { name, description, color, icon } = req.body;

    // Check if category already exists
    const existingCategory = await BannerCategory.findOne({ name });
    if (existingCategory) {
      return res.status(400).json({
        success: false,
        message: 'Category with this name already exists'
      });
    }

    const category = new BannerCategory({
      name,
      description,
      color,
      icon,
      createdBy: req.user.id
    });

    await category.save();

    res.status(201).json({
      success: true,
      message: 'Category created successfully',
      data: category
    });
  } catch (error) {
    console.error('Error creating banner category:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while creating category',
      error: error.message
    });
  }
});

// Update category - Admin only
router.put('/:id', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin role required.'
      });
    }

    const { name, description, color, icon, isActive } = req.body;

    // Check if category exists
    const category = await BannerCategory.findById(req.params.id);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

    // Check if name is being changed and if it conflicts
    if (name && name !== category.name) {
      const existingCategory = await BannerCategory.findOne({ name });
      if (existingCategory) {
        return res.status(400).json({
          success: false,
          message: 'Category with this name already exists'
        });
      }
    }

    const updatedCategory = await BannerCategory.findByIdAndUpdate(
      req.params.id,
      { name, description, color, icon, isActive },
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      message: 'Category updated successfully',
      data: updatedCategory
    });
  } catch (error) {
    console.error('Error updating banner category:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating category',
      error: error.message
    });
  }
});

// Delete category - Admin only
router.delete('/:id', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin role required.'
      });
    }

    const category = await BannerCategory.findById(req.params.id);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

    // Check if category is being used
    if (category.usageCount > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete category that is being used by banners'
      });
    }

    await BannerCategory.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Category deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting banner category:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting category',
      error: error.message
    });
  }
});

module.exports = router;
