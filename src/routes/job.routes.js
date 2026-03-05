const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { auth, authorize } = require('../middleware/auth.middleware');
const Job = require('../models/job.model');
const Company = require('../models/company.model');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { rateLimiter } = require('../utils/gemini-rate-limiter');

// Middleware for validation
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// Get all jobs (public)
router.get('/', async (req, res) => {
  try {
    const {
      category,
      location,
      type,
      search,
      companyId,
      page = 1,
      limit = 10,
      sort = '-postedDate'
    } = req.query;

    const query = {
      status: 'active'
      // expiryDate: { $gt: new Date() }
    };

    console.log({ category, companyId });
    if (category) query.categoryId = category;
    if (companyId) query.companyId = companyId;
    if (location) query.location = new RegExp(location, 'i');
    if (type) query.employmentType = type;
    if (search) {
      query.$or = [
        { title: new RegExp(search, 'i') },
        { description: new RegExp(search, 'i') }
      ];
    }

    const jobs = await Job.find(query)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .populate('companyId', 'name logo isGovernment')
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
      .json({ message: 'Error fetching jobs', error: error.message });
  }
});

// Get all jobs for admin (includes all statuses)
router.get('/admin/all', [auth, authorize('admin')], async (req, res) => {
  try {
    const {
      category,
      location,
      type,
      search,
      companyId,
      status,
      page = 1,
      limit = 10,
      sort = '-postedDate'
    } = req.query;

    const query = {};

    // Add filters
    if (category) query.categoryId = category;
    if (companyId) query.companyId = companyId;
    if (location) query.location = new RegExp(location, 'i');
    if (type) query.employmentType = type;
    if (status) query.status = status;
    if (search) {
      query.$or = [
        { title: new RegExp(search, 'i') },
        { description: new RegExp(search, 'i') }
      ];
    }

    const jobs = await Job.find(query)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .populate('companyId', 'name logo isGovernment')
      .populate('categoryId', 'name');

    const total = await Job.countDocuments(query);

    res.json({
      jobs,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      total
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: 'Error fetching jobs', error: error.message });
  }
});

