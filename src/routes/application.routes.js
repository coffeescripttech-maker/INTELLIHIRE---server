const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { auth, authorize } = require('../middleware/auth.middleware');
const Application = require('../models/application.model');
const Job = require('../models/job.model');
const Document = require('../models/document.model');
const User = require('../models/user.model');
const ApplicantRanking = require('../models/applicantRanking.model');
const Company = require('../models/company.model');

// Middleware for validation
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// Get all applications (admin/employer)
router.get(
  '/',
  [auth, authorize('admin', 'employer', 'applicant')],
  async (req, res) => {
    try {
      const {
        jobId,
        applicantId,
        status,
        page = 1,
        limit = 10,
        sort = '-createdAt'
      } = req.query;

      const query = {};

      if (jobId) query.jobId = jobId;
      if (applicantId) query.applicantId = applicantId;
      if (status) query.status = status;

      // If employer, only show applications for their company's jobs
      if (req.user.role === 'employer') {
        const jobs = await Job.find({ companyId: req.user.companyId }).select(
          '_id'
        );
        query.jobId = { $in: jobs.map(job => job._id) };
      }

      const applications = await Application.find(query)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(parseInt(limit))
        .populate(
          'jobId',
          'title companyId location employmentType salaryMin salaryMax'
        )
        .populate('jobId.companyId', 'name logo industry website')
        .populate('applicantId', 'firstName lastName email')
        .populate('resumeId', 'title fileUrl')
        .populate('pdsId', 'title fileUrl');

      const total = await Application.countDocuments(query);

      res.json({
        applications,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
        total
      });
    } catch (error) {
      res
        .status(500)
        .json({ message: 'Error fetching applications', error: error.message });
    }
  }
);

// Get application by ID (admin/employer/applicant)
router.get('/:id', auth, async (req, res) => {
  try {
    const application = await Application.findById(req.params.id)
      .populate(
        'jobId',
        'title companyId location employmentType salaryMin salaryMax'
      )
      .populate('jobId.companyId', 'name logo industry website')
      .populate('applicantId', 'firstName lastName email')
      .populate('resumeId', 'title fileUrl')
      .populate('pdsId', 'title fileUrl')
      .populate('additionalDocuments', 'title fileUrl');

    if (!application) {
      return res.status(404).json({ message: 'Application not found' });
    }

    // Check permissions
    if (
      req.user.role === 'applicant' &&
      application.applicantId._id.toString() !== req.user._id.toString()
    ) {
      return res
        .status(403)
        .json({ message: 'Not authorized to view this application' });
    }

    if (req.user.role === 'employer') {
      const job = await Job.findById(application.jobId._id);
      if (job.companyId.toString() !== req.user.companyId.toString()) {
        return res
          .status(403)
          .json({ message: 'Not authorized to view this application' });
      }
    }

    res.json(application);
  } catch (error) {
    res
      .status(500)
      .json({ message: 'Error fetching application', error: error.message });
  }
});

