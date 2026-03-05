const mongoose = require('mongoose');
require('dotenv').config();

// Import models
const Company = require('../src/models/company.model');
const JobCategory = require('../src/models/jobCategory.model');
const Job = require('../src/models/job.model');

// Sample companies data
const sampleCompanies = [
  {
    name: 'Sto. Tomas Municipal Government',
    description: 'Local government unit of Sto. Tomas, Batangas',
    industry: 'Government',
    website: 'https://stotomas.gov.ph',
    contactEmail: 'info@stotomas.gov.ph',
    contactPhone: '+63 43 123 4567',
    address: {
      street: 'Municipal Hall',
      city: 'Sto. Tomas',
      province: 'Batangas',
      zipCode: '4234'
    },
    isGovernment: true,
    isVerified: true
  },
  {
    name: 'Tech Solutions Inc.',
    description: 'Leading technology solutions provider',
    industry: 'Information Technology',
    website: 'https://techsolutions.com',
    contactEmail: 'careers@techsolutions.com',
    contactPhone: '+63 2 123 4567',
    address: {
      street: '123 Tech Street',
      city: 'Makati',
      province: 'Metro Manila',
      zipCode: '1200'
    },
    isGovernment: false,
    isVerified: true
  },
  {
    name: 'Healthcare Plus',
    description: 'Healthcare and medical services provider',
    industry: 'Healthcare',
    website: 'https://healthcareplus.com',
    contactEmail: 'hr@healthcareplus.com',
    contactPhone: '+63 2 234 5678',
    address: {
      street: '456 Health Avenue',
      city: 'Quezon City',
      province: 'Metro Manila',
      zipCode: '1100'
    },
    isGovernment: false,
    isVerified: true
  }
];

// Sample job categories data
const sampleCategories = [
  {
    name: 'Information Technology',
    description:
      'Jobs related to software development, IT support, and technology',
    icon: 'computer',
    color: '#3B82F6'
  },
  {
    name: 'Human Resources',
    description:
      'Jobs related to HR management, recruitment, and employee relations',
    icon: 'users',
    color: '#10B981'
  },
  {
    name: 'Finance',
    description: 'Jobs related to accounting, banking, and financial services',
    icon: 'dollar-sign',
    color: '#F59E0B'
  },
  {
    name: 'Marketing',
    description:
      'Jobs related to advertising, digital marketing, and brand management',
    icon: 'megaphone',
    color: '#EF4444'
  },
  {
    name: 'Operations',
    description:
      'Jobs related to business operations, logistics, and supply chain',
    icon: 'settings',
    color: '#8B5CF6'
  },
  {
    name: 'Administration',
    description:
      'Jobs related to office administration, clerical work, and support',
    icon: 'file-text',
    color: '#6B7280'
  },
  {
    name: 'Healthcare',
    description:
      'Jobs related to medical services, nursing, and healthcare administration',
    icon: 'heart',
    color: '#EC4899'
  },
  {
    name: 'Education',
    description: 'Jobs related to teaching, training, and educational services',
    icon: 'book-open',
    color: '#06B6D4'
  }
];