// Get job recommendations for applicant (authenticated) - MUST be before /:id route
router.get(
  '/recommendations',
  [auth, authorize('applicant')],
  async (req, res) => {
    console.log('🎯 RECOMMENDATIONS ROUTE HIT!', req.url, req.query);
    try {
      const {
        minMatchScore = 70,
        location,
        employmentType,
        category,
        salaryRange,
        limit = 20
      } = req.query;

      // Get user's profile data for matching
      const User = require('../models/user.model');
      const PdsExtractedData = require('../models/pdsExtractedData.model');
      const Resume = require('../models/resume.model');

      const user = await User.findById(req.user._id);

      if (!user) {
        return res.status(404).json({ message: 'User profile not found' });
      }

      // Load latest PDS + Resume for richer matching
      const pds = await PdsExtractedData.findOne({ userId: req.user._id }).sort(
        { createdAt: -1 }
      );
      const resume = await Resume.findOne({ userId: req.user._id }).sort({
        createdAt: -1
      });

      // Build derived applicant profile from PDS + Resume
      const derived = buildApplicantProfileFromPdsAndResume({
        user,
        pds,
        resume
      });

      // console.log({ derived });
      // Build query for job recommendations
      const query = {
        // status: 'active',
        // expiryDate: { $gt: new Date() }
      };

      // Apply filters
      // if (location && location !== 'all') {
      //   query.location = new RegExp(location, 'i');
      // }
      // if (employmentType && employmentType !== 'all') {
      //   query.employmentType = employmentType;
      // }
      // if (category && category !== 'all') {
      //   query.categoryId = category;
      // }

      // Get jobs
      const jobs = await Job.find(query)
        .populate('companyId', 'name logo isGovernment')
        .populate('categoryId', 'name')
        .limit(parseInt(limit));

      // console.log({ jobs });

      // Calculate match scores using both algorithmic and AI methods
      const recommendations = await Promise.all(
        jobs.map(async job => {
          // Algorithmic matching (existing logic)
          const algorithmicScore = calculateRichMatchScore(job, derived);
          const algorithmicReasons = generateRichMatchReasons(job, derived);

          // AI-powered matching using Gemini
          const aiMatchResult = await calculateAIMatchScore(job, derived);

          // Combine both scores (70% algorithmic + 30% AI)
          const combinedScore = Math.round(
            algorithmicScore * 0.5 + aiMatchResult.score * 0.5
          );

          // Combine match reasons
          const combinedReasons = [
            ...algorithmicReasons,
            ...aiMatchResult.reasons
          ].slice(0, 5); // Limit to 5 reasons

          console.log(`Job: ${job.title}`);
          console.log(`  Algorithmic Score: ${algorithmicScore}`);
          console.log(`  AI Score: ${aiMatchResult.score}`);
          console.log(`  Combined Score: ${combinedScore}`);
          console.log(`  AI Reasons: ${aiMatchResult.reasons.join(', ')}`);

          return {
            ...job.toObject(),
            matchScore: combinedScore,
            matchReasons: combinedReasons,
            algorithmicScore,
            aiScore: aiMatchResult.score,
            skillsMatch: extractSkillsMatchRich(job, derived),
            experienceMatch: extractExperienceMatchRich(job, derived),
            educationMatch: extractEducationMatchRich(job, derived),
            eligibilityMatch: extractEligibilityMatch(job, derived)
          };
        })
      );

      // Filter by minimum match score and sort by match score
      const filteredRecommendations = recommendations
        .filter(rec => rec.matchScore >= parseInt(minMatchScore))
        .sort((a, b) => b.matchScore - a.matchScore);

      res.json({
        recommendations: filteredRecommendations,
        total: filteredRecommendations.length,
        userProfile: {
          hasPds: !!pds,
          hasResume: !!resume,
          hasDocuments: user.documents && user.documents.length > 0,
          profileCompleteness: calculateProfileCompletenessFromDerived(derived)
        },
        matchingMethod: 'hybrid', // Indicates both algorithmic and AI matching
        aiEnabled: true
      });
    } catch (error) {
      console.error('Error fetching job recommendations:', error);
      res.status(500).json({
        message: 'Error fetching job recommendations',
        error: error.message
      });
    }
  }
);

// Get featured jobs (public) - MUST be before /:id route
router.get('/featured/list', async (req, res) => {
  try {
    const jobs = await Job.find({
      status: 'active',
      isFeatured: true,
      expiryDate: { $gt: new Date() }
    })
      .sort('-postedDate')
      .limit(6)
      .populate('companyId', 'name logo isGovernment')
      .populate('categoryId', 'name');

    res.json(jobs);
  } catch (error) {
    res
      .status(500)
      .json({ message: 'Error fetching featured jobs', error: error.message });
  }
});

// Get government jobs (public) - MUST be before /:id route
router.get('/government/list', async (req, res) => {
  try {
    const governmentCompanies = await Company.find({
      isGovernment: true
    }).select('_id');
    const companyIds = governmentCompanies.map(company => company._id);

    const jobs = await Job.find({
      companyId: { $in: companyIds },
      status: 'active',
      expiryDate: { $gt: new Date() }
    })
      .sort('-postedDate')
      .limit(4)
      .populate('companyId', 'name logo isGovernment')
      .populate('categoryId', 'name');

    res.json(jobs);
  } catch (error) {
    res.status(500).json({
      message: 'Error fetching government jobs',
      error: error.message
    });
  }
});

// Get saved jobs for applicant (authenticated) - MUST be before /:id route
router.get('/saved', [auth, authorize('applicant')], async (req, res) => {
  try {
    const User = require('../models/user.model');
    const user = await User.findById(req.user._id).populate('savedJobs');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const savedJobs = await Job.find({
      _id: { $in: user.savedJobs },
      status: 'active'
    })
      .populate('companyId', 'name logo isGovernment')
      .populate('categoryId', 'name');

    res.json({ savedJobs });
  } catch (error) {
    res.status(500).json({
      message: 'Error fetching saved jobs',
      error: error.message
    });
  }
});

