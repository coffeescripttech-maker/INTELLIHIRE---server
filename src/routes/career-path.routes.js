const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { auth, authorize } = require('../middleware/auth.middleware');
const CareerPath = require('../models/career-path.model');
const CareerGoal = require('../models/career-goal.model');
const User = require('../models/user.model');
const PdsExtractedData = require('../models/pdsExtractedData.model');
const Resume = require('../models/resume.model');
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

// Get all career paths with AI-powered recommendations (authenticated)
router.get('/', [auth, authorize('applicant')], async (req, res) => {
  try {
    // Set timeout for the entire request
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Request timeout')), 30000); // 30 seconds
    });

    const mainPromise = (async () => {
      const {
        category,
        level,
        difficulty,
        limit = 3,
        page = 1,
        aiEnabled = true
      } = req.query;

      // Get user's rich profile data (PDS + Resume)
      const user = await User.findById(req.user._id);
      const pds = await PdsExtractedData.findOne({ userId: req.user._id }).sort(
        {
          createdAt: -1
        }
      );
      const resume = await Resume.findOne({ userId: req.user._id }).sort({
        createdAt: -1
      });

      // Build derived applicant profile
      const derived = buildApplicantProfileFromPdsAndResume({
        user,
        pds,
        resume
      });

      // Generate career paths using AI instead of fetching from database
      let careerPaths = [];
      if (aiEnabled === 'true' || aiEnabled === true) {
        careerPaths = await generateCareerPathsWithAI(derived, {
          category,
          level,
          difficulty,
          limit: parseInt(limit)
        });
      } else {
        // Fallback to basic career paths if AI is disabled
        careerPaths = getBasicCareerPaths();
      }

      // Calculate match scores and add user progress
      // const pathsWithProgress = await Promise.all(
      //   careerPaths.map(async path => {
      //     // Algorithmic matching
      //     const algorithmicScore = calculateCareerMatchScore(path, derived);
      //     const userProgress = getUserProgress(path, derived);

      //     let aiInsights = null;
      //     if (aiEnabled === 'true' || aiEnabled === true) {
      //       // AI-powered career analysis
      //       aiInsights = await generateAICareerInsights(path, derived);
      //     }

      //     return {
      //       ...path,
      //       matchScore: aiInsights
      //         ? Math.round(algorithmicScore * 0.6 + aiInsights.score * 0.4)
      //         : algorithmicScore,
      //       algorithmicScore,
      //       aiScore: aiInsights?.score,
      //       aiInsights,
      //       userProgress,
      //       isRecommended: algorithmicScore >= 70 || aiInsights?.score >= 70
      //     };
      //   })
      // );

      // Add basic match scores to career paths for sorting
      const pathsWithScores = careerPaths.map(path => ({
        ...path,
        matchScore: calculateCareerMatchScore(path, derived),
        algorithmicScore: calculateCareerMatchScore(path, derived),
        aiScore: null,
        aiInsights: null,
        userProgress: 0,
        isRecommended: calculateCareerMatchScore(path, derived) >= 70
      }));

      // Sort by match score
      const sortedPaths = pathsWithScores.sort(
        (a, b) => b.matchScore - a.matchScore
      );

      res.json({
        careerPaths: sortedPaths,
        totalPages: Math.ceil(sortedPaths.length / limit),
        currentPage: parseInt(page),
        total: sortedPaths.length,
        userProfile: {
          hasPds: !!pds,
          hasResume: !!resume,
          profileCompleteness: calculateProfileCompletenessFromDerived(derived),
          currentSkills: derived.skills?.slice(0, 10) || [],
          totalExperience: derived.totalYears || 0
        },
        aiEnabled: aiEnabled === 'true' || aiEnabled === true
      });
    })();

    // Race between main promise and timeout
    await Promise.race([mainPromise, timeoutPromise]);
  } catch (error) {
    console.error('Error fetching career paths:', error);
    res.status(500).json({
      message: 'Error fetching career paths',
      error: error.message
    });
  }
});

