const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { auth, authorize } = require('../middleware/auth.middleware');
const Company = require('../models/company.model');
const multer = require('multer');
const path = require('path');

// Configure multer for company logo upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/company-logos/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'logo-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 2 * 1024 * 1024 // 2MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          'Invalid file type. Only JPEG, PNG and GIF images are allowed.'
        )
      );
    }
  }
});

// Configure multer for verification documents
const documentStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/verification-documents/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'doc-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const uploadDocument = multer({
  storage: documentStorage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          'Invalid file type. Only PDF, JPG, PNG, DOC, and DOCX files are allowed.'
        )
      );
    }
  }
});

// Middleware for validation
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// Get all companies (public)
router.get('/', async (req, res) => {
  try {
    const { industry, isGovernment, search, page = 1, limit = 10 } = req.query;

    const query = {};

    if (industry) query.industry = new RegExp(industry, 'i');
    if (isGovernment) query.isGovernment = isGovernment === 'true';
    if (search) {
      query.$or = [
        { name: new RegExp(search, 'i') },
        { description: new RegExp(search, 'i') }
      ];
    }

    const companies = await Company.find(query)
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Company.countDocuments(query);

    res.json({
      companies,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: 'Error fetching companies', error: error.message });
  }
});

// Get company by ID (public)
router.get('/:id', async (req, res) => {
  try {
    const company = await Company.findById(req.params.id);

    if (!company) {
      return res.status(404).json({ message: 'Company not found' });
    }

    res.json(company);
  } catch (error) {
    res
      .status(500)
      .json({ message: 'Error fetching company', error: error.message });
  }
});

// Create new company (admin only)
router.post(
  '/',
  [
    auth,
    authorize('admin')
    // body('name').notEmpty(),
    // body('industry').notEmpty(),
    // validate
  ],
  async (req, res) => {
    try {
      const company = new Company({
        ...req.body,
        adminId: req.user._id
      });

      await company.save();
      res.status(201).json(company);
    } catch (error) {
      console.log({ error });
      res
        .status(500)
        .json({ message: 'Error creating company', error: error.message });
    }
  }
);

// Update company (admin/company admin only)
router.put(
  '/:id',
  [auth, authorize('admin', 'employer'), validate],
  async (req, res) => {
    try {
      const company = await Company.findById(req.params.id);

      if (!company) {
        return res.status(404).json({ message: 'Company not found' });
      }

      // Check if user has permission to update this company
      if (
        req.user.role === 'employer' &&
        company.adminId.toString() !== req.user._id.toString()
      ) {
        return res
          .status(403)
          .json({ message: 'Not authorized to update this company' });
      }

      Object.assign(company, req.body);
      await company.save();

      res.json(company);
    } catch (error) {
      res
        .status(500)
        .json({ message: 'Error updating company', error: error.message });
    }
  }
);

// Upload company logo (admin/company admin only)
router.post(
  '/:id/logo',
  [auth, authorize('admin', 'employer'), upload.single('logo')],
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }

      const company = await Company.findById(req.params.id);

      if (!company) {
        return res.status(404).json({ message: 'Company not found' });
      }

      // Check if user has permission to update this company
      if (
        req.user.role === 'employer' &&
        company.adminId.toString() !== req.user._id.toString()
      ) {
        return res
          .status(403)
          .json({ message: 'Not authorized to update this company' });
      }

      // Delete old logo if exists
      if (company.logo) {
        const fs = require('fs');
        const oldLogoPath = path.join(__dirname, '../../', company.logo);
        if (fs.existsSync(oldLogoPath)) {
          fs.unlinkSync(oldLogoPath);
        }
      }

      company.logo = req.file.path;
      await company.save();

      res.json(company);
    } catch (error) {
      res
        .status(500)
        .json({ message: 'Error uploading logo', error: error.message });
    }
  }
);

// Delete company (admin only)
router.delete('/:id', [auth, authorize('admin')], async (req, res) => {
  try {
    const company = await Company.findById(req.params.id);

    if (!company) {
      return res.status(404).json({ message: 'Company not found' });
    }

    // Delete company logo if exists
    if (company.logo) {
      const fs = require('fs');
      const logoPath = path.join(__dirname, '../../', company.logo);
      if (fs.existsSync(logoPath)) {
        fs.unlinkSync(logoPath);
      }
    }

    await Company.findByIdAndDelete(req.params.id);
    res.json({ message: 'Company deleted successfully' });
  } catch (error) {
    res
      .status(500)
      .json({ message: 'Error deleting company', error: error.message });
  }
});

