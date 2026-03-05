const { DEFAULT_SCORING_CONFIG, calculateMaxScore } = require('../config/defaultScoring.config');

class PDSScoringService {
  /**
   * Get scoring configuration for a job
   * Implements 3-level hierarchy: Job > Company > System Default
   */
  async getScoringConfig(job) {
    // Level 3: Job-specific config (highest priority)
    if (job.jobScoringConfig && 
        !job.jobScoringConfig.useCompanyDefault && 
        !job.jobScoringConfig.useSystemDefault &&
        job.jobScoringConfig.customScoring) {
      return {
        config: job.jobScoringConfig.customScoring,
        source: 'job-custom'
      };
    }
    
    // Level 2: Company config (merge with defaults)
    if (job.companyId && job.companyId.scoringConfig) {
      const companyConfig = this.mergeConfigWithDefaults(job.companyId.scoringConfig);
      
      // Check if company config has at least one enabled criterion
      const hasEnabledCriteria = Object.values(companyConfig).some(
        criterion => criterion.enabled === true
      );
      
      if (hasEnabledCriteria) {
        return {
          config: companyConfig,
          source: 'company-custom'
        };
      }
    }
    
    // Level 1: System default (fallback)
    return {
      config: DEFAULT_SCORING_CONFIG,
      source: 'default'
    };
  }
  
  /**
   * Merge company/job config with system defaults to ensure completeness
   */
  mergeConfigWithDefaults(customConfig) {
    const mergedConfig = {};
    
    Object.keys(DEFAULT_SCORING_CONFIG).forEach(key => {
      const dbCriterion = customConfig[key] || {};
      const defaultCriterion = DEFAULT_SCORING_CONFIG[key];
      
      // Clean DB values - remove undefined/null/empty arrays
      const cleanDbCriterion = {};
      Object.keys(dbCriterion).forEach(field => {
        const value = dbCriterion[field];
        if (value !== undefined && value !== null && 
            !(Array.isArray(value) && value.length === 0)) {
          cleanDbCriterion[field] = value;
        }
      });
      
      // Merge: defaults + cleaned DB values
      mergedConfig[key] = {
        ...defaultCriterion,
        ...cleanDbCriterion
      };
    });
    
    return mergedConfig;
  }
  
  /**
   * Calculate complete PDS score breakdown for an applicant
   */
  async calculatePDSScore(applicantData, job) {
    const { config, source } = await this.getScoringConfig(job);
    
    const breakdown = {
      totalScore: 0,
      maxPossibleScore: calculateMaxScore(config),
      percentage: 0,
      criteriaScores: {},
      scoringSystemUsed: source,
      calculatedAt: new Date()
    };
    
    // Calculate each criterion
    for (const [key, criteria] of Object.entries(config)) {
      if (!criteria.enabled) {
        breakdown.criteriaScores[key] = {
          label: criteria.label,
          earnedPoints: 0,
          maxPoints: criteria.maxPoints,
          weight: criteria.weight,
          percentage: 0,
          enabled: false
        };
        continue;
      }
      
      const criteriaScore = this.evaluateCriterion(key, applicantData, criteria);
      
      breakdown.criteriaScores[key] = {
        label: criteria.label,
        earnedPoints: criteriaScore.points,
        maxPoints: criteria.maxPoints,
        weight: criteria.weight,
        percentage: criteria.maxPoints > 0 ? (criteriaScore.points / criteria.maxPoints) * 100 : 0,
        matchedCriteria: criteriaScore.matchedCriteria,
        details: criteriaScore.details,
        enabled: true
      };
      
      breakdown.totalScore += criteriaScore.points;
    }
    
    breakdown.percentage = breakdown.maxPossibleScore > 0 
      ? (breakdown.totalScore / breakdown.maxPossibleScore) * 100 
      : 0;
    
    return breakdown;
  }
  
  /**
   * Evaluate a single criterion
   */
  evaluateCriterion(criterionKey, applicantData, criteria) {
    switch (criterionKey) {
      case 'education':
        return this.evaluateEducation(applicantData, criteria);
      case 'experience':
        return this.evaluateExperience(applicantData, criteria);
      case 'training':
        return this.evaluateTraining(applicantData, criteria);
      case 'eligibility':
        return this.evaluateEligibility(applicantData, criteria);
      case 'skills':
        return this.evaluateSkills(applicantData, criteria);
      case 'awards':
        return this.evaluateAwards(applicantData, criteria);
      case 'relevantExperience':
        return this.evaluateRelevantExperience(applicantData, criteria);
      case 'certifications':
        return this.evaluateCertifications(applicantData, criteria);
      default:
        return { points: 0, matchedCriteria: 'Unknown', details: '' };
    }
  }
  