// Get career goals (authenticated) - MUST be before /:id route
router.get('/goals', [auth, authorize('applicant')], async (req, res) => {
  try {
    const goals = await CareerGoal.find({ userId: req.user._id }).sort({
      createdAt: -1
    });

    res.json({ goals });
  } catch (error) {
    res.status(500).json({
      message: 'Error fetching career goals',
      error: error.message
    });
  }
});

// Get career insights (authenticated) - MUST be before /:id route
router.get('/insights', [auth, authorize('applicant')], async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Generate personalized insights based on user profile
    const insights = generateCareerInsights(user);

    res.json({ insights });
  } catch (error) {
    res.status(500).json({
      message: 'Error fetching career insights',
      error: error.message
    });
  }
});

// Get user's overall career progress (authenticated) - MUST be before /:id route
router.get('/progress', [auth, authorize('applicant')], async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Calculate overall progress
    const activeCareerPaths = await CareerPath.find({
      _id: { $in: user.activeCareerPaths || [] }
    });

    const totalMilestones = activeCareerPaths.reduce(
      (total, path) => total + path.milestones.length,
      0
    );

    const completedMilestones = user.completedMilestones
      ? user.completedMilestones.length
      : 0;
    const overallProgress =
      totalMilestones > 0
        ? Math.round((completedMilestones / totalMilestones) * 100)
        : 0;

    res.json({
      overallProgress,
      activeCareerPaths: activeCareerPaths.length,
      totalMilestones,
      completedMilestones
    });
  } catch (error) {
    res.status(500).json({
      message: 'Error fetching career progress',
      error: error.message
    });
  }
});

// Get career path by ID (authenticated) - MUST be last among GET routes
router.get('/:id', [auth, authorize('applicant')], async (req, res) => {
  try {
    const careerPath = await CareerPath.findById(req.params.id);

    if (!careerPath) {
      return res.status(404).json({ message: 'Career path not found' });
    }

    // Get user's progress for this career path
    const user = await User.findById(req.user._id);
    const userProgress = getUserProgress(careerPath, user);
    const matchScore = calculateMatchScore(careerPath, user);

    res.json({
      ...careerPath.toObject(),
      userProgress,
      matchScore,
      isRecommended: matchScore >= 80
    });
  } catch (error) {
    res.status(500).json({
      message: 'Error fetching career path',
      error: error.message
    });
  }
});

// Start a career path (authenticated)
router.post('/:id/start', [auth, authorize('applicant')], async (req, res) => {
  try {
    const careerPath = await CareerPath.findById(req.params.id);

    if (!careerPath) {
      return res.status(404).json({ message: 'Career path not found' });
    }

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if user already started this career path
    if (
      user.activeCareerPaths &&
      user.activeCareerPaths.includes(careerPath._id)
    ) {
      return res.status(400).json({ message: 'Career path already started' });
    }

    // Add career path to user's active paths
    if (!user.activeCareerPaths) {
      user.activeCareerPaths = [];
    }
    user.activeCareerPaths.push(careerPath._id);
    await user.save();

    res.json({
      message: 'Career path started successfully',
      careerPath: careerPath.title,
      userProgress: getUserProgress(careerPath, user)
    });
  } catch (error) {
    res.status(500).json({
      message: 'Error starting career path',
      error: error.message
    });
  }
});

// Complete a milestone (authenticated)
router.post(
  '/milestones/:milestoneId/complete',
  [auth, authorize('applicant')],
  async (req, res) => {
    try {
      const user = await User.findById(req.user._id);

      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      // Find the milestone in user's completed milestones
      if (!user.completedMilestones) {
        user.completedMilestones = [];
      }

      // Check if milestone already completed
      if (user.completedMilestones.includes(req.params.milestoneId)) {
        return res.status(400).json({ message: 'Milestone already completed' });
      }

      // Add milestone to completed list
      user.completedMilestones.push(req.params.milestoneId);
      await user.save();

      res.json({
        message: 'Milestone completed successfully',
        milestoneId: req.params.milestoneId
      });
    } catch (error) {
      res.status(500).json({
        message: 'Error completing milestone',
        error: error.message
      });
    }
  }
);

