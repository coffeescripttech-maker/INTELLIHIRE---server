const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');

const applicantRankingSchema = new mongoose.Schema(
  {
    // Core references
    applicantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Job',
      required: true
    },
    applicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Application',
      required: true
    },

    // Ranking data
    overallScore: {
      type: Number,
      required: true,
      min: 0,
      max: 100
    },
    algorithmicScore: {
      type: Number,
      required: true,
      min: 0,
      max: 100
    },
    aiScore: {
      type: Number,
      required: true,
      min: 0,
      max: 100
    },

    // Detailed scoring breakdown (old - kept for backward compatibility)
    scoringBreakdown: {
      experienceScore: {
        type: Number,
        min: 0,
        max: 100
      },
      skillsScore: {
        type: Number,
        min: 0,
        max: 100
      },
      educationScore: {
        type: Number,
        min: 0,
        max: 100
      },
      locationScore: {
        type: Number,
        min: 0,
        max: 100
      },
      atsKeywordsScore: {
        type: Number,
        min: 0,
        max: 100
      }
    },

    // NEW: PDS Score Breakdown
    pdsScoreBreakdown: {
      totalScore: Number,
      maxPossibleScore: Number,
      percentage: Number,
      criteriaScores: {
        education: {
          label: String,
          earnedPoints: Number,
          maxPoints: Number,
          weight: Number,
          percentage: Number,
          matchedCriteria: String,
          details: String,
          enabled: Boolean
        },
        experience: {
          label: String,
          earnedPoints: Number,
          maxPoints: Number,
          weight: Number,
          percentage: Number,
          matchedCriteria: String,
          details: String,
          enabled: Boolean
        },
        training: {
          label: String,
          earnedPoints: Number,
          maxPoints: Number,
          weight: Number,
          percentage: Number,
          matchedCriteria: String,
          details: String,
          enabled: Boolean
        },
        eligibility: {
          label: String,
          earnedPoints: Number,
          maxPoints: Number,
          weight: Number,
          percentage: Number,
          matchedCriteria: String,
          details: String,
          enabled: Boolean
        },
        skills: {
          label: String,
          earnedPoints: Number,
          maxPoints: Number,
          weight: Number,
          percentage: Number,
          matchedCriteria: String,
          details: String,
          enabled: Boolean
        },
        awards: {
          label: String,
          earnedPoints: Number,
          maxPoints: Number,
          weight: Number,
          percentage: Number,
          matchedCriteria: String,
          details: String,
          enabled: Boolean
        },
        relevantExperience: {
          label: String,
          earnedPoints: Number,
          maxPoints: Number,
          weight: Number,
          percentage: Number,
          matchedCriteria: String,
          details: String,
          enabled: Boolean
        },
        certifications: {
          label: String,
          earnedPoints: Number,
          maxPoints: Number,
          weight: Number,
          percentage: Number,
          matchedCriteria: String,
          details: String,
          enabled: Boolean
        }
      },
      scoringSystemUsed: {
        type: String,
        enum: ['default', 'company-custom', 'job-custom']
      },
      calculatedAt: Date
    },

    // Match analysis
    matchReasons: [
      {
        type: String
      }
    ],
    concerns: [
      {
        type: String
      }
    ],
    strengths: [
      {
        type: String
      }
    ],

    // Ranking metadata
    rank: {
      type: Number,
      required: true
    },
    totalApplicants: {
      type: Number,
      required: true
    },
    percentile: {
      type: Number,
      min: 0,
      max: 100
    },

    // Status and flags
    status: {
      type: String,
      enum: ['pending', 'shortlisted', 'rejected', 'hired'],
      default: 'pending'
    },
    isManuallyAdjusted: {
      type: Boolean,
      default: false
    },
    manualAdjustmentReason: {
      type: String
    },
    adminNotes: {
      type: String
    },

    // Timestamps
    rankedAt: {
      type: Date,
      default: Date.now
    },
    lastUpdated: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

