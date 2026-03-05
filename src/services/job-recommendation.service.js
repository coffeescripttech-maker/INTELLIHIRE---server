const User = require('../models/user.model');
const Job = require('../models/job.model');
const Company = require('../models/company.model');
const jobMatcher = require('./job-matcher.service');
const emailService = require('./email.service');

class JobRecommendationService {
  constructor() {
    this.recommendationThreshold = 0.7; // Minimum match score to recommend
    this.maxRecommendations = 5; // Maximum number of recommendations per email
  }

  // Generate recommendations for all active applicants
  async generateRecommendations() {
    try {
      const applicants = await User.find({ role: 'applicant', isActive: true });

      for (const applicant of applicants) {
        await this.generateRecommendationsForApplicant(applicant._id);
      }
    } catch (error) {
      console.error('Error generating recommendations:', error);
      throw error;
    }
  }

  // Generate recommendations for a specific applicant
  async generateRecommendationsForApplicant(applicantId) {
    try {
      // Get matching jobs
      const matches = await jobMatcher.findMatchingJobs(applicantId, 20);

      // Filter matches above threshold
      const recommendations = matches
        .filter(match => match.matchScore >= this.recommendationThreshold)
        .slice(0, this.maxRecommendations);

      if (recommendations.length > 0) {
        // Get company details for each recommendation
        const recommendationsWithCompanies = await Promise.all(
          recommendations.map(async rec => {
            const company = await Company.findById(rec.job.companyId);
            return {
              ...rec,
              company
            };
          })
        );

        // Send email with recommendations
        await emailService.sendJobRecommendations(
          applicantId,
          recommendationsWithCompanies
        );
      }
    } catch (error) {
      console.error('Error generating recommendations for applicant:', error);
      throw error;
    }
  }

  // Update recommendation settings
  updateSettings(settings) {
    if (settings.recommendationThreshold) {
      this.recommendationThreshold = settings.recommendationThreshold;
    }
    if (settings.maxRecommendations) {
      this.maxRecommendations = settings.maxRecommendations;
    }
  }

  // Get current recommendation settings
  getSettings() {
    return {
      recommendationThreshold: this.recommendationThreshold,
      maxRecommendations: this.maxRecommendations
    };
  }
}

module.exports = new JobRecommendationService();