// Get job by ID (public) - MUST be last among GET routes
router.get('/:id', async (req, res) => {
  try {
    const job = await Job.findById(req.params.id)
      .populate(
        'companyId',
        'name logo description industry website isGovernment'
      )
      .populate('categoryId', 'name');

    if (!job) {
      return res.status(404).json({ message: 'Job not found' });
    }

    // Increment view count
    job.viewCount += 1;
    await job.save();

    res.json(job);
  } catch (error) {
    res
      .status(500)
      .json({ message: 'Error fetching job', error: error.message });
  }
});

// Create new job (employer/admin only)
router.post(
  '/',
  [
    auth,
    authorize('employer', 'admin'),
    body('title').notEmpty(),
    body('companyId').isMongoId(),
    body('categoryId').isMongoId(),
    body('location').notEmpty(),
    body('employmentType').isIn([
      'Full-time',
      'Part-time',
      'Contract',
      'Temporary',
      'Internship'
    ]),
    validate
  ],
  async (req, res) => {
    try {
      const jobData = {
        ...req.body,
        createdBy: req.user._id
      };

      const job = new Job(jobData);
      await job.save();

      res.status(201).json(job);
    } catch (error) {
      res
        .status(500)
        .json({ message: 'Error creating job', error: error.message });
    }
  }
);

// Update job (employer/admin only)
router.put(
  '/:id',
  [auth, authorize('employer', 'admin'), validate],
  async (req, res) => {
    try {
      const job = await Job.findById(req.params.id);

      if (!job) {
        return res.status(404).json({ message: 'Job not found' });
      }

      // Check if user has permission to update this job
      if (req.user.role === 'employer') {
        const company = await Company.findOne({ adminId: req.user._id });
        if (!company || job.companyId.toString() !== company._id.toString()) {
          return res
            .status(403)
            .json({ message: 'Not authorized to update this job' });
        }
      }

      Object.assign(job, req.body);
      await job.save();

      res.json(job);
    } catch (error) {
      res
        .status(500)
        .json({ message: 'Error updating job', error: error.message });
    }
  }
);

// Update job status (admin only)
router.patch(
  '/:id/status',
  [auth, authorize('admin')],
  async (req, res) => {
    try {
      const { status } = req.body;
      
      // Validate status
      const validStatuses = ['draft', 'active', 'paused', 'closed', 'archived'];
      if (!status || !validStatuses.includes(status)) {
        return res.status(400).json({ 
          message: 'Invalid status. Must be one of: draft, active, paused, closed, archived' 
        });
      }

      const job = await Job.findById(req.params.id);

      if (!job) {
        return res.status(404).json({ message: 'Job not found' });
      }

      job.status = status;
      await job.save();

      res.json({ 
        message: 'Job status updated successfully',
        job 
      });
    } catch (error) {
      res
        .status(500)
        .json({ message: 'Error updating job status', error: error.message });
    }
  }
);

// Delete job (employer/admin only)
router.delete(
  '/:id',
  [auth, authorize('employer', 'admin')],
  async (req, res) => {
    try {
      const job = await Job.findById(req.params.id);

      if (!job) {
        return res.status(404).json({ message: 'Job not found' });
      }

      // Check if user has permission to delete this job
      if (req.user.role === 'employer') {
        const company = await Company.findOne({ adminId: req.user._id });
        if (!company || job.companyId.toString() !== company._id.toString()) {
          return res
            .status(403)
            .json({ message: 'Not authorized to delete this job' });
        }
      }

      await Job.findByIdAndDelete(req.params.id);
      res.json({ message: 'Job deleted successfully' });
    } catch (error) {
      res
        .status(500)
        .json({ message: 'Error deleting job', error: error.message });
    }
  }
);

// Save job for applicant (authenticated)
router.post('/:id/save', [auth, authorize('applicant')], async (req, res) => {
  try {
    const User = require('../models/user.model');
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const jobId = req.params.id;
    const job = await Job.findById(jobId);

    if (!job) {
      return res.status(404).json({ message: 'Job not found' });
    }

    // Add job to saved jobs if not already saved
    if (!user.savedJobs.includes(jobId)) {
      user.savedJobs.push(jobId);
      await user.save();
    }

    res.json({ message: 'Job saved successfully' });
  } catch (error) {
    res.status(500).json({
      message: 'Error saving job',
      error: error.message
    });
  }
});

