const express = require('express');
const router = express.Router();
const { auth, authorize } = require('../middleware/auth.middleware');
const ApplicantRanking = require('../models/applicantRanking.model');
const Job = require('../models/job.model');
const Application = require('../models/application.model');

// Get rankings for a specific job
router.get(
  '/job/:jobId',
  [auth, authorize('admin', 'employer')],
  async (req, res) => {
    try {
      const { jobId } = req.params;

      console.log({ jobId });
      const {
        page = 1,
        limit = 10,
        status,
        sortBy = 'rank',
        sortOrder = 'asc'
      } = req.query;

      // Check if job exists
      const job = await Job.findById(jobId);
      if (!job) {
        return res.status(404).json({ message: 'Job not found' });
      }

      // Check employer permissions
      if (req.user.role === 'employer') {
        const Company = require('../models/company.model');
        const company = await Company.findOne({ adminId: req.user._id });
        if (!company || job.companyId.toString() !== company._id.toString()) {
          return res
            .status(403)
            .json({ message: 'Not authorized to view this job ranking' });
        }
      }

      const result = await ApplicantRanking.getJobRankings(jobId, {
        page,
        limit,
        status,
        sortBy,
        sortOrder
      });

      console.log({ result });
      res.json({
        success: true,
        ...result,
        job: {
          _id: job._id,
          title: job.title,
          companyId: job.companyId
        }
      });
    } catch (error) {
      console.error('Error fetching job rankings:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching job rankings',
        error: error.message
      });
    }
  }
);

// Get overall rankings across all jobs
router.get('/overall', [auth, authorize('admin')], async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      startDate,
      endDate,
      sortBy = 'overallScore',
      sortOrder = 'desc'
    } = req.query;

    const dateRange = startDate || endDate ? { startDate, endDate } : null;

    const result = await ApplicantRanking.getOverallRankings({
      page,
      limit,
      dateRange,
      sortBy,
      sortOrder
    });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error fetching overall rankings:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching overall rankings',
      error: error.message
    });
  }
});

// Recalculate rankings for a specific job
router.post(
  '/recalculate/:jobId',
  [auth, authorize('admin', 'employer')],
  async (req, res) => {
    try {
      const { jobId } = req.params;

      // Check if job exists
      const job = await Job.findById(jobId);
      if (!job) {
        return res.status(404).json({ message: 'Job not found' });
      }

      // Check employer permissions
      if (req.user.role === 'employer') {
        const Company = require('../models/company.model');
        const company = await Company.findOne({ adminId: req.user._id });
        if (!company || job.companyId.toString() !== company._id.toString()) {
          return res.status(403).json({
            message: 'Not authorized to recalculate this job ranking'
          });
        }
      }

      // Check if there are applications for this job
      const applicationCount = await Application.countDocuments({ jobId });
      if (applicationCount === 0) {
        return res.status(400).json({
          success: false,
          message: 'No applications found for this job'
        });
      }

      // Recalculate rankings
      const rankings = await ApplicantRanking.recalculateJobRankings(jobId);

      res.json({
        success: true,
        message: `Successfully recalculated rankings for ${rankings.length} applicants`,
        rankings: rankings.length
      });
    } catch (error) {
      console.error('Error recalculating rankings:', error);
      res.status(500).json({
        success: false,
        message: 'Error recalculating rankings',
        error: error.message
      });
    }
  }
);

// Update ranking status (shortlist, reject, etc.)
router.put(
  '/:rankingId/status',
  [auth, authorize('admin', 'employer')],
  async (req, res) => {
    try {
      const { rankingId } = req.params;
      const { status, adminNotes } = req.body;

      if (!['pending', 'shortlisted', 'rejected', 'hired'].includes(status)) {
        return res.status(400).json({
          success: false,
          message:
            'Invalid status. Must be one of: pending, shortlisted, rejected, hired'
        });
      }

      const ranking = await ApplicantRanking.findById(rankingId).populate(
        'jobId',
        'title companyId'
      );

      if (!ranking) {
        return res.status(404).json({
          success: false,
          message: 'Ranking not found'
        });
      }

      // Check employer permissions
      if (req.user.role === 'employer') {
        const Company = require('../models/company.model');
        const company = await Company.findOne({ adminId: req.user._id });
        if (
          !company ||
          ranking.jobId.companyId.toString() !== company._id.toString()
        ) {
          return res.status(403).json({
            success: false,
            message: 'Not authorized to update this ranking'
          });
        }
      }

      ranking.status = status;
      if (adminNotes) ranking.adminNotes = adminNotes;
      ranking.lastUpdated = new Date();

      await ranking.save();

      res.json({
        success: true,
        message: 'Ranking status updated successfully',
        ranking
      });
    } catch (error) {
      console.error('Error updating ranking status:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating ranking status',
        error: error.message
      });
    }
  }
);