  /**
   * Education scoring
   */
  evaluateEducation(applicantData, criteria) {
    const education = applicantData.education || [];
    if (education.length === 0) {
      return {
        points: 0,
        matchedCriteria: 'No education data',
        details: 'No educational background provided'
      };
    }
    
    // Get highest education level
    const degrees = education.map(e => (e.degree || e.level || '').toLowerCase());
    let highestLevel = '';
    let matchedSub = null;
    
    // Check in priority order
    if (degrees.some(d => d.includes('phd') || d.includes('doctor'))) {
      matchedSub = criteria.subCriteria.find(s => s.name.toLowerCase().includes('doctorate'));
      highestLevel = 'Doctorate';
    } else if (degrees.some(d => d.includes('master') || d.includes('ms') || d.includes('ma'))) {
      matchedSub = criteria.subCriteria.find(s => s.name.toLowerCase().includes('master'));
      highestLevel = "Master's Degree";
    } else if (degrees.some(d => d.includes('bachelor') || d.includes('bs') || d.includes('ba') || d.includes('college'))) {
      matchedSub = criteria.subCriteria.find(s => s.name.toLowerCase().includes('bachelor'));
      highestLevel = "Bachelor's Degree";
    } else if (degrees.some(d => d.includes('vocational') || d.includes('technical') || d.includes('diploma'))) {
      matchedSub = criteria.subCriteria.find(s => s.name.toLowerCase().includes('vocational'));
      highestLevel = 'Vocational/Technical';
    } else {
      matchedSub = criteria.subCriteria.find(s => s.name.toLowerCase().includes('high school'));
      highestLevel = 'High School';
    }
    
    return {
      points: matchedSub ? matchedSub.points : 8,
      matchedCriteria: matchedSub ? matchedSub.name : highestLevel,
      details: `Highest education: ${highestLevel}`
    };
  }
  
  /**
   * Experience scoring
   */
  evaluateExperience(applicantData, criteria) {
    const totalYears = applicantData.totalYears || 0;
    let matchedSub = null;
    
    if (totalYears >= 10) {
      matchedSub = criteria.subCriteria.find(s => s.name.includes('10+'));
    } else if (totalYears >= 7) {
      matchedSub = criteria.subCriteria.find(s => s.name.includes('7-9'));
    } else if (totalYears >= 4) {
      matchedSub = criteria.subCriteria.find(s => s.name.includes('4-6'));
    } else if (totalYears >= 2) {
      matchedSub = criteria.subCriteria.find(s => s.name.includes('2-3'));
    } else {
      matchedSub = criteria.subCriteria.find(s => s.name.includes('0-1'));
    }
    
    return {
      points: matchedSub ? matchedSub.points : 0,
      matchedCriteria: matchedSub ? matchedSub.name : 'No experience',
      details: `Total experience: ${totalYears} years`
    };
  }
  
  /**
   * Training scoring
   */
  evaluateTraining(applicantData, criteria) {
    const trainings = applicantData.training || applicantData.trainingSeminars || [];
    const trainingCount = Array.isArray(trainings) ? trainings.length : 0;
    let matchedSub = null;
    
    if (trainingCount >= 10) {
      matchedSub = criteria.subCriteria.find(s => s.name.includes('10+'));
    } else if (trainingCount >= 6) {
      matchedSub = criteria.subCriteria.find(s => s.name.includes('6-9'));
    } else if (trainingCount >= 3) {
      matchedSub = criteria.subCriteria.find(s => s.name.includes('3-5'));
    } else if (trainingCount >= 1) {
      matchedSub = criteria.subCriteria.find(s => s.name.includes('1-2'));
    } else {
      matchedSub = criteria.subCriteria.find(s => s.name.toLowerCase().includes('no training'));
    }
    
    return {
      points: matchedSub ? matchedSub.points : 0,
      matchedCriteria: matchedSub ? matchedSub.name : 'No training',
      details: `Completed ${trainingCount} training programs/seminars`
    };
  }
  
  /**
   * Eligibility scoring
   */
  evaluateEligibility(applicantData, criteria) {
    const eligibilities = applicantData.eligibility || [];
    if (!Array.isArray(eligibilities) || eligibilities.length === 0) {
      return {
        points: 0,
        matchedCriteria: 'None',
        details: 'No eligibility recorded'
      };
    }
    
    const eligString = eligibilities.map(e => (e.name || e.title || '').toLowerCase()).join(' ');
    
    let matchedSub = null;
    
    if (eligString.includes('license') && eligString.includes('professional')) {
      matchedSub = criteria.subCriteria.find(s => s.name.includes('License + CS Professional'));
    } else if (eligString.includes('cs professional') || eligString.includes('professional')) {
      matchedSub = criteria.subCriteria.find(s => s.name === 'CS Professional');
    } else if (eligString.includes('sub-professional')) {
      matchedSub = criteria.subCriteria.find(s => s.name.includes('Sub-Professional'));
    } else if (eligString.includes('ra 1080') || eligString.includes('ra1080')) {
      matchedSub = criteria.subCriteria.find(s => s.name.includes('RA 1080'));
    }
    
    return {
      points: matchedSub ? matchedSub.points : 0,
      matchedCriteria: matchedSub ? matchedSub.name : eligibilities[0].name || 'Other',
      details: `Eligibilities: ${eligibilities.map(e => e.name || e.title).join(', ')}`
    };
  }
  