// Indexes for performance
applicantRankingSchema.index({ jobId: 1, rank: 1 });
applicantRankingSchema.index({ applicantId: 1 });
applicantRankingSchema.index({ overallScore: -1 });
applicantRankingSchema.index({ rankedAt: -1 });
applicantRankingSchema.index({ status: 1 });

// Compound index for job-specific rankings
applicantRankingSchema.index({ jobId: 1, overallScore: -1 });

// Static method to get rankings for a specific job
applicantRankingSchema.statics.getJobRankings = async function (
  jobId,
  options = {}
) {
  const {
    page = 1,
    limit = 10,
    status,
    sortBy = 'rank',
    sortOrder = 'asc'
  } = options;

  const query = { jobId };
  if (status) query.status = status;

  const sortOptions = {};
  sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

  const rankings = await this.find(query)
    .populate('applicantId', 'firstName lastName email phone location')
    .populate('jobId', 'title companyId')
    .populate('applicationId', 'appliedAt status')
    .sort(sortOptions)
    .skip((page - 1) * limit)
    .limit(parseInt(limit));

  const total = await this.countDocuments(query);

  return {
    rankings,
    totalPages: Math.ceil(total / limit),
    currentPage: parseInt(page),
    total
  };
};

// Static method to get overall rankings across all jobs
applicantRankingSchema.statics.getOverallRankings = async function (
  options = {}
) {
  const {
    page = 1,
    limit = 10,
    dateRange,
    sortBy = 'overallScore',
    sortOrder = 'desc'
  } = options;

  const query = {};

  if (dateRange) {
    const { startDate, endDate } = dateRange;
    query.rankedAt = {};
    if (startDate) query.rankedAt.$gte = new Date(startDate);
    if (endDate) query.rankedAt.$lte = new Date(endDate);
  }

  const sortOptions = {};
  sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

  const rankings = await this.find(query)
    .populate('applicantId', 'firstName lastName email phone location')
    .populate('jobId', 'title companyId')
    .populate('applicationId', 'appliedAt status')
    .sort(sortOptions)
    .skip((page - 1) * limit)
    .limit(parseInt(limit));

  const total = await this.countDocuments(query);

  return {
    rankings,
    totalPages: Math.ceil(total / limit),
    currentPage: parseInt(page),
    total
  };
};

// Static method to recalculate rankings for a job
applicantRankingSchema.statics.recalculateJobRankings = async function (jobId) {
  // Get all applications for this job
  const Application = require('./application.model');
  const applications = await Application.find({ jobId })
    .populate('applicantId')
    .populate('jobId');

  if (applications.length === 0) {
    return { message: 'No applications found for this job' };
  }

  // Calculate scores for each application
  const rankings = [];
  for (const application of applications) {
    const ranking = await this.calculateApplicantScore(application);
    rankings.push(ranking);
  }

  // Sort by overall score and assign ranks
  rankings.sort((a, b) => b.overallScore - a.overallScore);

  rankings.forEach((ranking, index) => {
    ranking.rank = index + 1;
    ranking.totalApplicants = rankings.length;
    ranking.percentile = Math.round(
      ((rankings.length - index) / rankings.length) * 100
    );
  });

  // Save or update rankings
  const savedRankings = [];
  for (const ranking of rankings) {
    const existingRanking = await this.findOne({
      applicantId: ranking.applicantId,
      jobId: ranking.jobId
    });

    if (existingRanking) {
      Object.assign(existingRanking, ranking);
      await existingRanking.save();
      savedRankings.push(existingRanking);
    } else {
      const newRanking = new this(ranking);
      await newRanking.save();
      savedRankings.push(newRanking);
    }
  }

  return savedRankings;
};