// Manually adjust ranking
router.put(
  '/:rankingId/adjust',
  [auth, authorize('admin')],
  async (req, res) => {
    try {
      const { rankingId } = req.params;
      const { overallScore, manualAdjustmentReason, adminNotes } = req.body;

      if (
        overallScore !== undefined &&
        (overallScore < 0 || overallScore > 100)
      ) {
        return res.status(400).json({
          success: false,
          message: 'Overall score must be between 0 and 100'
        });
      }

      const ranking = await ApplicantRanking.findById(rankingId);

      if (!ranking) {
        return res.status(404).json({
          success: false,
          message: 'Ranking not found'
        });
      }

      if (overallScore !== undefined) {
        ranking.overallScore = overallScore;
      }

      if (manualAdjustmentReason) {
        ranking.manualAdjustmentReason = manualAdjustmentReason;
      }

      if (adminNotes) {
        ranking.adminNotes = adminNotes;
      }

      ranking.isManuallyAdjusted = true;
      ranking.lastUpdated = new Date();

      await ranking.save();

      res.json({
        success: true,
        message: 'Ranking adjusted successfully',
        ranking
      });
    } catch (error) {
      console.error('Error adjusting ranking:', error);
      res.status(500).json({
        success: false,
        message: 'Error adjusting ranking',
        error: error.message
      });
    }
  }
);

