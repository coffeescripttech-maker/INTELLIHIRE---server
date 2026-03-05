const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { auth, authorize } = require('../middleware/auth.middleware');
const Analytics = require('../models/analytics.model');
const Job = require('../models/job.model');
const Application = require('../models/application.model');
const User = require('../models/user.model');
const Document = require('../models/document.model');

// Middleware for validation
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// Get analytics data (admin only)
router.get('/', [auth, authorize('admin')], async (req, res) => {
  try {
    const { type, startDate, endDate, page = 1, limit = 10 } = req.query;

    const query = {};

    if (type) query.type = type;
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    const analytics = await Analytics.find(query)
      .sort('-date')
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Analytics.countDocuments(query);

    res.json({
      analytics,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: 'Error fetching analytics', error: error.message });
  }
});

// Get dashboard summary (admin only)
router.get('/dashboard', [auth, authorize('admin')], async (req, res) => {
  try {
    const today = new Date();
    const thirtyDaysAgo = new Date(today.setDate(today.getDate() - 30));

    // Get total counts
    const [
      totalJobs,
      activeJobs,
      totalApplications,
      totalUsers,
      totalDocuments
    ] = await Promise.all([
      Job.countDocuments(),
      Job.countDocuments({ status: 'active', expiryDate: { $gt: new Date() } }),
      Application.countDocuments(),
      User.countDocuments(),
      Document.countDocuments()
    ]);

    // Get recent activity
    const recentApplications = await Application.find()
      .sort('-createdAt')
      .limit(5)
      .populate('jobId', 'title')
      .populate('applicantId', 'firstName lastName');

    // Get applications by status
    const applicationsByStatus = await Application.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    // Get job views analytics
    const jobViews = await Analytics.find({
      type: 'job-views',
      date: { $gte: thirtyDaysAgo }
    }).sort('date');

    // Get user registrations analytics
    const userRegistrations = await Analytics.find({
      type: 'user-registrations',
      date: { $gte: thirtyDaysAgo }
    }).sort('date');

    res.json({
      summary: {
        totalJobs,
        activeJobs,
        totalApplications,
        totalUsers,
        totalDocuments
      },
      recentApplications,
      applicationsByStatus: applicationsByStatus.reduce((acc, curr) => {
        acc[curr._id] = curr.count;
        return acc;
      }, {}),
      analytics: {
        jobViews,
        userRegistrations
      }
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: 'Error fetching dashboard data', error: error.message });
  }
});

// Record job view
router.post('/job-view/:jobId', async (req, res) => {
  try {
    const job = await Job.findById(req.params.jobId);

    if (!job) {
      return res.status(404).json({ message: 'Job not found' });
    }

    // Increment job view count
    job.viewCount = (job.viewCount || 0) + 1;
    await job.save();

    // Record analytics
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const analytics = await Analytics.findOne({
      type: 'job-views',
      date: today
    });

    if (analytics) {
      analytics.data.totalViews = (analytics.data.totalViews || 0) + 1;
      analytics.data.jobViews = analytics.data.jobViews || {};
      analytics.data.jobViews[req.params.jobId] =
        (analytics.data.jobViews[req.params.jobId] || 0) + 1;
      await analytics.save();
    } else {
      await Analytics.create({
        type: 'job-views',
        date: today,
        data: {
          totalViews: 1,
          uniqueViews: 1,
          jobViews: {
            [req.params.jobId]: 1
          }
        }
      });
    }

    res.json({ message: 'View recorded successfully' });
  } catch (error) {
    res
      .status(500)
      .json({ message: 'Error recording job view', error: error.message });
  }
});

// Record user registration
router.post('/user-registration', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const analytics = await Analytics.findOne({
      type: 'user-registrations',
      date: today
    });

    if (analytics) {
      analytics.data.totalRegistrations =
        (analytics.data.totalRegistrations || 0) + 1;
      analytics.data.registrationsByRole =
        analytics.data.registrationsByRole || {};
      analytics.data.registrationsByRole[req.body.role] =
        (analytics.data.registrationsByRole[req.body.role] || 0) + 1;
      await analytics.save();
    } else {
      await Analytics.create({
        type: 'user-registrations',
        date: today,
        data: {
          totalRegistrations: 1,
          registrationsByRole: {
            [req.body.role]: 1
          }
        }
      });
    }

    res.json({ message: 'Registration recorded successfully' });
  } catch (error) {
    res.status(500).json({
      message: 'Error recording user registration',
      error: error.message
    });
  }
});

// Record document upload
router.post('/document-upload', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const analytics = await Analytics.findOne({
      type: 'document-uploads',
      date: today
    });

    if (analytics) {
      analytics.data.totalUploads = (analytics.data.totalUploads || 0) + 1;
      analytics.data.uploadsByType = analytics.data.uploadsByType || {};
      analytics.data.uploadsByType[req.body.type] =
        (analytics.data.uploadsByType[req.body.type] || 0) + 1;
      await analytics.save();
    } else {
      await Analytics.create({
        type: 'document-uploads',
        date: today,
        data: {
          totalUploads: 1,
          uploadsByType: {
            [req.body.type]: 1
          }
        }
      });
    }

    res.json({ message: 'Document upload recorded successfully' });
  } catch (error) {
    res.status(500).json({
      message: 'Error recording document upload',
      error: error.message
    });
  }
});

module.exports = router;
