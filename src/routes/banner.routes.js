const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { auth, authorize } = require('../middleware/auth.middleware');
const Banner = require('../models/banner.model');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cloudinary = require('cloudinary').v2;

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Check if Cloudinary is configured
const isCloudinaryConfigured = () => {
  return (
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  );
};

// Configure multer for banner image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/banners/';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'banner-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit for banner images
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
const bannerValidation = [
  body('title')
    .trim()
    .notEmpty()
    .withMessage('Title is required')
    .isLength({ max: 100 })
    .withMessage('Title cannot exceed 100 characters'),
  body('description')
    .trim()
    .notEmpty()
    .withMessage('Description is required')
    .isLength({ max: 500 })
    .withMessage('Description cannot exceed 500 characters'),
  body('imageUrl')
    .optional()
    .isURL()
    .withMessage('Image URL must be a valid URL'),
  body('linkUrl')
    .optional()
    .isURL()
    .withMessage('Link URL must be a valid URL'),
  body('position')
    .isIn(['top', 'middle', 'bottom', 'sidebar'])
    .withMessage('Position must be one of: top, middle, bottom, sidebar'),
  body('status')
    .isIn(['active', 'inactive', 'scheduled'])
    .withMessage('Status must be one of: active, inactive, scheduled'),
  body('priority')
    .isInt({ min: 1, max: 10 })
    .withMessage('Priority must be between 1 and 10'),
  body('targetAudience')
    .isIn(['all', 'applicants', 'employers', 'admin'])
    .withMessage(
      'Target audience must be one of: all, applicants, employers, admin'
    ),
  body('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid date'),
  body('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid date')
];

// @route   GET /api/banners
// @desc    Get all banners (admin only)
// @access  Private/Admin
router.get('/', auth, authorize(['admin']), async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      position,
      targetAudience,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build filter object
    const filter = {};
    if (status) filter.status = status;
    if (position) filter.position = position;
    if (targetAudience) filter.targetAudience = targetAudience;

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort,
      populate: [
        { path: 'createdBy', select: 'name email' },
        { path: 'lastModifiedBy', select: 'name email' }
      ]
    };

    // Temporary workaround until mongoose-paginate-v2 is installed
    let banners;
    try {
      banners = await Banner.paginate(filter, options);
    } catch (paginateError) {
      // Fallback to regular find if paginate is not available
      const skip = (parseInt(page) - 1) * parseInt(limit);
      const docs = await Banner.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .populate('createdBy', 'name email')
        .populate('lastModifiedBy', 'name email');

      const totalDocs = await Banner.countDocuments(filter);

      banners = {
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
      data: banners,
      message: 'Banners retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching banners:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching banners',
      error: error.message
    });
  }
});

// @route   GET /api/banners/active
// @desc    Get active banners for public display
// @access  Public
router.get('/active', async (req, res) => {
  try {
    const { audience = 'all', position } = req.query;

    const banners = await Banner.getActiveBanners(audience, position);

    res.json({
      success: true,
      data: banners,
      message: 'Active banners retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching active banners:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching active banners',
      error: error.message
    });
  }
});

// @route   GET /api/banners/:id
// @desc    Get single banner by ID
// @access  Private/Admin
router.get('/:id', auth, authorize(['admin']), async (req, res) => {
  try {
    const banner = await Banner.findById(req.params.id)
      .populate('createdBy', 'name email')
      .populate('lastModifiedBy', 'name email');

    if (!banner) {
      return res.status(404).json({
        success: false,
        message: 'Banner not found'
      });
    }

    res.json({
      success: true,
      data: banner,
      message: 'Banner retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching banner:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching banner',
      error: error.message
    });
  }
});

// @route   POST /api/banners
// @desc    Create new banner
// @access  Private/Admin
router.post(
  '/',
  auth,
  authorize(['admin']),

  async (req, res) => {
    try {
      const bannerData = {
        ...req.body,
        createdBy: req.user._id,
        lastModifiedBy: req.user._id
      };

      // Handle date conversion
      if (bannerData.startDate) {
        bannerData.startDate = new Date(bannerData.startDate);
      }
      if (bannerData.endDate) {
        bannerData.endDate = new Date(bannerData.endDate);
      }

      const banner = new Banner(bannerData);
      await banner.save();

      await banner.populate([
        { path: 'createdBy', select: 'name email' },
        { path: 'lastModifiedBy', select: 'name email' }
      ]);

      res.status(201).json({
        success: true,
        data: banner,
        message: 'Banner created successfully'
      });
    } catch (error) {
      console.error('Error creating banner:', error);
      res.status(500).json({
        success: false,
        message: 'Server error while creating banner',
        error: error.message
      });
    }
  }
);