// Unsave job for applicant (authenticated)
router.delete('/:id/save', [auth, authorize('applicant')], async (req, res) => {
  try {
    const User = require('../models/user.model');
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const jobId = req.params.id;

    // Remove job from saved jobs
    user.savedJobs = user.savedJobs.filter(id => id.toString() !== jobId);
    await user.save();

    res.json({ message: 'Job unsaved successfully' });
  } catch (error) {
    res.status(500).json({
      message: 'Error unsaving job',
      error: error.message
    });
  }
});

// Helper function to build applicant profile from PDS + Resume
function buildApplicantProfileFromPdsAndResume({ user, pds, resume }) {
  const p = pds?.data || {};
  const r = resume?.resumeData || {};

  // Extract skills from multiple sources
  const pdsSkills =
    (p.skills && Array.isArray(p.skills) ? p.skills : []) ||
    (p.personalInformation?.skills ? p.personalInformation.skills : []);
  const resumeCore = Array.isArray(r.coreCompetencies)
    ? r.coreCompetencies
    : [];
  const resumeTech = r.technicalSkills
    ? Object.values(r.technicalSkills).flat().filter(Boolean)
    : [];

  const skills = [...new Set([...pdsSkills, ...resumeCore, ...resumeTech])].map(
    s => String(s).toLowerCase()
  );

  // Extract education (prefer resume, fallback to PDS)
  const education =
    Array.isArray(r.education) && r.education.length
      ? r.education
      : Array.isArray(p.education)
      ? p.education
      : [];

  // Extract work experience (prefer resume, fallback to PDS)
  const workExperience =
    Array.isArray(r.workExperience) && r.workExperience.length
      ? r.workExperience
      : Array.isArray(p.workExperience)
      ? p.workExperience
      : [];

  // Calculate total years of experience
  const totalYears = estimateYearsFromExperience(workExperience);

  // Extract location (prefer resume, fallback to PDS, then user)
  const location =
    r.personalInfo?.address ||
    p.personalInformation?.address ||
    user.location ||
    '';

  const employmentPreference = user.preferences?.employmentType || null;
  const atsKeywords = r.atsOptimization?.industryKeywords || [];

  return {
    skills,
    education,
    workExperience,
    totalYears,
    location,
    employmentPreference,
    atsKeywords
  };
}

// Helper function to estimate years from work experience
function estimateYearsFromExperience(workExperience) {
  try {
    return workExperience.reduce((sum, w) => {
      const start = parseDateMMYYYY(w.startDate);
      const end =
        w.endDate && w.endDate.toLowerCase() !== 'present'
          ? parseDateMMYYYY(w.endDate)
          : new Date();
      if (!start) return sum;
      const years = Math.max(0, (end - start) / (1000 * 60 * 60 * 24 * 365));
      return sum + years;
    }, 0).toFixed
      ? Number(
          workExperience
            .reduce((sum, w) => {
              const start = parseDateMMYYYY(w.startDate);
              const end =
                w.endDate && w.endDate.toLowerCase() !== 'present'
                  ? parseDateMMYYYY(w.endDate)
                  : new Date();
              if (!start) return sum;
              const years = Math.max(
                0,
                (end - start) / (1000 * 60 * 60 * 24 * 365)
              );
              return sum + years;
            }, 0)
            .toFixed(1)
        )
      : 0;
  } catch {
    return 0;
  }
}

// Helper function to parse MM/YYYY date format
function parseDateMMYYYY(s) {
  if (!s) return null;
  const [mm, yyyy] = String(s)
    .split('/')
    .map(x => parseInt(x, 10));
  if (!mm || !yyyy) return null;
  return new Date(yyyy, mm - 1, 1);
}