  /**
   * Skills scoring
   */
  evaluateSkills(applicantData, criteria) {
    const skills = applicantData.skills || [];
    const skillCount = Array.isArray(skills) ? skills.length : 0;
    let matchedSub = null;
    
    if (skillCount >= 5) {
      matchedSub = criteria.subCriteria.find(s => s.name.includes('5+'));
    } else if (skillCount >= 3) {
      matchedSub = criteria.subCriteria.find(s => s.name.includes('3-4'));
    } else if (skillCount >= 2) {
      matchedSub = criteria.subCriteria.find(s => s.name.includes('2 skills'));
    } else if (skillCount >= 1) {
      matchedSub = criteria.subCriteria.find(s => s.name.includes('1 skill'));
    } else {
      matchedSub = criteria.subCriteria.find(s => s.name === 'None');
    }
    
    return {
      points: matchedSub ? matchedSub.points : 0,
      matchedCriteria: matchedSub ? matchedSub.name : 'None',
      details: skillCount > 0 ? `Skills: ${skills.slice(0, 5).join(', ')}${skillCount > 5 ? '...' : ''}` : 'No skills listed'
    };
  }
  
  /**
   * Awards scoring
   */
  evaluateAwards(applicantData, criteria) {
    const awards = applicantData.awards || applicantData.recognitions || [];
    const awardCount = Array.isArray(awards) ? awards.length : 0;
    let matchedSub = null;
    
    if (awardCount >= 5) {
      matchedSub = criteria.subCriteria.find(s => s.name.includes('5+'));
    } else if (awardCount >= 3) {
      matchedSub = criteria.subCriteria.find(s => s.name.includes('3-4'));
    } else if (awardCount >= 1) {
      matchedSub = criteria.subCriteria.find(s => s.name.includes('1-2'));
    } else {
      matchedSub = criteria.subCriteria.find(s => s.name === 'None');
    }
    
    return {
      points: matchedSub ? matchedSub.points : 0,
      matchedCriteria: matchedSub ? matchedSub.name : 'None',
      details: awardCount > 0 ? `${awardCount} awards/recognitions` : 'No awards recorded'
    };
  }
  
  /**
   * Relevant Experience scoring
   */
  evaluateRelevantExperience(applicantData, criteria) {
    // Calculate relevant years based on work experience matching job requirements
    const relevantYears = applicantData.relevantYears || 0;
    let matchedSub = null;
    
    if (relevantYears >= 5) {
      matchedSub = criteria.subCriteria.find(s => s.name.includes('5+'));
    } else if (relevantYears >= 3) {
      matchedSub = criteria.subCriteria.find(s => s.name.includes('3-4'));
    } else if (relevantYears >= 1) {
      matchedSub = criteria.subCriteria.find(s => s.name.includes('1-2'));
    } else if (relevantYears > 0) {
      matchedSub = criteria.subCriteria.find(s => s.name.includes('Somewhat'));
    } else {
      matchedSub = criteria.subCriteria.find(s => s.name.includes('Not Relevant'));
    }
    
    return {
      points: matchedSub ? matchedSub.points : 0,
      matchedCriteria: matchedSub ? matchedSub.name : 'Not Relevant',
      details: relevantYears > 0 ? `${relevantYears} years of relevant experience` : 'Experience not directly relevant'
    };
  }
  
  /**
   * Certifications scoring
   */
  evaluateCertifications(applicantData, criteria) {
    const certifications = applicantData.certifications || [];
    const certCount = Array.isArray(certifications) ? certifications.length : 0;
    let matchedSub = null;
    
    if (certCount >= 3) {
      matchedSub = criteria.subCriteria.find(s => s.name.includes('3+'));
    } else if (certCount >= 2) {
      matchedSub = criteria.subCriteria.find(s => s.name.includes('2 certifications'));
    } else if (certCount >= 1) {
      matchedSub = criteria.subCriteria.find(s => s.name.includes('1 certification'));
    } else {
      matchedSub = criteria.subCriteria.find(s => s.name === 'None');
    }
    
    return {
      points: matchedSub ? matchedSub.points : 0,
      matchedCriteria: matchedSub ? matchedSub.name : 'None',
      details: certCount > 0 ? `${certCount} professional certifications` : 'No certifications'
    };
  }
}

module.exports = PDSScoringService;