// Create new application (applicant only)
router.post(
  '/',
  [
    auth,
    authorize('applicant'),
    body('jobId').notEmpty(),
    // At least one of resumeId or pdsId must be provided
    // Validation will be done in the route handler based on job type
    validate
  ],
  async (req, res) => {
    try {
      // Check if job exists and is active
      const job = await Job.findOne({
        _id: req.body.jobId,
        status: 'active',
        expiryDate: { $gt: new Date() }
      }).populate('companyId', 'isGovernment');

      // if (!job) {
      //   return res.status(400).json({ message: 'Job not found or not active' });
      // }

      // Check if user has already applied
      const existingApplication = await Application.findOne({
        jobId: req.body.jobId,
        applicantId: req.user._id
      });

      if (existingApplication) {
        return res
          .status(400)
          .json({ message: 'You have already applied for this job' });
      }

      // Validate required documents based on job type
      const isGovernmentJob = job?.companyId?.isGovernment || false;

      if (isGovernmentJob && !req.body.pdsId) {
        return res.status(400).json({
          message:
            'PDS (Personal Data Sheet) is required for government job applications'
        });
      }

      if (!isGovernmentJob && !req.body.resumeId) {
        return res.status(400).json({
          message: 'Resume/CV is required for this job application'
        });
      }

      // Verify documents belong to user
      const documents = await Document.find({
        _id: {
          $in: [
            req.body.resumeId,
            req.body.pdsId,
            ...(req.body.additionalDocuments || [])
          ]
        },
        userId: req.user._id
      });

      // if (
      //   documents.length !==
      //   [
      //     req.body.resumeId,
      //     req.body.pdsId,
      //     ...(req.body.additionalDocuments || [])
      //   ].length
      // ) {
      //   return res.status(400).json({ message: 'Invalid document IDs' });
      // }

      const application = new Application({
        ...req.body,
        applicantId: req.user._id,
        status: 'applied'
      });

      await application.save();

      // Update job application count
      await Job.findByIdAndUpdate(req.body.jobId, {
        $inc: { applicationCount: 1 }
      });

      // Automatically calculate ranking for this applicant
      try {
        const ApplicantRanking = require('../models/applicantRanking.model');
        console.log('🎯 Auto-calculating ranking for new application...');

        // Calculate score for this specific application
        const rankingData = await ApplicantRanking.calculateApplicantScore(
          application
        );

        // Get existing rankings for this job to determine rank
        const existingRankings = await ApplicantRanking.find({
          jobId: req.body.jobId
        }).sort({ overallScore: -1 });

        // Calculate rank and percentile
        const allScores = [
          ...existingRankings.map(r => r.overallScore),
          rankingData.overallScore
        ];
        allScores.sort((a, b) => b - a);
        const rank = allScores.indexOf(rankingData.overallScore) + 1;
        const totalApplicants = allScores.length;
        const percentile = Math.round(
          ((totalApplicants - rank + 1) / totalApplicants) * 100
        );

        // Create or update ranking
        const existingRanking = await ApplicantRanking.findOne({
          applicantId: req.user._id,
          jobId: req.body.jobId
        });

        if (existingRanking) {
          Object.assign(existingRanking, {
            ...rankingData,
            rank,
            totalApplicants,
            percentile
          });
          await existingRanking.save();
        } else {
          await ApplicantRanking.create({
            ...rankingData,
            rank,
            totalApplicants,
            percentile
          });
        }

        // Update ranks for all other applicants
        const updatedRankings = await ApplicantRanking.find({
          jobId: req.body.jobId
        }).sort({ overallScore: -1 });

        for (let i = 0; i < updatedRankings.length; i++) {
          updatedRankings[i].rank = i + 1;
          updatedRankings[i].totalApplicants = updatedRankings.length;
          updatedRankings[i].percentile = Math.round(
            ((updatedRankings.length - i) / updatedRankings.length) * 100
          );
          await updatedRankings[i].save();
        }

        console.log('✅ Ranking calculated successfully');
      } catch (rankingError) {
        console.error('⚠️ Error calculating ranking:', rankingError);
        // Don't fail the application submission if ranking fails
      }

      res.status(201).json(application);
    } catch (error) {
      res
        .status(500)
        .json({ message: 'Error creating application', error: error.message });
    }
  }
);

// Update application status (admin/employer only)
router.patch(
  '/:id/status',
  [
    auth,
    authorize('admin', 'employer'),
    body('status').isIn([
      'screening',
      'interview',
      'offered',
      'hired',
      'rejected',
      'withdrawn'
    ]),
    body('notes').optional(),
    body('interviewDate').optional(),
    body('interviewLocation').optional(),
    body('interviewType').optional(),
    body('rejectionReason').optional(),
    validate
  ],
  async (req, res) => {
    try {
      const application = await Application.findById(req.params.id)
        .populate('applicantId', 'email firstName lastName')
        .populate('jobId', 'title companyId')
        .populate({
          path: 'jobId',
          populate: {
            path: 'companyId',
            select: 'name'
          }
        });

      if (!application) {
        return res.status(404).json({ message: 'Application not found' });
      }

      // Check if employer has permission
      if (req.user.role === 'employer') {
        const job = await Job.findById(application.jobId);
        if (job.companyId.toString() !== req.user.companyId.toString()) {
          return res
            .status(403)
            .json({ message: 'Not authorized to update this application' });
        }
      }

      // Update application
      application.status = req.body.status;
      if (req.body.notes) application.notes = req.body.notes;
      if (req.body.interviewDate)
        application.interviewDate = req.body.interviewDate;
      if (req.body.interviewLocation)
        application.interviewLocation = req.body.interviewLocation;
      if (req.body.interviewType)
        application.interviewType = req.body.interviewType;
      if (req.body.rejectionReason)
        application.rejectionReason = req.body.rejectionReason;

      await application.save();

      // Send email notification to applicant
      const emailService = require('../services/email.service');
      const baseUrl = process.env.CLIENT_URL || 'http://localhost:3000';

      try {
        await emailService.sendApplicationStatusUpdate(
          application.applicantId.email,
          application.applicantId.firstName,
          {
            status: application.status,
            jobTitle: application.jobId.title,
            companyName: application.jobId.companyId.name,
            notes: application.notes,
            interviewDate: application.interviewDate,
            interviewLocation: application.interviewLocation,
            interviewType: application.interviewType,
            rejectionReason: application.rejectionReason
          },
          baseUrl
        );
        console.log(
          `✅ Status update email sent to ${application.applicantId.email}`
        );
      } catch (emailError) {
        console.error('⚠️ Failed to send status update email:', emailError);
        // Don't fail the request if email fails
      }

      res.json(application);
    } catch (error) {
      res.status(500).json({
        message: 'Error updating application status',
        error: error.message
      });
    }
  }
);