// Helper function to calculate rich match score using PDS + Resume data
function calculateRichMatchScore(job, applicant) {
  let score = 0;

  // Education match (25% weight) - using educationLevel field
  if (job.educationLevel && applicant.education?.length) {
    const jobEduLevel = job.educationLevel.toLowerCase();
    const hasMatch = applicant.education.some(e => {
      const degree = (e.degree || '').toLowerCase();
      // Match based on education level
      if (jobEduLevel === 'high school' && degree.includes('high school'))
        return true;
      if (
        jobEduLevel === 'associate' &&
        (degree.includes('associate') || degree.includes('diploma'))
      )
        return true;
      if (
        jobEduLevel === 'bachelor' &&
        (degree.includes('bachelor') ||
          degree.includes('bs') ||
          degree.includes('ba'))
      )
        return true;
      if (
        jobEduLevel === 'master' &&
        (degree.includes('master') ||
          degree.includes('ms') ||
          degree.includes('ma'))
      )
        return true;
      if (
        jobEduLevel === 'doctorate' &&
        (degree.includes('phd') || degree.includes('doctor'))
      )
        return true;
      return false;
    });
    if (hasMatch) score += 25;
  }

  // Experience match (25% weight) - using experienceYearsMin/Max fields
  if (job.experienceYearsMin !== undefined) {
    const reqYears = job.experienceYearsMin || 0;
    if (applicant.totalYears >= reqYears) {
      score += 25;
    } else if (applicant.totalYears > 0) {
      score += Math.min(25, (applicant.totalYears / reqYears) * 25);
    }
  }

  // Skills match (35% weight) - using skills array field
  if (job.skills?.length && applicant.skills?.length) {
    const required = job.skills.map(s => s.toLowerCase());
    const userSkills = new Set(applicant.skills);
    const matched = required.filter(
      s =>
        userSkills.has(s) ||
        [...userSkills].some(u => u.includes(s) || s.includes(u))
    );
    score += Math.min(35, (matched.length / required.length) * 35);
  }

  // ATS keyword boost (10% weight) - search in description and requirements
  if (applicant.atsKeywords?.length && (job.description || job.requirements)) {
    const jobText = `${job.description || ''} ${
      job.requirements || ''
    }`.toLowerCase();
    const matchedKw = applicant.atsKeywords.filter(k =>
      jobText.includes(String(k).toLowerCase())
    );
    score += Math.min(10, matchedKw.length); // 1pt per keyword up to 10
  }

  // Location match (3% weight)
  if (job.location && applicant.location) {
    const jl = job.location.toLowerCase();
    const al = String(applicant.location).toLowerCase();
    // Extract city names for better matching
    const jobCity = jl.split(',')[0].trim();
    const userCity = al.split(',')[0].trim();
    if (
      jl.includes(userCity) ||
      al.includes(jobCity) ||
      jl.includes(al) ||
      al.includes(jl)
    ) {
      score += 3;
    }
  }

  // Employment type preference (2% weight)
  if (
    applicant.employmentPreference &&
    job.employmentType === applicant.employmentPreference
  ) {
    score += 2;
  }

  return Math.round(score);
}

// Helper function to generate rich match reasons
function generateRichMatchReasons(job, applicant) {
  const reasons = [];

  if (job.educationLevel && applicant.education?.length) {
    const jobEduLevel = job.educationLevel.toLowerCase();
    const matches = applicant.education.filter(e => {
      const degree = (e.degree || '').toLowerCase();
      if (jobEduLevel === 'high school' && degree.includes('high school'))
        return true;
      if (
        jobEduLevel === 'associate' &&
        (degree.includes('associate') || degree.includes('diploma'))
      )
        return true;
      if (
        jobEduLevel === 'bachelor' &&
        (degree.includes('bachelor') ||
          degree.includes('bs') ||
          degree.includes('ba'))
      )
        return true;
      if (
        jobEduLevel === 'master' &&
        (degree.includes('master') ||
          degree.includes('ms') ||
          degree.includes('ma'))
      )
        return true;
      if (
        jobEduLevel === 'doctorate' &&
        (degree.includes('phd') || degree.includes('doctor'))
      )
        return true;
      return false;
    });
    if (matches.length) {
      reasons.push(`Education match: ${matches[0].degree}`);
    }
  }

  if (job.experienceYearsMin !== undefined) {
    const reqYears = job.experienceYearsMin || 0;
    if (applicant.totalYears >= reqYears) {
      reasons.push(
        `${
          applicant.totalYears.toFixed
            ? applicant.totalYears.toFixed(1)
            : applicant.totalYears
        }+ yrs experience meets requirement`
      );
    }
  }

  if (job.skills?.length && applicant.skills?.length) {
    const required = job.skills.map(s => s.toLowerCase());
    const userSkills = new Set(applicant.skills);
    const matched = required.filter(
      s =>
        userSkills.has(s) ||
        [...userSkills].some(u => u.includes(s) || s.includes(u))
    );
    if (matched.length) {
      reasons.push(`Skills match: ${matched.slice(0, 5).join(', ')}`);
    }
  }

  return reasons;
}