// Create a new career goal (authenticated)
router.post(
  '/goals',
  [
    auth,
    authorize('applicant'),
    body('title').notEmpty().withMessage('Title is required'),
    body('description').notEmpty().withMessage('Description is required'),
    body('targetDate').isISO8601().withMessage('Valid target date is required'),
    validate
  ],
  async (req, res) => {
    try {
      const goalData = {
        ...req.body,
        userId: req.user._id,
        status: 'Planning',
        progress: 0
      };

      const goal = new CareerGoal(goalData);
      await goal.save();

      res.status(201).json(goal);
    } catch (error) {
      res.status(500).json({
        message: 'Error creating career goal',
        error: error.message
      });
    }
  }
);

// Update a career goal (authenticated)
router.put(
  '/goals/:id',
  [auth, authorize('applicant'), validate],
  async (req, res) => {
    try {
      const goal = await CareerGoal.findOne({
        _id: req.params.id,
        userId: req.user._id
      });

      if (!goal) {
        return res.status(404).json({ message: 'Career goal not found' });
      }

      Object.assign(goal, req.body);
      await goal.save();

      res.json(goal);
    } catch (error) {
      res.status(500).json({
        message: 'Error updating career goal',
        error: error.message
      });
    }
  }
);

// Delete a career goal (authenticated)
router.delete(
  '/goals/:id',
  [auth, authorize('applicant')],
  async (req, res) => {
    try {
      const goal = await CareerGoal.findOneAndDelete({
        _id: req.params.id,
        userId: req.user._id
      });

      if (!goal) {
        return res.status(404).json({ message: 'Career goal not found' });
      }

      res.json({ message: 'Career goal deleted successfully' });
    } catch (error) {
      res.status(500).json({
        message: 'Error deleting career goal',
        error: error.message
      });
    }
  }
);

// AI-powered career path generation using Gemini
async function generateCareerPathsWithAI(applicant, options = {}) {
  try {
    // Initialize Gemini AI
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
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

    const prompt = `Generate ${
      options.limit || 3
    } personalized career paths for this candidate.

## Candidate Profile
Skills: ${candidateProfile.skills.slice(0, 10).join(', ')}
Experience: ${candidateProfile.totalYearsExperience} years
Education: ${candidateProfile.education.map(e => e.degree).join(', ')}

**Return ONLY a JSON array:**
[
  {
    "_id": "generated_1",
    "title": "Senior Software Developer",
    "description": "Lead development of complex software applications.",
    "category": "Technology",
    "level": "Senior",
    "difficulty": "Medium",
    "prerequisites": ["Bachelor's degree", "5+ years experience"],
    "skills": ["JavaScript", "Python", "React", "Node.js"],
    "certifications": ["AWS Certified"],
    "averageSalary": {
      "entry": 80000,
      "mid": 120000,
      "senior": 150000,
      "executive": 200000
    },
    "jobMarketDemand": "Very High",
    "growthPotential": "High",
    "relatedJobs": ["Full Stack Developer", "Tech Lead"],
    "milestones": [
      {
        "_id": "m1",
        "title": "Master Core Technologies",
        "description": "Learn primary programming languages",
        "estimatedTime": "3-6 months",
        "difficulty": "Medium"
      }
    ],
    "isActive": true,
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
]`;

    const text = await rateLimiter.executeWithRetry(
      async () => {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text();
      },
      'Career path generation'
    );

    console.log('Raw Gemini career paths response:', text);

    // Parse the JSON response with robust error handling
    let careerPaths;
    try {
      // Clean the response text to extract JSON array
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        careerPaths = JSON.parse(jsonMatch[0]);
      } else {
        careerPaths = JSON.parse(text);
      }
    } catch (parseError) {
      console.error('Error parsing Gemini career paths JSON:', parseError);
      console.log('Raw response that failed to parse:', text);

      // Fallback to basic career paths if parsing fails
      careerPaths = getBasicCareerPaths();
    }

    return careerPaths;
  } catch (error) {
    console.error('Error generating career paths with AI:', error);
    // Fallback to basic career paths if AI fails
    return getBasicCareerPaths();
  }
}