// Schedule interview (admin/employer only)
router.post(
  '/:id/interview',
  [
    auth,
    authorize('admin', 'employer'),
    body('interviewDate').isISO8601(),
    body('interviewLocation').notEmpty(),
    body('interviewType').isIn(['in-person', 'phone', 'video']),
    validate
  ],
  async (req, res) => {
    try {
      const application = await Application.findById(req.params.id);

      if (!application) {
        return res.status(404).json({ message: 'Application not found' });
      }

      // Check if employer has permission
      if (req.user.role === 'employer') {
        const job = await Job.findById(application.jobId);
        if (job.companyId.toString() !== req.user.companyId.toString()) {
          return res
            .status(403)
            .json({ message: 'Not authorized to schedule interview' });
        }
      }

      application.interviewDate = req.body.interviewDate;
      application.interviewLocation = req.body.interviewLocation;
      application.interviewType = req.body.interviewType;
      application.status = 'interview';

      await application.save();

      res.json(application);
    } catch (error) {
      res
        .status(500)
        .json({ message: 'Error scheduling interview', error: error.message });
    }
  }
);

// Withdraw application (applicant only)
router.post(
  '/:id/withdraw',
  [auth, authorize('applicant')],
  async (req, res) => {
    try {
      const application = await Application.findById(req.params.id);

      if (!application) {
        return res.status(404).json({ message: 'Application not found' });
      }

      if (application.applicantId.toString() !== req.user._id.toString()) {
        return res
          .status(403)
          .json({ message: 'Not authorized to withdraw this application' });
      }

      if (application.status === 'withdrawn') {
        return res
          .status(400)
          .json({ message: 'Application already withdrawn' });
      }

      application.status = 'withdrawn';
      await application.save();

      res.json(application);
    } catch (error) {
      res.status(500).json({
        message: 'Error withdrawing application',
        error: error.message
      });
    }
  }
);

// Get current user's applications (applicant only)
router.get(
  '/list/my-applications',
  [auth, authorize('applicant')],
  async (req, res) => {
    try {
      const applications = await Application.find({ applicantId: req.user._id })
        .sort('-createdAt')
        .populate({
          path: 'jobId',
          select:
            'title companyId location employmentType salaryMin salaryMax postedDate description',
          populate: {
            path: 'companyId',
            select: 'name logo industry website description'
          }
        })
        .populate('resumeId', 'title fileUrl')
        .populate('pdsId', 'title fileUrl');
      res.json({ applications });
    } catch (error) {
      res.status(500).json({
        message: 'Error fetching your applications',
        error: error.message
      });
    }
  }
);