// @route   POST /api/banners/upload
// @desc    Upload banner image (alias for upload-image)
// @access  Private/Admin
router.post(
  '/upload',
  auth,
  authorize(['admin']),
  upload.single('image'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No image file provided'
        });
      }

      let imageUrl;
      let cloudinaryData = null;

      // Try to upload to Cloudinary if configured
      if (isCloudinaryConfigured()) {
        try {
          const result = await cloudinary.uploader.upload(req.file.path, {
            folder: 'intellihire/banners',
            resource_type: 'image',
            allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
            transformation: [
              { width: 1920, height: 600, crop: 'limit' },
              { quality: 'auto' },
              { fetch_format: 'auto' }
            ]
          });

          imageUrl = result.secure_url;
          cloudinaryData = {
            publicId: result.public_id,
            width: result.width,
            height: result.height,
            format: result.format
          };

          // Delete local file after successful Cloudinary upload
          fs.unlinkSync(req.file.path);

          console.log('Image uploaded to Cloudinary:', imageUrl);
        } catch (cloudinaryError) {
          console.error('Cloudinary upload failed, using local storage:', cloudinaryError);
          // Fall back to local storage
          imageUrl = `/uploads/banners/${req.file.filename}`;
        }
      } else {
        // Use local storage if Cloudinary is not configured
        imageUrl = `/uploads/banners/${req.file.filename}`;
        console.log('Cloudinary not configured, using local storage');
      }

      res.json({
        success: true,
        data: {
          imageUrl,
          filename: req.file.filename,
          originalName: req.file.originalname,
          size: req.file.size,
          cloudinary: cloudinaryData
        },
        message: 'Image uploaded successfully'
      });
    } catch (error) {
      console.error('Error uploading image:', error);
      // Clean up file if it exists
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      res.status(500).json({
        success: false,
        message: 'Server error while uploading image',
        error: error.message
      });
    }
  }
);

// @route   POST /api/banners/upload-image
// @desc    Upload banner image
// @access  Private/Admin
router.post(
  '/upload-image',
  auth,
  authorize(['admin']),
  upload.single('image'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No image file provided'
        });
      }

      let imageUrl;
      let cloudinaryData = null;

      // Try to upload to Cloudinary if configured
      if (isCloudinaryConfigured()) {
        try {
          const result = await cloudinary.uploader.upload(req.file.path, {
            folder: 'intellihire/banners',
            resource_type: 'image',
            allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
            transformation: [
              { width: 1920, height: 600, crop: 'limit' },
              { quality: 'auto' },
              { fetch_format: 'auto' }
            ]
          });

          imageUrl = result.secure_url;
          cloudinaryData = {
            publicId: result.public_id,
            width: result.width,
            height: result.height,
            format: result.format
          };

          // Delete local file after successful Cloudinary upload
          fs.unlinkSync(req.file.path);

          console.log('Image uploaded to Cloudinary:', imageUrl);
        } catch (cloudinaryError) {
          console.error('Cloudinary upload failed, using local storage:', cloudinaryError);
          // Fall back to local storage
          imageUrl = `/uploads/banners/${req.file.filename}`;
        }
      } else {
        // Use local storage if Cloudinary is not configured
        imageUrl = `/uploads/banners/${req.file.filename}`;
        console.log('Cloudinary not configured, using local storage');
      }

      res.json({
        success: true,
        data: {
          imageUrl,
          filename: req.file.filename,
          originalName: req.file.originalname,
          size: req.file.size,
          cloudinary: cloudinaryData
        },
        message: 'Image uploaded successfully'
      });
    } catch (error) {
      console.error('Error uploading image:', error);
      // Clean up file if it exists
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      res.status(500).json({
        success: false,
        message: 'Server error while uploading image',
        error: error.message
      });
    }
  }
);

// @route   PUT /api/banners/:id
// @desc    Update banner
// @access  Private/Admin
router.put(
  '/:id',
  auth,
  authorize(['admin']),

  async (req, res) => {
    try {
      const bannerData = {
        ...req.body,
        lastModifiedBy: req.user._id
      };

      // Handle date conversion
      if (bannerData.startDate) {
        bannerData.startDate = new Date(bannerData.startDate);
      }
      if (bannerData.endDate) {
        bannerData.endDate = new Date(bannerData.endDate);
      }

      const banner = await Banner.findByIdAndUpdate(req.params.id, bannerData, {
        new: true,
        runValidators: true
      }).populate([
        { path: 'createdBy', select: 'name email' },
        { path: 'lastModifiedBy', select: 'name email' }
      ]);

      if (!banner) {
        return res.status(404).json({
          success: false,
          message: 'Banner not found'
        });
      }

      res.json({
        success: true,
        data: banner,
        message: 'Banner updated successfully'
      });
    } catch (error) {
      console.error('Error updating banner:', error);
      res.status(500).json({
        success: false,
        message: 'Server error while updating banner',
        error: error.message
      });
    }
  }
);