// Get ranking statistics
router.get('/stats', [auth, authorize('admin')], async (req, res) => {
  try {
    const { jobId, dateRange } = req.query;

    const query = {};
    if (jobId) query.jobId = jobId;
    if (dateRange) {
      const { startDate, endDate } = JSON.parse(dateRange);
      query.rankedAt = {};
      if (startDate) query.rankedAt.$gte = new Date(startDate);
      if (endDate) query.rankedAt.$lte = new Date(endDate);
    }

    const [
      totalRankings,
      averageScore,
      statusCounts,
      topPerformers,
      recentRankings
    ] = await Promise.all([
      ApplicantRanking.countDocuments(query),
      ApplicantRanking.aggregate([
        { $match: query },
        { $group: { _id: null, avgScore: { $avg: '$overallScore' } } }
      ]),
      ApplicantRanking.aggregate([
        { $match: query },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      ApplicantRanking.find(query)
        .sort({ overallScore: -1 })
        .limit(5)
        .populate('applicantId', 'firstName lastName')
        .populate('jobId', 'title'),
      ApplicantRanking.find(query)
        .sort({ rankedAt: -1 })
        .limit(10)
        .populate('applicantId', 'firstName lastName')
        .populate('jobId', 'title')
    ]);

    res.json({
      success: true,
      stats: {
        totalRankings,
        averageScore: averageScore[0]?.avgScore || 0,
        statusCounts: statusCounts.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        topPerformers,
        recentRankings
      }
    });
  } catch (error) {
    console.error('Error fetching ranking stats:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching ranking statistics',
      error: error.message
    });
  }
});

// Export rankings to CSV
router.get(
  '/export/csv',
  [auth, authorize('admin', 'employer')],
  async (req, res) => {
    try {
      const { jobId, status, startDate, endDate } = req.query;

      const query = {};
      if (jobId) query.jobId = jobId;
      if (status) query.status = status;
      if (startDate || endDate) {
        query.rankedAt = {};
        if (startDate) query.rankedAt.$gte = new Date(startDate);
        if (endDate) query.rankedAt.$lte = new Date(endDate);
      }

      const rankings = await ApplicantRanking.find(query)
        .populate('applicantId', 'firstName lastName email phone location')
        .populate('jobId', 'title companyId')
        .populate('applicationId', 'appliedAt')
        .sort({ rank: 1 });

      // Convert to CSV format
      const csvHeaders = [
        'Rank',
        'Percentile',
        'Applicant Name',
        'Email',
        'Phone',
        'Location',
        'Job Title',
        'Overall Score (%)',
        'Algorithmic Score (%)',
        'AI Score (%)',
        'Experience Score (%)',
        'Skills Score (%)',
        'Education Score (%)',
        'Location Score (%)',
        'ATS Keywords Score (%)',
        'Status',
        'Applied Date',
        'Ranked Date',
        'Manually Adjusted',
        'Adjustment Reason',
        'Admin Notes',
        'Total Applicants',
        'Match Reasons',
        'Concerns',
        'Strengths'
      ];

      const csvRows = rankings.map(ranking => {
        // Format dates
        const appliedDate = ranking.applicationId?.appliedAt
          ? new Date(ranking.applicationId.appliedAt).toLocaleDateString()
          : 'N/A';
        const rankedDate = ranking.rankedAt
          ? new Date(ranking.rankedAt).toLocaleDateString()
          : 'N/A';

        // Format arrays
        const matchReasons = ranking.matchReasons?.join('; ') || '';
        const concerns = ranking.concerns?.join('; ') || '';
        const strengths = ranking.strengths?.join('; ') || '';

        return [
          ranking.rank || '',
          ranking.percentile ? `${ranking.percentile}th` : '',
          `${ranking.applicantId?.firstName || ''} ${
            ranking.applicantId?.lastName || ''
          }`.trim(),
          ranking.applicantId?.email || '',
          ranking.applicantId?.phone || '',
          ranking.applicantId?.location || '',
          ranking.jobId?.title || '',
          ranking.overallScore || 0,
          ranking.algorithmicScore || 0,
          ranking.aiScore || 0,
          ranking.scoringBreakdown?.experienceScore || 0,
          ranking.scoringBreakdown?.skillsScore || 0,
          ranking.scoringBreakdown?.educationScore || 0,
          ranking.scoringBreakdown?.locationScore || 0,
          ranking.scoringBreakdown?.atsKeywordsScore || 0,
          ranking.status || 'pending',
          appliedDate,
          rankedDate,
          ranking.isManuallyAdjusted ? 'Yes' : 'No',
          ranking.manualAdjustmentReason || '',
          ranking.adminNotes || '',
          ranking.totalApplicants || 0,
          matchReasons,
          concerns,
          strengths
        ];
      });

      // Escape CSV fields properly
      const escapeCsvField = field => {
        const stringField = String(field);
        // If field contains comma, quote, or newline, wrap in quotes and escape quotes
        if (
          stringField.includes(',') ||
          stringField.includes('"') ||
          stringField.includes('\n')
        ) {
          return `"${stringField.replace(/"/g, '""')}"`;
        }
        return stringField;
      };

      const csvContent = [csvHeaders, ...csvRows]
        .map(row => row.map(escapeCsvField).join(','))
        .join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="applicant-rankings-${Date.now()}.csv"`
      );
      res.send(csvContent);
    } catch (error) {
      console.error('Error exporting rankings:', error);
      res.status(500).json({
        success: false,
        message: 'Error exporting rankings',
        error: error.message
      });
    }
  }
);

// Get available jobs for ranking
router.get(
  '/jobs/available',
  [auth, authorize('admin', 'employer')],
  async (req, res) => {
    try {
      const query = { status: 'active' };

      // Filter by employer if not admin
      if (req.user.role === 'employer') {
        const Company = require('../models/company.model');
        const company = await Company.findOne({ adminId: req.user._id });
        if (company) {
          query.companyId = company._id;
        }
      }

      const jobs = await Job.find(query)
        .populate('companyId', 'name')
        .populate('categoryId', 'name')
        .select('title companyId categoryId postedDate expiryDate')
        .sort({ postedDate: -1 });

      // Add application count for each job
      const jobsWithCounts = await Promise.all(
        jobs.map(async job => {
          const applicationCount = await Application.countDocuments({
            jobId: job._id
          });
          return {
            ...job.toObject(),
            applicationCount
          };
        })
      );

      res.json({
        success: true,
        jobs: jobsWithCounts.filter(job => job.applicationCount > 0)
      });
    } catch (error) {
      console.error('Error fetching available jobs:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching available jobs',
        error: error.message
      });
    }
  }
);

module.exports = router;
