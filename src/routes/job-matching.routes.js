const express = require('express');
const router = express.Router();
const { auth, authorize } = require('../middleware/auth.middleware');
const jobMatcher = require('../services/job-matcher.service');

// Get matching jobs for the authenticated applicant
router.get('/jobs', auth, async (req, res) => {
  try {
    if (req.user.role !== 'applicant') {
      return res
        .status(403)
        .json({ message: 'Only applicants can access job matches' });
    }

    const limit = parseInt(req.query.limit) || 10;
    const matches = await jobMatcher.findMatchingJobs(req.user._id, limit);
    res.json(matches);
  } catch (error) {
    res
      .status(500)
      .json({ message: 'Error finding matching jobs', error: error.message });
  }
});

// Get matching applicants for a specific job (admin/employer only)
router.get(
  '/applicants/:jobId',
  [auth, authorize('admin', 'employer')],
  async (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 10;
      const matches = await jobMatcher.findMatchingApplicants(
        req.params.jobId,
        limit
      );
      res.json(matches);
    } catch (error) {
      res
        .status(500)
        .json({
          message: 'Error finding matching applicants',
          error: error.message
        });
    }
  }
);

// Calculate match score for a specific job and applicant
router.get('/score/:jobId/:applicantId', auth, async (req, res) => {
  try {
    // Only allow if user is admin, employer, or the applicant themselves
    if (
      req.user.role !== 'admin' &&
      req.user.role !== 'employer' &&
      req.user._id.toString() !== req.params.applicantId
    ) {
      return res
        .status(403)
        .json({ message: 'Not authorized to view this match score' });
    }

    const { matchScore, matchDetails } = await jobMatcher.calculateMatchScore(
      req.params.applicantId,
      req.params.jobId
    );

    res.json({ matchScore, matchDetails });
  } catch (error) {
    res
      .status(500)
      .json({ message: 'Error calculating match score', error: error.message });
  }
});

module.exports = router;