// Helper function to extract skills match (rich version)
function extractSkillsMatchRich(job, applicant) {
  if (!job.skills?.length || !applicant.skills?.length) {
    return [];
  }
  const userSkills = new Set(applicant.skills);
  return job.skills.filter(
    s =>
      userSkills.has(s.toLowerCase()) ||
      [...userSkills].some(
        u => u.includes(s.toLowerCase()) || s.toLowerCase().includes(u)
      )
  );
}

// Helper function to extract experience match (rich version)
function extractExperienceMatchRich(job, applicant) {
  if (job.experienceYearsMin === undefined) return [];
  const reqYears = job.experienceYearsMin || 0;
  return applicant.totalYears >= reqYears
    ? [`${applicant.totalYears}+ years experience`]
    : [];
}

// Helper function to extract education match (rich version)
function extractEducationMatchRich(job, applicant) {
  if (!job.educationLevel || !applicant.education?.length) {
    return [];
  }
  const jobEduLevel = job.educationLevel.toLowerCase();
  return applicant.education
    .filter(e => {
      const degree = (e.degree || '').toLowerCase();
      if (jobEduLevel === 'high school' && degree.includes('high school'))
        return true;
      if (
        jobEduLevel === 'associate' &&
        (degree.includes('associate') || degree.includes('diploma'))
      )
        return true;
      if (
        jobEduLevel === 'bachelor' &&
        (degree.includes('bachelor') ||
          degree.includes('bs') ||
          degree.includes('ba'))
      )
        return true;
      if (
        jobEduLevel === 'master' &&
        (degree.includes('master') ||
          degree.includes('ms') ||
          degree.includes('ma'))
      )
        return true;
      if (
        jobEduLevel === 'doctorate' &&
        (degree.includes('phd') || degree.includes('doctor'))
      )
        return true;
      return false;
    })
    .map(e => e.degree);
}

// Helper function to calculate profile completeness from derived data
function calculateProfileCompletenessFromDerived(applicant) {
  const fields = ['skills', 'education', 'workExperience', 'location'];
  const present = fields.filter(f => {
    const v = applicant[f];
    return Array.isArray(v) ? v.length > 0 : !!v;
  }).length;
  return Math.round((present / fields.length) * 100);
}

// Helper function to calculate match score (legacy - keeping for backward compatibility)
function calculateMatchScore(job, user) {
  let score = 0;
  let factors = 0;

  // Education match (30% weight)
  if (job.requirements && job.requirements.education) {
    factors += 1;
    if (
      user.education &&
      user.education.some(
        edu =>
          edu.degree &&
          edu.degree
            .toLowerCase()
            .includes(job.requirements.education.toLowerCase())
      )
    ) {
      score += 30;
    }
  }

  // Experience match (25% weight)
  if (job.requirements && job.requirements.experience) {
    factors += 1;
    const requiredExp = parseInt(job.requirements.experience) || 0;
    const userExp = user.experience ? user.experience.length : 0;
    if (userExp >= requiredExp) {
      score += 25;
    } else if (userExp > 0) {
      score += (userExp / requiredExp) * 25;
    }
  }

  // Skills match (25% weight)
  if (job.requirements && job.requirements.skills) {
    factors += 1;
    const requiredSkills = job.requirements.skills.map(s => s.toLowerCase());
    const userSkills = user.skills ? user.skills.map(s => s.toLowerCase()) : [];
    const matchedSkills = requiredSkills.filter(skill =>
      userSkills.some(
        userSkill => userSkill.includes(skill) || skill.includes(userSkill)
      )
    );
    score += (matchedSkills.length / requiredSkills.length) * 25;
  }

  // Location match (10% weight)
  if (job.location && user.location) {
    factors += 1;
    if (
      job.location.toLowerCase().includes(user.location.toLowerCase()) ||
      user.location.toLowerCase().includes(job.location.toLowerCase())
    ) {
      score += 10;
    }
  }

  // Employment type preference (10% weight)
  if (
    job.employmentType &&
    user.preferences &&
    user.preferences.employmentType
  ) {
    factors += 1;
    if (job.employmentType === user.preferences.employmentType) {
      score += 10;
    }
  }

  return Math.round(score);
}

