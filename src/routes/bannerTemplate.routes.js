const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { auth, authorize } = require('../middleware/auth.middleware');
const BannerTemplate = require('../models/bannerTemplate.model');
const Banner = require('../models/banner.model');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for template preview images
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/banner-templates/';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'template-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          'Invalid file type. Only JPEG, PNG, GIF and WebP images are allowed.'
        )
      );
    }
  }
});

// Middleware for validation
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

// Validation rules
const templateValidation = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Template name is required')
    .isLength({ max: 100 })
    .withMessage('Template name cannot exceed 100 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description cannot exceed 500 characters'),
  body('category')
    .isIn([
      'promotion',
      'announcement',
      'system',
      'event',
      'job',
      'company',
      'custom'
    ])
    .withMessage('Invalid category'),
  body('tags').optional().isArray().withMessage('Tags must be an array'),
  body('templateData.title')
    .trim()
    .notEmpty()
    .withMessage('Template title is required'),
  body('templateData.description')
    .trim()
    .notEmpty()
    .withMessage('Template description is required'),
  body('templateData.imageUrl')
    .trim()
    .notEmpty()
    .withMessage('Template image URL is required'),
  body('templateData.position')
    .isIn(['top', 'middle', 'bottom', 'sidebar'])
    .withMessage('Invalid position'),
  body('templateData.priority')
    .isInt({ min: 1, max: 10 })
    .withMessage('Priority must be between 1 and 10'),
  body('templateData.targetAudience')
    .isIn(['all', 'applicants', 'employers', 'admin'])
    .withMessage('Invalid target audience')
];

// @route   GET /api/banner-templates
// @desc    Get all banner templates
// @access  Private/Admin
router.get('/', auth, authorize(['admin']), async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      category,
      search,
      isPublic,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    let query = {};
    let sort = {};

    // Build filter object
    if (category) query.category = category;
    if (isPublic !== undefined) query.isPublic = isPublic === 'true';
    if (search) {
      query.$or = [
        { name: new RegExp(search, 'i') },
        { description: new RegExp(search, 'i') },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];
    }

    // Build sort object
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort,
      populate: [{ path: 'createdBy', select: 'name email' }]
    };

    // Temporary workaround until mongoose-paginate-v2 is installed
    let templates;
    try {
      templates = await BannerTemplate.paginate(query, options);
    } catch (paginateError) {
      // Fallback to regular find if paginate is not available
      const skip = (parseInt(page) - 1) * parseInt(limit);
      const docs = await BannerTemplate.find(query)
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .populate('createdBy', 'name email');

      const totalDocs = await BannerTemplate.countDocuments(query);

      templates = {
        docs,
        totalDocs,
        limit: parseInt(limit),
        page: parseInt(page),
        totalPages: Math.ceil(totalDocs / parseInt(limit)),
        hasNextPage: parseInt(page) < Math.ceil(totalDocs / parseInt(limit)),
        hasPrevPage: parseInt(page) > 1,
        nextPage:
          parseInt(page) < Math.ceil(totalDocs / parseInt(limit))
            ? parseInt(page) + 1
            : null,
        prevPage: parseInt(page) > 1 ? parseInt(page) - 1 : null
      };
    }

    res.json({
      success: true,
      data: templates,
      message: 'Templates retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching templates:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching templates',
      error: error.message
    });
  }
});

// @route   GET /api/banner-templates/categories
// @desc    Get template categories with counts
// @access  Private/Admin
router.get('/categories', auth, authorize(['admin']), async (req, res) => {
  try {
    const categories = await BannerTemplate.aggregate([
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          publicCount: {
            $sum: { $cond: ['$isPublic', 1, 0] }
          }
        }
      },
      { $sort: { count: -1 } }
    ]);

    res.json({
      success: true,
      data: categories,
      message: 'Categories retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching categories',
      error: error.message
    });
  }
});

// @route   GET /api/banner-templates/popular
// @desc    Get popular templates
// @access  Private/Admin
router.get('/popular', auth, authorize(['admin']), async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const templates = await BannerTemplate.find({ isPublic: true })
      .sort({ usageCount: -1, createdAt: -1 })
      .limit(parseInt(limit))
      .populate('createdBy', 'name email');

    res.json({
      success: true,
      data: templates,
      message: 'Popular templates retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching popular templates:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching popular templates',
      error: error.message
    });
  }
});

