// Default PDS Scoring Configuration
// Aligned with research objectives 1.4.1, 1.4.2, 1.4.3

const DEFAULT_SCORING_CONFIG = {
  education: {
    label: 'Education',
    maxPoints: 20,
    weight: 20,
    enabled: true,
    description: 'Educational attainment and academic qualifications',
    subCriteria: [
      { name: 'Doctorate Degree', points: 20, description: 'PhD or equivalent' },
      { name: "Master's Degree", points: 18, description: "Master's or equivalent" },
      { name: "Bachelor's Degree", points: 15, description: 'College graduate' },
      { name: 'Vocational/Technical', points: 12, description: 'Technical education' },
      { name: 'High School Graduate', points: 8, description: 'Secondary education' }
    ]
  },
  experience: {
    label: 'Work Experience',
    maxPoints: 25,
    weight: 25,
    enabled: true,
    description: 'Total years of professional work experience',
    subCriteria: [
      { name: '10+ years', points: 25, description: 'Extensive experience' },
      { name: '7-9 years', points: 20, description: 'Senior level' },
      { name: '4-6 years', points: 15, description: 'Mid-level' },
      { name: '2-3 years', points: 10, description: 'Junior level' },
      { name: '0-1 years', points: 5, description: 'Entry level' }
    ]
  },
  training: {
    label: 'Training & Seminars',
    maxPoints: 10,
    weight: 10,
    enabled: true,
    description: 'Relevant training programs and professional development',
    subCriteria: [
      { name: '10+ trainings', points: 10, description: 'Extensive training' },
      { name: '6-9 trainings', points: 8, description: 'Good training background' },
      { name: '3-5 trainings', points: 6, description: 'Moderate training' },
      { name: '1-2 trainings', points: 4, description: 'Basic training' },
      { name: 'No training', points: 0, description: 'No formal training' }
    ]
  },
  eligibility: {
    label: 'Civil Service Eligibility',
    maxPoints: 15,
    weight: 15,
    enabled: true,
    description: 'Government eligibility and professional licenses',
    subCriteria: [
      { name: 'Professional License + CS Professional', points: 15, description: 'Highest eligibility' },
      { name: 'CS Professional', points: 12, description: 'Professional civil service' },
      { name: 'CS Sub-Professional', points: 10, description: 'Sub-professional level' },
      { name: 'RA 1080', points: 8, description: 'RA 1080 eligible' },
      { name: 'None', points: 0, description: 'No eligibility' }
    ]
  },
  skills: {
    label: 'Special Skills',
    maxPoints: 10,
    weight: 10,
    enabled: true,
    description: 'Technical and soft skills relevant to the position',
    subCriteria: [
      { name: 'Expert (5+ skills)', points: 10, description: 'Multiple advanced skills' },
      { name: 'Advanced (3-4 skills)', points: 8, description: 'Good skill set' },
      { name: 'Intermediate (2 skills)', points: 6, description: 'Basic skills' },
      { name: 'Beginner (1 skill)', points: 4, description: 'Limited skills' },
      { name: 'None', points: 0, description: 'No special skills' }
    ]
  },
  awards: {
    label: 'Recognition & Awards',
    maxPoints: 5,
    weight: 5,
    enabled: true,
    description: 'Professional recognition and achievements',
    subCriteria: [
      { name: '5+ awards', points: 5, description: 'Highly recognized' },
      { name: '3-4 awards', points: 4, description: 'Well recognized' },
      { name: '1-2 awards', points: 3, description: 'Some recognition' },
      { name: 'None', points: 0, description: 'No formal awards' }
    ]
  },
  relevantExperience: {
    label: 'Relevant Experience',
    maxPoints: 10,
    weight: 10,
    enabled: true,
    description: 'Experience directly related to the job position',
    subCriteria: [
      { name: 'Highly Relevant (5+ years)', points: 10, description: 'Extensive relevant experience' },
      { name: 'Very Relevant (3-4 years)', points: 8, description: 'Good relevant experience' },
      { name: 'Relevant (1-2 years)', points: 6, description: 'Some relevant experience' },
      { name: 'Somewhat Relevant', points: 4, description: 'Limited relevant experience' },
      { name: 'Not Relevant', points: 0, description: 'No relevant experience' }
    ]
  },
  certifications: {
    label: 'Professional Certifications',
    maxPoints: 5,
    weight: 5,
    enabled: true,
    description: 'Industry certifications and professional credentials',
    subCriteria: [
      { name: '3+ certifications', points: 5, description: 'Multiple certifications' },
      { name: '2 certifications', points: 4, description: 'Good credentials' },
      { name: '1 certification', points: 3, description: 'Basic certification' },
      { name: 'None', points: 0, description: 'No certifications' }
    ]
  }
};

/**
 * Calculate maximum possible score based on enabled criteria
 */
function calculateMaxScore(config) {
  return Object.values(config).reduce((sum, field) => {
    return field.enabled ? sum + field.maxPoints : sum;
  }, 0);
}

/**
 * Validate that weights sum to 100%
 */
function validateScoringWeights(config) {
  const totalWeight = Object.values(config).reduce((sum, field) => {
    return field.enabled ? sum + field.weight : sum;
  }, 0);
  return Math.abs(totalWeight - 100) < 0.01; // Allow for floating point precision
}

module.exports = {
  DEFAULT_SCORING_CONFIG,
  calculateMaxScore,
  validateScoringWeights
};