async function populateDatabase() {
  try {
    // Connect to MongoDB

    await mongoose.connect(
      'mongodb+srv://mdexter958:ZG6jgxXwd6xPedTn@cluster0.fldfxcv.mongodb.net/intelihire?retryWrites=true&w=majority&appName=Cluster0',
      {
        useNewUrlParser: true,
        useUnifiedTopology: true
      }
    );

    console.log('Connected to MongoDB');

    // Clear existing data
    await Company.deleteMany({});
    await JobCategory.deleteMany({});
    await Job.deleteMany({});

    console.log('Cleared existing data');

    // Insert sample companies
    const companies = await Company.insertMany(sampleCompanies);
    console.log(`Inserted ${companies.length} companies`);

    // Insert sample categories
    const categories = await JobCategory.insertMany(sampleCategories);
    console.log(`Inserted ${categories.length} job categories`);

    // Create sample jobs
    const sampleJobs = [
      {
        title: 'Software Developer',
        companyId: companies[1]._id, // Tech Solutions Inc.
        categoryId: categories[0]._id, // Information Technology
        description:
          'We are looking for a skilled software developer to join our team.',
        responsibilities:
          'Develop and maintain web applications, collaborate with team members, write clean and efficient code.',
        requirements:
          "Bachelor's degree in Computer Science or related field, 2+ years of experience in web development.",
        benefits:
          'Competitive salary, health insurance, flexible work hours, remote work options.',
        location: 'Makati, Metro Manila',
        employmentType: 'Full-time',
        salaryMin: 45000,
        salaryMax: 65000,
        salaryCurrency: 'PHP',
        salaryPeriod: 'monthly',
        experienceLevel: 'Mid-Level',
        experienceYearsMin: 2,
        experienceYearsMax: 5,
        educationLevel: 'Bachelor',
        skills: ['JavaScript', 'React', 'Node.js', 'MongoDB', 'Git'],
        eligibility: ['PRC License (if applicable)'],
        postedDate: new Date('2024-01-15'),
        expiryDate: new Date('2024-02-15'),
        status: 'active',
        isFeatured: true,
        isUrgent: false,
        allowsRemote: true,
        department: 'IT Department',
        positionCount: 2,
        viewCount: 45,
        applicationCount: 12
      },
      {
        title: 'HR Manager',
        companyId: companies[0]._id, // Sto. Tomas Municipal Government
        categoryId: categories[1]._id, // Human Resources
        description:
          'Manage human resources operations for the municipal government.',
        responsibilities:
          'Oversee recruitment, employee relations, performance management, and HR policies.',
        requirements:
          "Bachelor's degree in HR or related field, 5+ years of HR experience, government experience preferred.",
        benefits:
          'Government benefits, job security, career growth opportunities.',
        location: 'Sto. Tomas, Batangas',
        employmentType: 'Full-time',
        salaryMin: 35000,
        salaryMax: 45000,
        salaryCurrency: 'PHP',
        salaryPeriod: 'monthly',
        experienceLevel: 'Senior',
        experienceYearsMin: 5,
        experienceYearsMax: 8,
        educationLevel: 'Bachelor',
        skills: [
          'HR Management',
          'Recruitment',
          'Employee Relations',
          'Labor Laws'
        ],
        eligibility: ['Civil Service Eligibility'],
        postedDate: new Date('2024-01-10'),
        expiryDate: new Date('2024-02-10'),
        status: 'active',
        isFeatured: false,
        isUrgent: true,
        allowsRemote: false,
        department: 'Human Resources',
        positionCount: 1,
        viewCount: 78,
        applicationCount: 23
      },
      {
        title: 'Financial Analyst',
        companyId: companies[1]._id, // Tech Solutions Inc.
        categoryId: categories[2]._id, // Finance
        description:
          'Analyze financial data and provide insights for business decisions.',
        responsibilities:
          'Prepare financial reports, analyze trends, provide recommendations, assist in budgeting.',
        requirements:
          "Bachelor's degree in Finance or Accounting, 3+ years of experience, strong analytical skills.",
        benefits:
          'Competitive salary, performance bonuses, professional development.',
        location: 'Makati, Metro Manila',
        employmentType: 'Full-time',
        salaryMin: 40000,
        salaryMax: 55000,
        salaryCurrency: 'PHP',
        salaryPeriod: 'monthly',
        experienceLevel: 'Mid-Level',
        experienceYearsMin: 3,
        experienceYearsMax: 6,
        educationLevel: 'Bachelor',
        skills: [
          'Financial Analysis',
          'Excel',
          'Financial Modeling',
          'Accounting'
        ],
        eligibility: ['CPA License preferred'],
        postedDate: new Date('2024-01-20'),
        expiryDate: new Date('2024-02-20'),
        status: 'draft',
        isFeatured: false,
        isUrgent: false,
        allowsRemote: false,
        department: 'Finance',
        positionCount: 1,
        viewCount: 0,
        applicationCount: 0
      },
      {
        title: 'Marketing Specialist',
        companyId: companies[2]._id, // Healthcare Plus
        categoryId: categories[3]._id, // Marketing
        description:
          'Develop and execute marketing strategies for healthcare services.',
        responsibilities:
          'Create marketing campaigns, manage social media, analyze market trends, coordinate with sales team.',
        requirements:
          "Bachelor's degree in Marketing or related field, 2+ years of experience, healthcare industry knowledge preferred.",
        benefits: 'Health benefits, flexible schedule, creative environment.',
        location: 'Quezon City, Metro Manila',
        employmentType: 'Full-time',
        salaryMin: 35000,
        salaryMax: 48000,
        salaryCurrency: 'PHP',
        salaryPeriod: 'monthly',
        experienceLevel: 'Junior',
        experienceYearsMin: 2,
        experienceYearsMax: 4,
        educationLevel: 'Bachelor',
        skills: [
          'Digital Marketing',
          'Social Media',
          'Content Creation',
          'Analytics'
        ],
        eligibility: [],
        postedDate: new Date('2024-01-05'),
        expiryDate: new Date('2024-02-05'),
        status: 'closed',
        isFeatured: false,
        isUrgent: false,
        allowsRemote: true,
        department: 'Marketing',
        positionCount: 1,
        viewCount: 156,
        applicationCount: 34
      },
      {
        title: 'Administrative Assistant',
        companyId: companies[0]._id, // Sto. Tomas Municipal Government
        categoryId: categories[5]._id, // Administration
        description: 'Provide administrative support to government offices.',
        responsibilities:
          'Handle correspondence, maintain records, assist with office operations, customer service.',
        requirements:
          'High school diploma or equivalent, 1+ year of administrative experience, good communication skills.',
        benefits:
          'Government benefits, stable employment, training opportunities.',
        location: 'Sto. Tomas, Batangas',
        employmentType: 'Full-time',
        salaryMin: 18000,
        salaryMax: 25000,
        salaryCurrency: 'PHP',
        salaryPeriod: 'monthly',
        experienceLevel: 'Entry Level',
        experienceYearsMin: 1,
        experienceYearsMax: 3,
        educationLevel: 'High School',
        skills: [
          'Office Administration',
          'Microsoft Office',
          'Customer Service',
          'Record Keeping'
        ],
        eligibility: ['Civil Service Eligibility'],
        postedDate: new Date('2024-01-12'),
        expiryDate: new Date('2024-02-12'),
        status: 'active',
        isFeatured: false,
        isUrgent: false,
        allowsRemote: false,
        department: 'Administration',
        positionCount: 3,
        viewCount: 89,
        applicationCount: 45
      }
    ];

    // Insert sample jobs
    const jobs = await Job.insertMany(sampleJobs);
    console.log(`Inserted ${jobs.length} jobs`);

    console.log('Database populated successfully!');
    console.log('\nSample Companies:');
    companies.forEach(company => {
      console.log(`- ${company.name} (ID: ${company._id})`);
    });

    console.log('\nSample Categories:');
    categories.forEach(category => {
      console.log(`- ${category.name} (ID: ${category._id})`);
    });

    console.log('\nSample Jobs:');
    jobs.forEach(job => {
      console.log(
        `- ${job.title} (${job.status}) - ${job.applicationCount} applications`
      );
    });
  } catch (error) {
    console.error('Error populating database:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Run the script
populateDatabase();