// @route   GET /api/banner-templates/:id
// @desc    Get single template by ID
// @access  Private/Admin
router.get('/:id', auth, authorize(['admin']), async (req, res) => {
  try {
    const template = await BannerTemplate.findById(req.params.id).populate(
      'createdBy',
      'name email'
    );

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template not found'
      });
    }

    res.json({
      success: true,
      data: template,
      message: 'Template retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching template:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching template',
      error: error.message
    });
  }
});

// @route   POST /api/banner-templates
// @desc    Create new template
// @access  Private/Admin
router.post(
  '/',
  auth,
  authorize(['admin']),
  templateValidation,
  validate,
  async (req, res) => {
    try {
      const templateData = {
        ...req.body,
        createdBy: req.user._id
      };

      const template = new BannerTemplate(templateData);
      await template.save();

      await template.populate('createdBy', 'name email');

      res.status(201).json({
        success: true,
        data: template,
        message: 'Template created successfully'
      });
    } catch (error) {
      console.error('Error creating template:', error);
      res.status(500).json({
        success: false,
        message: 'Server error while creating template',
        error: error.message
      });
    }
  }
);

// @route   POST /api/banner-templates/:id/create-banner
// @desc    Create banner from template
// @access  Private/Admin
router.post(
  '/:id/create-banner',
  auth,
  authorize(['admin']),
  async (req, res) => {
    try {
      const template = await BannerTemplate.findById(req.params.id);

      if (!template) {
        return res.status(404).json({
          success: false,
          message: 'Template not found'
        });
      }

      // Create banner data from template
      const bannerData = template.createBannerFromTemplate(
        req.body.overrides || {}
      );

      // Add additional banner data
      const finalBannerData = {
        ...bannerData,
        createdBy: req.user._id,
        lastModifiedBy: req.user._id
      };

      // Handle date conversion
      if (finalBannerData.startDate) {
        finalBannerData.startDate = new Date(finalBannerData.startDate);
      }
      if (finalBannerData.endDate) {
        finalBannerData.endDate = new Date(finalBannerData.endDate);
      }

      const banner = new Banner(finalBannerData);
      await banner.save();

      // Increment template usage count
      await template.incrementUsage();

      await banner.populate([
        { path: 'createdBy', select: 'name email' },
        { path: 'lastModifiedBy', select: 'name email' }
      ]);

      res.status(201).json({
        success: true,
        data: banner,
        message: 'Banner created from template successfully'
      });
    } catch (error) {
      console.error('Error creating banner from template:', error);
      res.status(500).json({
        success: false,
        message: 'Server error while creating banner from template',
        error: error.message
      });
    }
  }
);

// @route   POST /api/banner-templates/upload-preview
// @desc    Upload template preview image
// @access  Private/Admin
router.post(
  '/upload-preview',
  auth,
  authorize(['admin']),
  upload.single('preview'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No preview image provided'
        });
      }

      const previewUrl = `/uploads/banner-templates/${req.file.filename}`;

      res.json({
        success: true,
        data: {
          previewUrl,
          filename: req.file.filename,
          originalName: req.file.originalname,
          size: req.file.size
        },
        message: 'Preview image uploaded successfully'
      });
    } catch (error) {
      console.error('Error uploading preview:', error);
      res.status(500).json({
        success: false,
        message: 'Server error while uploading preview',
        error: error.message
      });
    }
  }
);

// @route   PUT /api/banner-templates/:id
// @desc    Update template
// @access  Private/Admin
router.put(
  '/:id',
  auth,
  authorize(['admin']),
  templateValidation,
  validate,
  async (req, res) => {
    try {
      const template = await BannerTemplate.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true, runValidators: true }
      ).populate('createdBy', 'name email');

      if (!template) {
        return res.status(404).json({
          success: false,
          message: 'Template not found'
        });
      }

      res.json({
        success: true,
        data: template,
        message: 'Template updated successfully'
      });
    } catch (error) {
      console.error('Error updating template:', error);
      res.status(500).json({
        success: false,
        message: 'Server error while updating template',
        error: error.message
      });
    }
  }
);

// @route   DELETE /api/banner-templates/:id
// @desc    Delete template
// @access  Private/Admin
router.delete('/:id', auth, authorize(['admin']), async (req, res) => {
  try {
    const template = await BannerTemplate.findByIdAndDelete(req.params.id);

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template not found'
      });
    }

    // Delete associated preview image if it exists
    if (
      template.previewImage &&
      template.previewImage.startsWith('/uploads/banner-templates/')
    ) {
      const imagePath = path.join(
        process.cwd(),
        'public',
        template.previewImage
      );
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }

    res.json({
      success: true,
      message: 'Template deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting template:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting template',
      error: error.message
    });
  }
});

module.exports = router;
