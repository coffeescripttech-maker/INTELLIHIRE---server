const User = require('../models/user.model');
const Job = require('../models/job.model');
const Document = require('../models/document.model');
const Application = require('../models/application.model');

class JobMatcher {
  constructor() {
    this.weights = {
      education: 0.2,
      experience: 0.3,
      skills: 0.3,
      eligibility: 0.2
    };
  }

  // Calculate match score between an applicant and a job
  async calculateMatchScore(applicantId, jobId) {
    try {
      const [applicant, job, pds] = await Promise.all([
        User.findById(applicantId),
        Job.findById(jobId),
        Document.findOne({ userId: applicantId, type: 'pds' })
      ]);

      if (!applicant || !job || !pds) {
        throw new Error('Required data not found');
      }

      const parsedData = pds.parsedData;
      if (!parsedData) {
        throw new Error('PDS data not parsed');
      }

      const scores = {
        educationScore: this.calculateEducationScore(parsedData.education, job),
        experienceScore: this.calculateExperienceScore(
          parsedData.workExperience,
          job
        ),
        skillsScore: this.calculateSkillsScore(parsedData.skills, job.skills),
        eligibilityScore: this.calculateEligibilityScore(
          parsedData.eligibility,
          job.eligibility
        )
      };

      // Calculate weighted total score
      const totalScore = Object.entries(scores).reduce(
        (total, [key, score]) => {
          const weight = this.weights[key.replace('Score', '')];
          return total + score * weight;
        },
        0
      );

      return {
        matchScore: Math.round(totalScore * 100) / 100,
        matchDetails: scores
      };
    } catch (error) {
      console.error('Error calculating match score:', error);
      throw error;
    }
  }

  // Calculate education match score
  calculateEducationScore(education, job) {
    if (!education || !job.educationLevel) return 0;

    const educationLevels = {
      'High School': 1,
      Associate: 2,
      Bachelor: 3,
      Master: 4,
      Doctorate: 5
    };

    const requiredLevel = educationLevels[job.educationLevel];
    const highestEducation = education.reduce((highest, edu) => {
      const level = educationLevels[edu.degree] || 0;
      return level > highest ? level : highest;
    }, 0);

    if (highestEducation >= requiredLevel) {
      return 1.0;
    } else if (highestEducation === requiredLevel - 1) {
      return 0.7;
    } else {
      return 0.3;
    }
  }

  // Calculate experience match score
  calculateExperienceScore(experience, job) {
    if (!experience || !job.experienceYearsMin) return 0;

    const totalYears = experience.reduce((total, exp) => {
      const startDate = new Date(exp.startDate);
      const endDate = exp.isCurrentPosition
        ? new Date()
        : new Date(exp.endDate);
      const years = (endDate - startDate) / (1000 * 60 * 60 * 24 * 365);
      return total + years;
    }, 0);

    if (totalYears >= job.experienceYearsMax) {
      return 1.0;
    } else if (totalYears >= job.experienceYearsMin) {
      return 0.8;
    } else {
      return Math.max(0.3, totalYears / job.experienceYearsMin);
    }
  }

  // Calculate skills match score
  calculateSkillsScore(applicantSkills, jobSkills) {
    if (!applicantSkills || !jobSkills || !jobSkills.length) return 0;

    const normalizedApplicantSkills = applicantSkills.map(skill =>
      skill.toLowerCase()
    );
    const normalizedJobSkills = jobSkills.map(skill => skill.toLowerCase());

    const matchingSkills = normalizedJobSkills.filter(skill =>
      normalizedApplicantSkills.some(
        appSkill => appSkill.includes(skill) || skill.includes(appSkill)
      )
    );

    return matchingSkills.length / jobSkills.length;
  }

  // Calculate eligibility match score
  calculateEligibilityScore(applicantEligibility, jobEligibility) {
    if (!applicantEligibility || !jobEligibility || !jobEligibility.length)
      return 0;

    const normalizedApplicantEligibility = applicantEligibility.map(elig =>
      elig.toLowerCase()
    );
    const normalizedJobEligibility = jobEligibility.map(elig =>
      elig.toLowerCase()
    );

    const matchingEligibility = normalizedJobEligibility.filter(elig =>
      normalizedApplicantEligibility.some(
        appElig => appElig.includes(elig) || elig.includes(appElig)
      )
    );

    return matchingEligibility.length / jobEligibility.length;
  }

  // Find matching jobs for an applicant
  async findMatchingJobs(applicantId, limit = 10) {
    try {
      const activeJobs = await Job.find({
        status: 'active',
        expiryDate: { $gt: new Date() }
      });

      const matchScores = await Promise.all(
        activeJobs.map(async job => {
          const { matchScore, matchDetails } = await this.calculateMatchScore(
            applicantId,
            job._id
          );
          return {
            job,
            matchScore,
            matchDetails
          };
        })
      );

      // Sort by match score and return top matches
      return matchScores
        .sort((a, b) => b.matchScore - a.matchScore)
        .slice(0, limit);
    } catch (error) {
      console.error('Error finding matching jobs:', error);
      throw error;
    }
  }

  // Find matching applicants for a job
  async findMatchingApplicants(jobId, limit = 10) {
    try {
      const applicants = await User.find({ role: 'applicant' });

      const matchScores = await Promise.all(
        applicants.map(async applicant => {
          const { matchScore, matchDetails } = await this.calculateMatchScore(
            applicant._id,
            jobId
          );
          return {
            applicant,
            matchScore,
            matchDetails
          };
        })
      );

      // Sort by match score and return top matches
      return matchScores
        .sort((a, b) => b.matchScore - a.matchScore)
        .slice(0, limit);
    } catch (error) {
      console.error('Error finding matching applicants:', error);
      throw error;
    }
  }
}

module.exports = new JobMatcher();