// @route   PATCH /api/banners/:id/status
// @desc    Toggle banner status
// @access  Private/Admin
router.patch('/:id/status', auth, authorize(['admin']), async (req, res) => {
  try {
    const { status } = req.body;

    if (!['active', 'inactive', 'scheduled'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be active, inactive, or scheduled'
      });
    }

    const banner = await Banner.findByIdAndUpdate(
      req.params.id,
      {
        status,
        lastModifiedBy: req.user._id
      },
      { new: true, runValidators: true }
    ).populate([
      { path: 'createdBy', select: 'name email' },
      { path: 'lastModifiedBy', select: 'name email' }
    ]);

    if (!banner) {
      return res.status(404).json({
        success: false,
        message: 'Banner not found'
      });
    }

    res.json({
      success: true,
      data: banner,
      message: 'Banner status updated successfully'
    });
  } catch (error) {
    console.error('Error updating banner status:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating banner status',
      error: error.message
    });
  }
});

// @route   POST /api/banners/:id/click
// @desc    Track banner click
// @access  Public
router.post('/:id/click', async (req, res) => {
  try {
    const banner = await Banner.findById(req.params.id);

    if (!banner) {
      return res.status(404).json({
        success: false,
        message: 'Banner not found'
      });
    }

    await banner.incrementClicks();

    res.json({
      success: true,
      message: 'Click tracked successfully'
    });
  } catch (error) {
    console.error('Error tracking click:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while tracking click',
      error: error.message
    });
  }
});

// @route   POST /api/banners/:id/impression
// @desc    Track banner impression
// @access  Public
router.post('/:id/impression', async (req, res) => {
  try {
    const banner = await Banner.findById(req.params.id);

    if (!banner) {
      return res.status(404).json({
        success: false,
        message: 'Banner not found'
      });
    }

    await banner.incrementImpressions();

    res.json({
      success: true,
      message: 'Impression tracked successfully'
    });
  } catch (error) {
    console.error('Error tracking impression:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while tracking impression',
      error: error.message
    });
  }
});

// @route   DELETE /api/banners/:id
// @desc    Delete banner
// @access  Private/Admin
router.delete('/:id', auth, authorize(['admin']), async (req, res) => {
  try {
    const banner = await Banner.findByIdAndDelete(req.params.id);

    if (!banner) {
      return res.status(404).json({
        success: false,
        message: 'Banner not found'
      });
    }

    // Delete associated image file if it exists
    if (banner.imageUrl && banner.imageUrl.startsWith('/uploads/banners/')) {
      const imagePath = path.join(process.cwd(), 'public', banner.imageUrl);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }

    res.json({
      success: true,
      message: 'Banner deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting banner:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting banner',
      error: error.message
    });
  }
});

// @route   GET /api/banners/analytics/overview
// @desc    Get banner analytics overview
// @access  Private/Admin
router.get(
  '/analytics/overview',
  auth,
  authorize(['admin']),
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      // Build date filter
      const dateFilter = {};
      if (startDate) dateFilter.$gte = new Date(startDate);
      if (endDate) dateFilter.$lte = new Date(endDate);

      const filter = {};
      if (Object.keys(dateFilter).length > 0) {
        filter.createdAt = dateFilter;
      }

      // Get analytics data
      const [
        totalBanners,
        activeBanners,
        totalClicks,
        totalImpressions,
        bannersByPosition,
        bannersByStatus
      ] = await Promise.all([
        Banner.countDocuments(filter),
        Banner.countDocuments({ ...filter, status: 'active' }),
        Banner.aggregate([
          { $match: filter },
          { $group: { _id: null, total: { $sum: '$clicks' } } }
        ]),
        Banner.aggregate([
          { $match: filter },
          { $group: { _id: null, total: { $sum: '$impressions' } } }
        ]),
        Banner.aggregate([
          { $match: filter },
          {
            $group: {
              _id: '$position',
              count: { $sum: 1 },
              clicks: { $sum: '$clicks' },
              impressions: { $sum: '$impressions' }
            }
          }
        ]),
        Banner.aggregate([
          { $match: filter },
          { $group: { _id: '$status', count: { $sum: 1 } } }
        ])
      ]);

      const analytics = {
        totalBanners,
        activeBanners,
        totalClicks: totalClicks[0]?.total || 0,
        totalImpressions: totalImpressions[0]?.total || 0,
        averageCTR:
          totalImpressions[0]?.total > 0
            ? (
                ((totalClicks[0]?.total || 0) / totalImpressions[0].total) *
                100
              ).toFixed(2)
            : 0,
        bannersByPosition,
        bannersByStatus
      };

      res.json({
        success: true,
        data: analytics,
        message: 'Analytics retrieved successfully'
      });
    } catch (error) {
      console.error('Error fetching analytics:', error);
      res.status(500).json({
        success: false,
        message: 'Server error while fetching analytics',
        error: error.message
      });
    }
  }
);

module.exports = router;