// Fallback basic career paths when AI is not available
function getBasicCareerPaths() {
  return [
    {
      _id: 'basic_1',
      title: 'Software Developer',
      description:
        'Develop and maintain software applications using various programming languages and frameworks.',
      category: 'Technology',
      level: 'Mid',
      difficulty: 'Medium',
      prerequisites: ["Bachelor's degree in Computer Science or related field"],
      skills: ['JavaScript', 'Python', 'React', 'Node.js'],
      certifications: ['AWS Certified Developer'],
      averageSalary: {
        entry: 60000,
        mid: 90000,
        senior: 120000,
        executive: 160000
      },
      jobMarketDemand: 'High',
      growthPotential: 'High',
      relatedJobs: [
        'Full Stack Developer',
        'Frontend Developer',
        'Backend Developer'
      ],
      milestones: [
        {
          _id: 'basic_milestone_1',
          title: 'Learn Core Technologies',
          description: 'Master fundamental programming concepts and languages',
          estimatedTime: '3-6 months',
          difficulty: 'Medium'
        }
      ],
      isActive: true,
      createdAt: new Date().toISOString()
    },
    {
      _id: 'basic_2',
      title: 'Data Analyst',
      description:
        'Analyze data to help organizations make informed business decisions.',
      category: 'Analytics',
      level: 'Entry',
      difficulty: 'Low',
      prerequisites: [
        "Bachelor's degree in Statistics, Mathematics, or related field"
      ],
      skills: ['SQL', 'Python', 'Excel', 'Tableau', 'Statistics'],
      certifications: ['Google Data Analytics Certificate'],
      averageSalary: {
        entry: 50000,
        mid: 70000,
        senior: 95000,
        executive: 130000
      },
      jobMarketDemand: 'High',
      growthPotential: 'Medium',
      relatedJobs: ['Business Analyst', 'Data Scientist', 'Research Analyst'],
      milestones: [
        {
          _id: 'basic_milestone_2',
          title: 'Master Data Analysis Tools',
          description: 'Learn SQL, Excel, and data visualization tools',
          estimatedTime: '2-4 months',
          difficulty: 'Low'
        }
      ],
      isActive: true,
      createdAt: new Date().toISOString()
    }
  ];
}

// Helper function to calculate match score
function calculateMatchScore(careerPath, user) {
  let score = 0;
  let factors = 0;

  // Skills match (40% weight)
  if (careerPath.skills && user.skills) {
    factors += 1;
    const requiredSkills = careerPath.skills.map(s => s.toLowerCase());
    const userSkills = user.skills.map(s => s.toLowerCase());
    const matchedSkills = requiredSkills.filter(skill =>
      userSkills.some(
        userSkill => userSkill.includes(skill) || skill.includes(userSkill)
      )
    );
    score += (matchedSkills.length / requiredSkills.length) * 40;
  }

  // Education match (25% weight)
  if (careerPath.prerequisites && user.education) {
    factors += 1;
    const hasEducationMatch = user.education.some(
      edu =>
        edu.degree &&
        careerPath.prerequisites.some(prereq =>
          prereq.toLowerCase().includes(edu.degree.toLowerCase())
        )
    );
    if (hasEducationMatch) {
      score += 25;
    }
  }

  // Experience match (20% weight)
  if (careerPath.level && user.experience) {
    factors += 1;
    const userExpLevel = user.experience.length;
    const requiredLevel =
      careerPath.level === 'Entry'
        ? 0
        : careerPath.level === 'Mid'
        ? 2
        : careerPath.level === 'Senior'
        ? 5
        : 8;

    if (userExpLevel >= requiredLevel) {
      score += 20;
    } else if (userExpLevel > 0) {
      score += (userExpLevel / requiredLevel) * 20;
    }
  }

  // Interest/preference match (15% weight)
  if (user.preferences && user.preferences.careerInterests) {
    factors += 1;
    const hasInterestMatch = user.preferences.careerInterests.includes(
      careerPath.category
    );
    if (hasInterestMatch) {
      score += 15;
    }
  }

  return Math.round(score);
}

