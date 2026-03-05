const express = require('express');
const router = express.Router();
const Job = require('../models/job.model');
const User = require('../models/user.model');
const Application = require('../models/application.model');

// @route   GET /api/stats/hero
// @desc    Get hero section statistics
// @access  Public
router.get('/hero', async (req, res) => {
  try {
    console.log('Stats route hit - fetching hero statistics...');
    
    // Get active jobs count
    const activeJobsCount = await Job.countDocuments({
      status: 'active',
      isActive: true
    });
    console.log('Active jobs count:', activeJobsCount);

    // Get total job seekers count (users with role 'applicant')
    const jobSeekersCount = await User.countDocuments({
      role: 'applicant',
      isActive: true
    });
    console.log('Job seekers count:', jobSeekersCount);

    // Get total applications count
    const totalApplications = await Application.countDocuments();
    console.log('Total applications:', totalApplications);

    // Get successful applications count (you can define your own criteria for success)
    // For now, let's use applications with status 'hired' or 'accepted'
    const successfulApplications = await Application.countDocuments({
      status: { $in: ['hired', 'accepted', 'completed'] }
    });
    console.log('Successful applications:', successfulApplications);

    // Calculate success rate
    const successRate =
      totalApplications > 0
        ? Math.round((successfulApplications / totalApplications) * 100)
        : 0;

    const stats = {
      activeJobs: activeJobsCount,
      jobSeekers: jobSeekersCount,
      successRate: successRate,
      totalApplications: totalApplications,
      successfulApplications: successfulApplications
    };

    console.log('Final stats object:', stats);

    res.json({
      success: true,
      data: stats,
      message: 'Hero statistics retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching hero statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching hero statistics',
      error: error.message
    });
  }
});

module.exports = router;