// Export applicants for a specific job (admin/employer)
router.get(
  '/export/job/:jobId',
  [auth, authorize('admin', 'employer')],
  async (req, res) => {
    try {
      const { jobId } = req.params;
      const { format = 'csv' } = req.query;

      // Verify job exists
      const job = await Job.findById(jobId).populate('companyId', 'name');
      if (!job) {
        return res.status(404).json({ message: 'Job not found' });
      }

      // If employer, verify they own this job
      if (req.user.role === 'employer') {
        const company = await Company.findOne({ adminId: req.user._id });
        if (
          !company ||
          job.companyId._id.toString() !== company._id.toString()
        ) {
          return res.status(403).json({
            message: 'Not authorized to export applicants for this job'
          });
        }
      }

      // Get applications with populated data
      const applications = await Application.find({ jobId })
        .populate('applicantId', 'firstName lastName email phone address')
        .populate('resumeId', 'title fileUrl')
        .populate('pdsId', 'title fileUrl')
        .sort('-createdAt');

      if (format === 'csv') {
        // Generate CSV
        const csvHeader = [
          'Applicant Name',
          'Email',
          'Phone',
          'Address',
          'Application Date',
          'Status',
          'Resume File',
          'PDS File',
          'Cover Letter',
          'Notes'
        ].join(',');

        const csvRows = applications.map(app => {
          const applicant = app.applicantId;
          return [
            `"${applicant.firstName} ${applicant.lastName}"`,
            `"${applicant.email}"`,
            `"${applicant.phone || ''}"`,
            `"${applicant.address || ''}"`,
            `"${new Date(app.createdAt).toLocaleDateString()}"`,
            `"${app.status}"`,
            `"${app.resumeId?.fileUrl || ''}"`,
            `"${app.pdsId?.fileUrl || ''}"`,
            `"${app.coverLetter || ''}"`,
            `"${app.notes || ''}"`
          ].join(',');
        });

        const csvContent = [csvHeader, ...csvRows].join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="applicants-${job.title.replace(
            /[^a-zA-Z0-9]/g,
            '_'
          )}-${new Date().toISOString().split('T')[0]}.csv"`
        );
        res.send(csvContent);
      } else {
        // Return JSON
        res.json({
          job: {
            title: job.title,
            company: job.companyId.name,
            location: job.location
          },
          applications: applications.map(app => ({
            applicantName: `${app.applicantId.firstName} ${app.applicantId.lastName}`,
            email: app.applicantId.email,
            phone: app.applicantId.phoneNumber,
            address: app.applicantId.address,
            applicationDate: app.createdAt,
            status: app.status,
            resumeFile: app.resumeId?.fileUrl,
            pdsFile: app.pdsId?.fileUrl,
            coverLetter: app.coverLetter,
            notes: app.notes
          }))
        });
      }
    } catch (error) {
      res.status(500).json({
        message: 'Error exporting applicants',
        error: error.message
      });
    }
  }
);

// Export all applicants across all jobs (admin only)
router.get('/export/all', [auth, authorize('admin')], async (req, res) => {
  try {
    const { format = 'csv', jobId, status, dateFrom, dateTo } = req.query;

    // Build query
    const query = {};
    if (jobId) query.jobId = jobId;
    if (status) query.status = status;
    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
      if (dateTo) query.createdAt.$lte = new Date(dateTo);
    }

    // Get applications with populated data
    const applications = await Application.find(query)
      .populate('applicantId', 'firstName lastName email phoneNumber address')
      .populate('jobId', 'title companyId location')
      .populate({
        path: 'jobId',
        populate: {
          path: 'companyId',
          select: 'name'
        }
      })
      .populate('resumeId', 'title fileUrl')
      .populate('pdsId', 'title fileUrl')
      .sort('-createdAt');

    if (format === 'csv') {
      // Generate CSV
      const csvHeader = [
        'Applicant Name',
        'Email',
        'Phone',
        'Address',
        'Job Title',
        'Company',
        'Job Location',
        'Application Date',
        'Status',
        'Resume File',
        'PDS File',
        'Cover Letter',
        'Notes'
      ].join(',');

      const csvRows = applications.map(app => {
        const applicant = app.applicantId;
        const job = app.jobId;
        return [
          `"${applicant.firstName} ${applicant.lastName}"`,
          `"${applicant.email}"`,
          `"${applicant.phoneNumber || ''}"`,
          `"${applicant.address ? `${applicant.address.street || ''}, ${applicant.address.city || ''}, ${applicant.address.province || ''}, ${applicant.address.zipCode || ''}`.trim().replace(/^,\s*|,\s*$/g, '') : ''}"`,
          `"${job.title}"`,
          `"${job.companyId.name}"`,
          `"${job.location}"`,
          `"${new Date(app.createdAt).toLocaleDateString()}"`,
          `"${app.status}"`,
          `"${app.resumeId?.fileUrl || ''}"`,
          `"${app.pdsId?.fileUrl || ''}"`,
          `"${app.coverLetter || ''}"`,
          `"${app.notes || ''}"`
        ].join(',');
      });

      const csvContent = [csvHeader, ...csvRows].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="all-applicants-${
          new Date().toISOString().split('T')[0]
        }.csv"`
      );
      res.send(csvContent);
    } else {
      // Return JSON
      res.json({
        applications: applications.map(app => ({
          applicantName: `${app.applicantId.firstName} ${app.applicantId.lastName}`,
          email: app.applicantId.email,
          phone: app.applicantId.phoneNumber,
          address: app.applicantId.address,
          jobTitle: app.jobId.title,
          company: app.jobId.companyId.name,
          jobLocation: app.jobId.location,
          applicationDate: app.createdAt,
          status: app.status,
          resumeFile: app.resumeId?.fileUrl,
          pdsFile: app.pdsId?.fileUrl,
          coverLetter: app.coverLetter,
          notes: app.notes
        }))
      });
    }
  } catch (error) {
    res.status(500).json({
      message: 'Error exporting all applicants',
      error: error.message
    });
  }
});