// Get company jobs (public)
router.get('/:id/jobs', async (req, res) => {
  try {
    const { status = 'active', page = 1, limit = 10 } = req.query;

    const query = {
      companyId: req.params.id,
      status,
      expiryDate: { $gt: new Date() }
    };

    const jobs = await Job.find(query)
      .sort('-postedDate')
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .populate('categoryId', 'name');

    const total = await Job.countDocuments(query);

    res.json({
      jobs,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: 'Error fetching company jobs', error: error.message });
  }
});

// Update company scoring configuration
router.put(
  '/:id/scoring-config',
  [auth, authorize('admin')],
  async (req, res) => {
    try {
      const { scoringConfig } = req.body;

      const company = await Company.findByIdAndUpdate(
        req.params.id,
        { scoringConfig },
        { new: true }
      );

      if (!company) {
        return res.status(404).json({ message: 'Company not found' });
      }

      res.json({
        success: true,
        message: 'Scoring configuration updated successfully',
        company
      });
    } catch (error) {
      res.status(500).json({
        message: 'Error updating scoring configuration',
        error: error.message
      });
    }
  }
);

// Delete company scoring configuration (use system default)
router.delete(
  '/:id/scoring-config',
  [auth, authorize('admin')],
  async (req, res) => {
    try {
      const company = await Company.findById(req.params.id);

      if (!company) {
        return res.status(404).json({ message: 'Company not found' });
      }

      // Check if company has a custom scoring config
      const hadCustomConfig = !!company.scoringConfig;

      // Remove scoring config (if it exists)
      company.scoringConfig = undefined;
      await company.save();

      res.json({
        success: true,
        message: hadCustomConfig 
          ? 'Scoring configuration removed. Company will use system default.'
          : 'Company is already using system default.',
        company,
        hadCustomConfig
      });
    } catch (error) {
      res.status(500).json({
        message: 'Error removing scoring configuration',
        error: error.message
      });
    }
  }
);

// Upload verification document
router.post(
  '/upload-verification-document',
  [auth, authorize('admin'), uploadDocument.single('document')],
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }

      // Construct the file URL
      const fileUrl = `/uploads/verification-documents/${req.file.filename}`;

      res.json({
        success: true,
        message: 'Document uploaded successfully',
        url: fileUrl,
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size
      });
    } catch (error) {
      res.status(500).json({
        message: 'Error uploading document',
        error: error.message
      });
    }
  }
);

// Get company scoring configuration
router.get('/:id/scoring-config', async (req, res) => {
  try {
    const {
      DEFAULT_SCORING_CONFIG
    } = require('../config/defaultScoring.config');
    const company = await Company.findById(req.params.id);

    if (!company) {
      return res.status(404).json({ message: 'Company not found' });
    }

    console.log('📊 Company has scoringConfig:', !!company.scoringConfig);
    console.log('📋 DEFAULT_SCORING_CONFIG keys:', Object.keys(DEFAULT_SCORING_CONFIG));
    console.log('📋 DEFAULT education sample:', DEFAULT_SCORING_CONFIG.education);

    // Merge company config with defaults to ensure all fields are present
    // This handles incomplete configs from the database
    let scoringConfig;
    if (company.scoringConfig) {
      console.log('🔄 Merging with database config...');
      console.log('🗃️ DB config keys:', Object.keys(company.scoringConfig));
      console.log('🗃️ DB education sample:', company.scoringConfig.education);
      
      // Merge each criterion with defaults to fill in missing fields
      // Filter out undefined/null/empty values from DB config to prevent overriding defaults
      scoringConfig = {};
      Object.keys(DEFAULT_SCORING_CONFIG).forEach(key => {
        const dbCriterion = company.scoringConfig[key] || {};
        const defaultCriterion = DEFAULT_SCORING_CONFIG[key];
        
        // Clean DB values - remove undefined/null/empty arrays
        const cleanDbCriterion = {};
        Object.keys(dbCriterion).forEach(field => {
          const value = dbCriterion[field];
          
          // Skip if undefined or null
          if (value === undefined || value === null) {
            return;
          }
          
          // Skip if empty array (especially for subCriteria)
          if (Array.isArray(value) && value.length === 0) {
            return;
          }
          
          // Keep the value
          cleanDbCriterion[field] = value;
        });
        
        // Merge: defaults + cleaned DB values
        scoringConfig[key] = {
          ...defaultCriterion,
          ...cleanDbCriterion
        };
      });
      console.log('✅ Merged education sample:', scoringConfig.education);
    } else {
      console.log('📋 Using DEFAULT_SCORING_CONFIG (no custom config)');
      scoringConfig = DEFAULT_SCORING_CONFIG;
    }

    console.log('📤 Sending scoringConfig with keys:', Object.keys(scoringConfig));

    res.json({
      success: true,
      scoringConfig,
      hasCustomConfig: !!company.scoringConfig
    });
  } catch (error) {
    console.error('❌ Error in scoring-config endpoint:', error);
    res.status(500).json({
      message: 'Error fetching scoring configuration',
      error: error.message
    });
  }
});