// Helper function to generate match reasons
function generateMatchReasons(job, user) {
  const reasons = [];

  if (job.requirements && job.requirements.education && user.education) {
    const hasEducationMatch = user.education.some(
      edu =>
        edu.degree &&
        edu.degree
          .toLowerCase()
          .includes(job.requirements.education.toLowerCase())
    );
    if (hasEducationMatch) {
      reasons.push(`Education background matches requirement`);
    }
  }

  if (job.requirements && job.requirements.experience) {
    const userExp = user.experience ? user.experience.length : 0;
    const requiredExp = parseInt(job.requirements.experience) || 0;
    if (userExp >= requiredExp) {
      reasons.push(`${userExp}+ years experience meets requirement`);
    }
  }

  if (job.requirements && job.requirements.skills && user.skills) {
    const requiredSkills = job.requirements.skills;
    const matchedSkills = requiredSkills.filter(skill =>
      user.skills.some(userSkill =>
        userSkill.toLowerCase().includes(skill.toLowerCase())
      )
    );
    if (matchedSkills.length > 0) {
      reasons.push(`Skills match: ${matchedSkills.slice(0, 3).join(', ')}`);
    }
  }

  return reasons;
}

// Helper function to extract skills match
function extractSkillsMatch(job, user) {
  if (!job.requirements || !job.requirements.skills || !user.skills) {
    return [];
  }

  return job.requirements.skills.filter(skill =>
    user.skills.some(userSkill =>
      userSkill.toLowerCase().includes(skill.toLowerCase())
    )
  );
}

// Helper function to extract experience match
function extractExperienceMatch(job, user) {
  if (!job.requirements || !job.requirements.experience) {
    return [];
  }

  const userExp = user.experience ? user.experience.length : 0;
  const requiredExp = parseInt(job.requirements.experience) || 0;

  if (userExp >= requiredExp) {
    return [`${userExp}+ years experience`];
  }

  return [];
}

// Helper function to extract education match
function extractEducationMatch(job, user) {
  if (!job.requirements || !job.requirements.education || !user.education) {
    return [];
  }

  return user.education
    .filter(
      edu =>
        edu.degree &&
        edu.degree
          .toLowerCase()
          .includes(job.requirements.education.toLowerCase())
    )
    .map(edu => edu.degree);
}

// Helper function to extract eligibility match
function extractEligibilityMatch(job, user) {
  if (!job.requirements || !job.requirements.eligibility || !user.eligibility) {
    return [];
  }

  return job.requirements.eligibility.filter(elig =>
    user.eligibility.some(userElig =>
      userElig.toLowerCase().includes(elig.toLowerCase())
    )
  );
}

// Helper function to calculate profile completeness
function calculateProfileCompleteness(user) {
  let completeness = 0;
  let totalFields = 0;

  const fields = [
    'firstName',
    'lastName',
    'email',
    'phone',
    'location',
    'education',
    'experience',
    'skills',
    'summary'
  ];

  fields.forEach(field => {
    totalFields++;
    if (
      user[field] &&
      (Array.isArray(user[field]) ? user[field].length > 0 : user[field])
    ) {
      completeness++;
    }
  });

  return Math.round((completeness / totalFields) * 100);
}