// Static method to calculate applicant score
applicantRankingSchema.statics.calculateApplicantScore = async function (
  application
) {
  const { applicantId, jobId } = application;

  // Get applicant data
  const User = require('./user.model');
  const PdsExtractedData = require('./pdsExtractedData.model');
  const Resume = require('./resume.model');

  const applicant = await User.findById(applicantId);
  const pds = await PdsExtractedData.findOne({ userId: applicantId }).sort({
    createdAt: -1
  });
  const resume = await Resume.findOne({ userId: applicantId }).sort({
    createdAt: -1
  });

  // Build applicant profile (similar to job recommendations)
  const applicantProfile = this.buildApplicantProfileFromPdsAndResume({
    user: applicant,
    pds,
    resume
  });

  // NEW: Calculate PDS Score using customizable scoring system
  const PDSScoringService = require('../services/pdsScoring.service');
  const scoringService = new PDSScoringService();
  
  // Get job with company populated for scoring config
  const Job = require('./job.model');
  const job = await Job.findById(jobId).populate('companyId');
  
  let pdsBreakdown = null;
  try {
    pdsBreakdown = await scoringService.calculatePDSScore(applicantProfile, job);
  } catch (error) {
    console.error('Error calculating PDS score:', error);
    // Fallback to basic scoring if PDS scoring fails
  }

  // Calculate algorithmic score (kept for backward compatibility)
  const algorithmicScore = await this.calculateAlgorithmicScore(
    jobId,
    applicantProfile
  );

  // Calculate AI score using Gemini
  const aiScore = await this.calculateAIScore(jobId, applicantProfile);

  // Use PDS score as primary, fallback to combined score
  const overallScore = pdsBreakdown 
    ? Math.round(pdsBreakdown.totalScore)
    : Math.round(algorithmicScore * 0.5 + aiScore.score * 0.5);

  return {
    applicantId,
    jobId,
    applicationId: application._id,
    overallScore,
    algorithmicScore,
    aiScore: aiScore.score,
    // OLD scoring breakdown (backward compatibility)
    scoringBreakdown: {
      experienceScore: aiScore.scoringBreakdown?.experience || 0,
      skillsScore: aiScore.scoringBreakdown?.skills || 0,
      educationScore: aiScore.scoringBreakdown?.education || 0,
      locationScore: aiScore.scoringBreakdown?.location || 0,
      atsKeywordsScore: aiScore.scoringBreakdown?.atsKeywords || 0
    },
    // NEW: PDS Score Breakdown
    pdsScoreBreakdown: pdsBreakdown || null,
    matchReasons: aiScore.reasons || [],
    concerns: aiScore.concerns || [],
    strengths: aiScore.strengths || []
  };
};

// Helper method to build applicant profile
applicantRankingSchema.statics.buildApplicantProfileFromPdsAndResume =
  function ({ user, pds, resume }) {
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

    const skills = [
      ...new Set([...pdsSkills, ...resumeCore, ...resumeTech])
    ].map(s => String(s).toLowerCase());

    // Extract education
    const education =
      Array.isArray(r.education) && r.education.length
        ? r.education
        : Array.isArray(p.education)
        ? p.education
        : [];

    // Extract work experience
    const workExperience =
      Array.isArray(r.workExperience) && r.workExperience.length
        ? r.workExperience
        : Array.isArray(p.workExperience)
        ? p.workExperience
        : [];

    // Calculate total years of experience
    const totalYears = this.estimateYearsFromExperience(workExperience);

    // Extract location
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
  };