// Fix/cleanup incomplete scoring configurations
router.post('/fix-scoring-configs', [auth, authorize('admin')], async (req, res) => {
  try {
    const { DEFAULT_SCORING_CONFIG } = require('../config/defaultScoring.config');
    
    // Find all companies with incomplete scoring configs
    const companies = await Company.find({ scoringConfig: { $ne: null } });
    let fixedCount = 0;

    for (const company of companies) {
      let needsUpdate = false;
      const mergedConfig = {};

      // Check and merge each criterion
      Object.keys(DEFAULT_SCORING_CONFIG).forEach(key => {
        const dbCriterion = company.scoringConfig[key] || {};
        const defaultCriterion = DEFAULT_SCORING_CONFIG[key];

        // Check if any required field is missing, undefined, or if subCriteria is empty
        if (!dbCriterion.label || !dbCriterion.hasOwnProperty('maxPoints') || 
            !dbCriterion.hasOwnProperty('weight') || !dbCriterion.hasOwnProperty('enabled') ||
            dbCriterion.label === undefined || dbCriterion.maxPoints === undefined ||
            (Array.isArray(dbCriterion.subCriteria) && dbCriterion.subCriteria.length === 0)) {
          needsUpdate = true;
        }

        // Clean DB values - remove undefined/null/empty arrays
        const cleanDbCriterion = {};
        Object.keys(dbCriterion).forEach(field => {
          const value = dbCriterion[field];
          
          // Skip if undefined or null
          if (value === undefined || value === null) {
            return;
          }
          
          // Skip if empty array (especially for subCriteria)
          if (Array.isArray(value) && value.length === 0) {
            return;
          }
          
          // Keep the value
          cleanDbCriterion[field] = value;
        });

        // Merge with defaults
        mergedConfig[key] = {
          ...defaultCriterion,
          ...cleanDbCriterion
        };
      });

      // Update if needed
      if (needsUpdate) {
        company.scoringConfig = mergedConfig;
        await company.save();
        fixedCount++;
      }
    }

    res.json({
      success: true,
      message: `Fixed ${fixedCount} incomplete scoring configurations`,
      fixedCount,
      totalChecked: companies.length
    });
  } catch (error) {
    res.status(500).json({
      message: 'Error fixing scoring configurations',
      error: error.message
    });
  }
});

// Update company verification status
router.put('/:id/verify', [auth, authorize('admin')], async (req, res) => {
  try {
    const { isVerified, verificationNotes } = req.body;

    const company = await Company.findByIdAndUpdate(
      req.params.id,
      {
        isVerified,
        verificationNotes,
        verificationDate: isVerified ? new Date() : null
      },
      { new: true }
    );

    if (!company) {
      return res.status(404).json({ message: 'Company not found' });
    }

    res.json({
      success: true,
      message: `Company ${isVerified ? 'verified' : 'unverified'} successfully`,
      company
    });
  } catch (error) {
    res.status(500).json({
      message: 'Error updating verification status',
      error: error.message
    });
  }
});

module.exports = router;