// Helper function to get user progress for a career path
function getUserProgress(careerPath, user) {
  // For AI-generated career paths, return 0 as they're not yet started
  if (
    !careerPath._id ||
    careerPath._id.startsWith('generated_') ||
    careerPath._id.startsWith('basic_')
  ) {
    return 0;
  }

  if (
    !user.activeCareerPaths ||
    !user.activeCareerPaths.includes(careerPath._id)
  ) {
    return 0;
  }

  const totalMilestones = careerPath.milestones.length;
  const completedMilestones = careerPath.milestones.filter(
    milestone =>
      user.completedMilestones &&
      user.completedMilestones.includes(milestone._id.toString())
  ).length;

  return totalMilestones > 0
    ? Math.round((completedMilestones / totalMilestones) * 100)
    : 0;
}

// Helper function to generate career insights
function generateCareerInsights(user) {
  const insights = [];

  // Skill gap analysis
  if (user.skills && user.skills.length < 5) {
    insights.push({
      type: 'skill_gap',
      title: 'Skill Development Opportunity',
      description:
        'Consider expanding your skill set to increase career opportunities.',
      impact: 'High',
      actionable: true,
      recommendation:
        'Focus on learning in-demand skills like cloud computing, AI/ML, or data analysis.'
    });
  }

  // Market trend insights
  insights.push({
    type: 'market_trend',
    title: 'Remote Work Opportunities',
    description:
      'Remote work opportunities have increased significantly in your field.',
    impact: 'Medium',
    actionable: true,
    recommendation:
      'Consider highlighting remote work experience and skills in your profile.'
  });

  // Salary insights
  if (user.experience && user.experience.length >= 3) {
    insights.push({
      type: 'salary_insight',
      title: 'Senior Level Opportunities',
      description:
        'With your experience level, you may be ready for senior positions.',
      impact: 'High',
      actionable: true,
      recommendation:
        'Look for senior-level positions that match your experience and skills.'
    });
  }

  // Growth opportunities
  insights.push({
    type: 'growth_opportunity',
    title: 'Certification Benefits',
    description:
      'Industry certifications can significantly boost your career prospects.',
    impact: 'Medium',
    actionable: true,
    recommendation: 'Consider pursuing relevant certifications in your field.'
  });

  return insights;
}

// Helper function to build applicant profile from PDS + Resume (same as job routes)
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
    return Number(
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
    );
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