// Helper function to calculate AI-powered match score using Gemini
async function calculateAIMatchScore(job, applicant) {
  try {
    // Initialize Gemini AI
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    // Using gemini-1.5-flash for better rate limits
    const model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-lite-preview' });

    // Prepare candidate profile data
    const candidateProfile = {
      skills: applicant.skills || [],
      education: applicant.education || [],
      workExperience: applicant.workExperience || [],
      totalYearsExperience: applicant.totalYears || 0,
      location: applicant.location || '',
      atsKeywords: applicant.atsKeywords || []
    };

    // Prepare job data
    const jobData = {
      title: job.title,
      description: job.description || '',
      responsibilities: job.responsibilities || '',
      requirements: job.requirements || '',
      skills: job.skills || [],
      educationLevel: job.educationLevel || '',
      experienceYearsMin: job.experienceYearsMin || 0,
      experienceYearsMax: job.experienceYearsMax || 0,
      location: job.location || '',
      employmentType: job.employmentType || '',
      salaryMin: job.salaryMin || 0,
      salaryMax: job.salaryMax || 0,
      department: job.department || ''
    };

    const prompt = `You are an AI-powered ATS (Applicant Tracking System) and Job Matching Assistant.  
Your task is to evaluate a candidate profile against a job posting and generate ATS-style match results in JSON format.  
Focus on ATS logic: skills, experience, education, and location.  

---

## Candidate Profile (JSON)
${JSON.stringify(candidateProfile, null, 2)}

---

## Job Listing (JSON)
${JSON.stringify(jobData, null, 2)}

---

## Instructions
1. Compare the **Candidate Profile** against the **Job Listing**.  
2. Score the job on a scale of 0–100 using this formula:  

**Scoring Formula:**
- **Skills Match (40%)**: How well do the candidate's skills align with job requirements?
- **Experience Match (25%)**: Does the candidate's experience meet/exceed requirements?
- **Education Match (20%)**: Does the candidate's education level match job requirements?
- **Location Compatibility (10%)**: Is the candidate's location compatible with job location?
- **ATS Keywords (5%)**: How many relevant keywords from the candidate's ATS profile match the job?

3. Generate 3-5 specific match reasons explaining why this job is a good fit.
4. Identify any potential concerns or gaps.

**Return ONLY a valid JSON object with this exact structure:**
{
  "score": 85,
  "reasons": [
    "Strong technical skills match in web development and programming languages",
    "24+ years of experience exceeds the 2+ year requirement",
    "Bachelor's degree matches the education requirement",
    "Location compatibility for Metro Manila area"
  ],
  "concerns": [
    "May be overqualified for this mid-level position"
  ],
  "strengths": [
    "Extensive experience in software development",
    "Strong technical skill set",
    "Relevant education background"
  ]
}`;

    const text = await rateLimiter.executeWithRetry(
      async () => {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text();
      },
      'Job matching analysis'
    );

    console.log('Raw Gemini response:', text);

    // Parse the JSON response with robust error handling
    let matchResult;
    try {
      // Clean the response text to extract JSON (same approach as document routes)
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        matchResult = JSON.parse(jsonMatch[0]);
      } else {
        matchResult = JSON.parse(text);
      }
    } catch (parseError) {
      console.error('Error parsing Gemini JSON response:', parseError);
      console.log('Raw response that failed to parse:', text);

      // Fallback: try to extract score from text if JSON parsing fails
      const scoreMatch = text.match(/"score":\s*(\d+)/);
      const reasonsMatch = text.match(/"reasons":\s*\[(.*?)\]/s);

      matchResult = {
        score: scoreMatch ? parseInt(scoreMatch[1]) : 50,
        reasons: reasonsMatch
          ? reasonsMatch[1].split(',').map(r => r.trim().replace(/"/g, ''))
          : ['AI analysis completed'],
        concerns: [],
        strengths: []
      };
    }

    return {
      score: matchResult.score || 0,
      reasons: matchResult.reasons || [],
      concerns: matchResult.concerns || [],
      strengths: matchResult.strengths || []
    };
  } catch (error) {
    console.error('Error in AI matching:', error);
    // Fallback to basic scoring if AI fails
    return {
      score: 50, // Neutral score
      reasons: ['AI analysis unavailable'],
      concerns: [],
      strengths: []
    };
  }
}

module.exports = router;