// Export ranked applicants (admin only)
router.get('/export/rankings', [auth, authorize('admin')], async (req, res) => {
  try {
    const { format = 'csv', jobId, status, sortBy = 'rank' } = req.query;

    // Build query
    const query = {};
    if (jobId) query.jobId = jobId;
    if (status) query.status = status;

    // Get rankings with populated data
    const rankings = await ApplicantRanking.find(query)
      .populate('applicantId', 'firstName lastName email phoneNumber address')
      .populate('jobId', 'title companyId location')
      .populate({
        path: 'jobId',
        populate: {
          path: 'companyId',
          select: 'name'
        }
      })
      .sort(sortBy === 'rank' ? 'rank' : '-overallScore');

    if (format === 'csv') {
      // Generate CSV
      const csvHeader = [
        'Rank',
        'Applicant Name',
        'Email',
        'Phone',
        'Job Title',
        'Company',
        'Job Location',
        'Overall Score',
        'Algorithmic Score',
        'Experience Score',
        'Skills Match %',
        'Education Score',
        'Status',
        'Match Reasons',
        'Notes'
      ].join(',');

      const csvRows = rankings.map(ranking => {
        const applicant = ranking.applicantId;
        const job = ranking.jobId;
        return [
          ranking.rank,
          `"${applicant.firstName} ${applicant.lastName}"`,
          `"${applicant.email}"`,
          `"${applicant.phoneNumber || ''}"`,
          `"${job.title}"`,
          `"${job.companyId.name}"`,
          `"${job.location}"`,
          ranking.overallScore,
          ranking.algorithmicScore,
          ranking.scoreBreakdown?.experience || 0,
          ranking.scoreBreakdown?.skillsMatch || 0,
          ranking.scoreBreakdown?.education || 0,
          `"${ranking.status}"`,
          `"${ranking.matchReasons?.join('; ') || ''}"`,
          `"${ranking.notes || ''}"`
        ].join(',');
      });

      const csvContent = [csvHeader, ...csvRows].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="ranked-applicants-${
          jobId ? 'job-' + jobId : 'all'
        }-${new Date().toISOString().split('T')[0]}.csv"`
      );
      res.send(csvContent);
    } else {
      // Return JSON
      res.json({
        rankings: rankings.map(ranking => ({
          rank: ranking.rank,
          applicantName: `${ranking.applicantId.firstName} ${ranking.applicantId.lastName}`,
          email: ranking.applicantId.email,
          phone: ranking.applicantId.phoneNumber,
          address: ranking.applicantId.address,
          jobTitle: ranking.jobId.title,
          company: ranking.jobId.companyId.name,
          jobLocation: ranking.jobId.location,
          overallScore: ranking.overallScore,
          algorithmicScore: ranking.algorithmicScore,
          experienceScore: ranking.scoreBreakdown?.experience || 0,
          skillsMatch: ranking.scoreBreakdown?.skillsMatch || 0,
          educationScore: ranking.scoreBreakdown?.education || 0,
          status: ranking.status,
          matchReasons: ranking.matchReasons,
          notes: ranking.notes
        }))
      });
    }
  } catch (error) {
    res.status(500).json({
      message: 'Error exporting ranked applicants',
      error: error.message
    });
  }
});

module.exports = router;