// Enhanced career match scoring using derived profile
function calculateCareerMatchScore(careerPath, applicant) {
  let score = 0;

  // Skills match (40% weight)
  if (careerPath.skills?.length && applicant.skills?.length) {
    const required = careerPath.skills.map(s => s.toLowerCase());
    const userSkills = new Set(applicant.skills);
    const matched = required.filter(
      s =>
        userSkills.has(s) ||
        [...userSkills].some(u => u.includes(s) || s.includes(u))
    );
    score += Math.min(40, (matched.length / required.length) * 40);
  }

  // Experience level match (25% weight)
  if (careerPath.level && applicant.totalYears) {
    const levelScores = {
      Entry:
        applicant.totalYears <= 2
          ? 25
          : Math.max(15, 25 - (applicant.totalYears - 2) * 2),
      Mid:
        applicant.totalYears >= 2 && applicant.totalYears <= 5
          ? 25
          : Math.max(10, 25 - Math.abs(applicant.totalYears - 3.5) * 3),
      Senior:
        applicant.totalYears >= 5 && applicant.totalYears <= 10
          ? 25
          : Math.max(10, 25 - Math.abs(applicant.totalYears - 7.5) * 2),
      Executive:
        applicant.totalYears >= 10
          ? 25
          : Math.max(5, (applicant.totalYears / 10) * 25)
    };
    score += levelScores[careerPath.level] || 0;
  }

  // Education match (20% weight)
  if (careerPath.prerequisites?.length && applicant.education?.length) {
    const hasEducationMatch = careerPath.prerequisites.some(req =>
      applicant.education.some(edu =>
        (edu.degree || '').toLowerCase().includes(req.toLowerCase())
      )
    );
    if (hasEducationMatch) score += 20;
  }

  // ATS keywords match (10% weight)
  if (applicant.atsKeywords?.length && careerPath.description) {
    const description = careerPath.description.toLowerCase();
    const matchedKw = applicant.atsKeywords.filter(k =>
      description.includes(String(k).toLowerCase())
    );
    score += Math.min(10, matchedKw.length);
  }

  // Market demand bonus (5% weight)
  const demandBonus = {
    Low: 1,
    Medium: 2,
    High: 4,
    'Very High': 5
  };
  score += demandBonus[careerPath.jobMarketDemand] || 0;

  return Math.round(score);
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

// AI-powered career insights using Gemini
async function generateAICareerInsights(careerPath, applicant) {
  try {
    // Initialize Gemini AI
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
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

    // Prepare career path data
    const careerData = {
      title: careerPath.title,
      description: careerPath.description,
      category: careerPath.category,
      level: careerPath.level,
      difficulty: careerPath.difficulty,
      prerequisites: careerPath.prerequisites || [],
      skills: careerPath.skills || [],
      certifications: careerPath.certifications || [],
      averageSalary: careerPath.averageSalary || {},
      jobMarketDemand: careerPath.jobMarketDemand,
      growthPotential: careerPath.growthPotential,
      relatedJobs: careerPath.relatedJobs || [],
      milestones: careerPath.milestones || []
    };

    const prompt = `Analyze candidate fit for career path: ${careerPath.title}

Candidate: ${candidateProfile.skills.slice(0, 5).join(', ')} | ${
      candidateProfile.totalYearsExperience
    } years exp
Career: ${careerPath.skills.slice(0, 5).join(', ')} | ${careerPath.level} level

**Return ONLY JSON:**
{
  "score": 78,
  "reasons": ["Strong technical skills match", "Experience level aligns"],
  "skillGaps": ["Cloud computing", "DevOps"],
  "learningRecommendations": ["Complete AWS certification", "Learn Kubernetes"],
  "careerProgression": ["Senior Developer", "Tech Lead", "Architect"],
  "strengths": ["Programming experience", "Problem-solving"],
  "concerns": ["May need modern tech updates"],
  "marketInsights": {
    "demand": "Very High",
    "salaryRange": "Competitive",
    "growthTrend": "Positive",
    "remoteOpportunities": "Excellent"
  }
}`;

    const text = await rateLimiter.executeWithRetry(
      async () => {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text();
      },
      'Career insights generation'
    );

    console.log('Raw Gemini career insights response:', text);

    // Parse the JSON response with robust error handling
    let insightsResult;
    try {
      // Clean the response text to extract JSON
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        insightsResult = JSON.parse(jsonMatch[0]);
      } else {
        insightsResult = JSON.parse(text);
      }
    } catch (parseError) {
      console.error('Error parsing Gemini career insights JSON:', parseError);
      console.log('Raw response that failed to parse:', text);

      // Fallback: try to extract score from text if JSON parsing fails
      const scoreMatch = text.match(/"score":\s*(\d+)/);

      insightsResult = {
        score: scoreMatch ? parseInt(scoreMatch[1]) : 50,
        reasons: ['AI career analysis completed'],
        skillGaps: [],
        learningRecommendations: [],
        careerProgression: [],
        strengths: [],
        concerns: [],
        marketInsights: {
          demand: 'Medium',
          salaryRange: 'Competitive',
          growthTrend: 'Stable',
          remoteOpportunities: 'Good'
        }
      };
    }

    return insightsResult;
  } catch (error) {
    console.error('Error in AI career insights:', error);
    // Fallback to basic insights if AI fails
    return {
      score: 50,
      reasons: ['AI analysis unavailable'],
      skillGaps: [],
      learningRecommendations: [],
      careerProgression: [],
      strengths: [],
      concerns: [],
      marketInsights: {
        demand: 'Medium',
        salaryRange: 'Competitive',
        growthTrend: 'Stable',
        remoteOpportunities: 'Good'
      }
    };
  }
}

module.exports = router;