// Helper method to estimate years from experience
applicantRankingSchema.statics.estimateYearsFromExperience = function (
  workExperience
) {
  try {
    return Number(
      workExperience
        .reduce((sum, w) => {
          const start = this.parseDateMMYYYY(w.startDate);
          const end =
            w.endDate && w.endDate.toLowerCase() !== 'present'
              ? this.parseDateMMYYYY(w.endDate)
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
};

// Helper method to parse MM/YYYY date format
applicantRankingSchema.statics.parseDateMMYYYY = function (s) {
  if (!s) return null;
  const [mm, yyyy] = String(s)
    .split('/')
    .map(x => parseInt(x, 10));
  if (!mm || !yyyy) return null;
  return new Date(yyyy, mm - 1, 1);
};

// Helper method to calculate algorithmic score
applicantRankingSchema.statics.calculateAlgorithmicScore = async function (
  jobId,
  applicant
) {
  const Job = require('./job.model');
  const job = await Job.findById(jobId);

  if (!job) return 0;

  let score = 0;

  // Education match (25% weight)
  if (job.educationLevel && applicant.education?.length) {
    const jobEduLevel = job.educationLevel.toLowerCase();
    const hasMatch = applicant.education.some(e => {
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
    if (hasMatch) score += 25;
  }

  // Experience match (25% weight)
  if (job.experienceYearsMin !== undefined) {
    const reqYears = job.experienceYearsMin || 0;
    if (applicant.totalYears >= reqYears) {
      score += 25;
    } else if (applicant.totalYears > 0) {
      score += Math.min(25, (applicant.totalYears / reqYears) * 25);
    }
  }

  // Skills match (35% weight)
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

  // ATS keyword boost (10% weight)
  if (applicant.atsKeywords?.length && (job.description || job.requirements)) {
    const jobText = `${job.description || ''} ${
      job.requirements || ''
    }`.toLowerCase();
    const matchedKw = applicant.atsKeywords.filter(k =>
      jobText.includes(String(k).toLowerCase())
    );
    score += Math.min(10, matchedKw.length);
  }

  // Location match (3% weight)
  if (job.location && applicant.location) {
    const jl = job.location.toLowerCase();
    const al = String(applicant.location).toLowerCase();
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
};

// Helper method to calculate AI score using Gemini
applicantRankingSchema.statics.calculateAIScore = async function (
  jobId,
  applicant
) {
  try {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const Job = require('./job.model');

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const job = await Job.findById(jobId);
    if (!job) return { score: 0, reasons: [], concerns: [], strengths: [] };

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

    const prompt = `You are an AI-powered ATS (Applicant Tracking System) and Job Matching Assistant for applicant ranking.
Your task is to evaluate a candidate profile against a job posting and generate detailed ATS-style match results in JSON format.

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
5. List key strengths of the candidate.

**Return ONLY a valid JSON object with this exact structure:**
{
  "score": 85,
  "scoringBreakdown": {
    "experience": 20,
    "skills": 35,
    "education": 18,
    "location": 8,
    "atsKeywords": 4
  },
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

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    console.log('Raw Gemini response for ranking:', text);

    // Parse the JSON response
    let matchResult;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        matchResult = JSON.parse(jsonMatch[0]);
      } else {
        matchResult = JSON.parse(text);
      }
    } catch (parseError) {
      console.error('Error parsing Gemini JSON response:', parseError);

      // Fallback scoring
      matchResult = {
        score: 50,
        scoringBreakdown: {
          experience: 12,
          skills: 20,
          education: 10,
          location: 5,
          atsKeywords: 3
        },
        reasons: ['AI analysis completed'],
        concerns: [],
        strengths: []
      };
    }

    return {
      score: matchResult.score || 0,
      scoringBreakdown: matchResult.scoringBreakdown || {},
      reasons: matchResult.reasons || [],
      concerns: matchResult.concerns || [],
      strengths: matchResult.strengths || []
    };
  } catch (error) {
    console.error('Error in AI ranking:', error);
    return {
      score: 50,
      scoringBreakdown: {
        experience: 12,
        skills: 20,
        education: 10,
        location: 5,
        atsKeywords: 3
      },
      reasons: ['AI analysis unavailable'],
      concerns: [],
      strengths: []
    };
  }
};

// Apply pagination plugin
applicantRankingSchema.plugin(mongoosePaginate);

module.exports = mongoose.model('ApplicantRanking', applicantRankingSchema);
