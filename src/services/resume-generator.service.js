const { GoogleGenerativeAI } = require('@google/generative-ai');
const { rateLimiter } = require('../utils/gemini-rate-limiter');

// Initialize GoogleGenerativeAI
console.log('🔑 GEMINI_API_KEY exists:', !!process.env.GEMINI_API_KEY);
console.log(
  '🔑 GEMINI_API_KEY length:',
  process.env.GEMINI_API_KEY?.length || 0
);

if (!process.env.GEMINI_API_KEY) {
  throw new Error('GEMINI_API_KEY environment variable is not set');
}

let genAI, model;
try {
  genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  // Using gemini-1.5-flash for better rate limits
  model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-lite-preview' });

  console.log('🤖 GoogleGenerativeAI initialized:', !!genAI);
  console.log('🤖 Model initialized:', !!model);
} catch (error) {
  console.error('❌ Error initializing GoogleGenerativeAI:', error);
  throw error;
}

class ResumeGeneratorService {
  constructor() {
    this.genAI = genAI;
    this.model = model;
  }

  async generateResumeFromPds(
    pdsData,
    targetIndustry = 'General',
    targetRole = 'Professional'
  ) {
    try {
      console.log('🎯 Starting resume generation from PDS data...');
      console.log('📊 Target industry:', targetIndustry);
      console.log('📊 Target role:', targetRole);

      // Check if model is available
      if (!this.model) {
        throw new Error('GoogleGenerativeAI model is not initialized');
      }

      const improvedResumePrompt = `You are an expert resume writer and ATS optimization specialist. Convert the following JSON data into a structured JSON resume format that can then be rendered into multiple formats (markdown, HTML, PDF, Word).

## Requirements:

### Output Format:
Return a structured JSON object with the following schema:

{
  "metadata": {
    "generatedAt": "ISO date string",
    "atsOptimized": true,
    "targetIndustry": "string",
    "keywordCount": number
  },
  "personalInfo": {
    "fullName": "string",
    "email": "string", 
    "phone": "string",
    "address": "string",
    "linkedin": "string (optional)",
    "portfolio": "string (optional)",
    "professionalTitle": "string"
  },
  "professionalSummary": "3-4 sentence summary highlighting key qualifications",
  "coreCompetencies": [
    "skill 1", "skill 2", "skill 3"... (8-12 items)
  ],
  "technicalSkills": {
    "programmingLanguages": ["language1", "language2"],
    "frameworks": ["framework1", "framework2"], 
    "databases": ["db1", "db2"],
    "tools": ["tool1", "tool2"],
    "platforms": ["platform1", "platform2"]
  },
  "workExperience": [
    {
      "position": "Job Title",
      "company": "Company Name",
      "location": "City, State/Country",
      "startDate": "MM/YYYY",
      "endDate": "MM/YYYY or Present", 
      "isCurrentRole": boolean,
      "achievements": [
        "Achievement 1 with quantifiable results",
        "Achievement 2 with metrics",
        "Achievement 3 with impact"
      ],
      "technologies": ["tech1", "tech2"],
      "keyResponsibilities": ["responsibility1", "responsibility2"]
    }
  ],
  "education": [
    {
      "degree": "Degree Name",
      "institution": "School Name", 
      "location": "City, State/Country",
      "graduationYear": "YYYY",
      "honors": "string (optional)",
      "relevantCourses": ["course1", "course2"] 
    }
  ],
  "certifications": [
    {
      "name": "Certification Name",
      "issuer": "Issuing Organization",
      "dateObtained": "MM/YYYY", 
      "expiryDate": "MM/YYYY (optional)",
      "credentialId": "string (optional)"
    }
  ],
  "projects": [
    {
      "name": "Project Name",
      "description": "Brief description",
      "technologies": ["tech1", "tech2"],
      "achievements": ["achievement1", "achievement2"],
      "url": "string (optional)"
    }
  ],
  "volunteerWork": [
    {
      "organization": "Organization Name",
      "position": "Volunteer Position",
      "startDate": "MM/YYYY",
      "endDate": "MM/YYYY or Present",
      "description": "Brief description of work",
      "achievements": ["achievement1", "achievement2"]
    }
  ],
  "awards": [
    {
      "name": "Award Name", 
      "issuer": "Issuing Organization",
      "date": "MM/YYYY",
      "description": "Brief description"
    }
  ],
  "languages": [
    {
      "language": "Language Name",
      "proficiency": "Native/Fluent/Conversational/Basic"
    }
  ],
  "atsOptimization": {
    "industryKeywords": ["keyword1", "keyword2"],
    "keywordDensity": {
      "primary": ["keyword1", "keyword2"],
      "secondary": ["keyword3", "keyword4"] 
    },
    "atsScore": number (1-100),
    "suggestions": ["suggestion1", "suggestion2"]
  }
}

### Content Enhancement Guidelines:
- Transform job descriptions into achievement-focused bullet points
- Add relevant keywords for the target industry/role  
- Quantify accomplishments with numbers, percentages, or metrics
- Use strong action verbs (managed, developed, implemented, led, optimized)
- Ensure logical flow and professional language
- Fill in reasonable assumptions for missing standard information
- Make content keyword-rich for ATS scanning while maintaining readability
- Include modern technologies and industry-standard tools

### ATS Optimization:
- Include industry-relevant keywords naturally throughout
- Use standard job titles and skill names
- Ensure consistent formatting and terminology
- Add technical skills based on educational background and experience
- Include certifications and continuous learning indicators

### Target Industry Context:
- Industry: ${targetIndustry}
- Target Role: ${targetRole}
- Optimize content for this specific industry and role requirements

## Input JSON Data:
${JSON.stringify(pdsData, null, 2)}

Please convert this data into the structured JSON format above, following all enhancement guidelines. Return ONLY the JSON object as output.`;

      console.log(
        '🤖 Processing with GoogleGenerativeAI for resume generation...'
      );

      // Generate content using Gemini with rate limiting
      const responseText = await rateLimiter.executeWithRetry(
        async () => {
          const result = await this.model.generateContent(improvedResumePrompt);
          return result.response.text();
        },
        'Resume generation from PDS'
      );

      console.log('✅ Received response from Gemini for resume generation');

      // Parse the JSON response
      let resumeData;
      try {
        // Clean the response text to extract JSON
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          resumeData = JSON.parse(jsonMatch[0]);
        } else {
          resumeData = JSON.parse(responseText);
        }
      } catch (parseError) {
        console.error(
          '⚠️ Failed to parse Gemini response as JSON:',
          parseError
        );
        console.error('Raw response:', responseText);
        throw new Error('Failed to parse resume data from AI response');
      }

      console.log('✅ Successfully generated resume data');
      console.log('📊 Resume sections:', Object.keys(resumeData));

      return resumeData;
    } catch (error) {
      console.error('❌ Error generating resume from PDS:', error);
      throw error;
    }
  }

  async generateResumeVariants(
    pdsData,
    industries = ['Technology', 'Healthcare', 'Finance', 'Education']
  ) {
    try {
      console.log('🎯 Generating resume variants for multiple industries...');

      const variants = {};

      for (const industry of industries) {
        try {
          console.log(`📝 Generating resume for ${industry} industry...`);
          const resume = await this.generateResumeFromPds(
            pdsData,
            industry,
            'Professional'
          );
          variants[industry] = resume;
          console.log(`✅ Generated resume for ${industry}`);
        } catch (error) {
          console.error(`❌ Failed to generate resume for ${industry}:`, error);
          variants[industry] = { error: error.message };
        }
      }

      return variants;
    } catch (error) {
      console.error('❌ Error generating resume variants:', error);
      throw error;
    }
  }

  async optimizeResumeForJob(
    resumeData,
    jobDescription,
    jobTitle,
    companyName
  ) {
    try {
      console.log('🎯 Optimizing resume for specific job...');
      console.log('📊 Job title:', jobTitle);
      console.log('📊 Company:', companyName);

      const optimizationPrompt = `You are an expert resume optimization specialist. Optimize the following resume data for a specific job application.

## Job Details:
- Job Title: ${jobTitle}
- Company: ${companyName}
- Job Description: ${jobDescription}

## Current Resume Data:
${JSON.stringify(resumeData, null, 2)}

## Optimization Requirements:
1. Extract key skills and requirements from the job description
2. Reorder and emphasize relevant experience
3. Add job-specific keywords naturally
4. Quantify achievements where possible
5. Highlight transferable skills
6. Optimize professional summary for this specific role
7. Ensure ATS compatibility

## Output:
Return the optimized resume in the same JSON format, with enhanced content tailored for this specific job application.

Return ONLY the JSON object as output.`;

      console.log('🤖 Processing optimization with GoogleGenerativeAI...');

      const responseText = await rateLimiter.executeWithRetry(
        async () => {
          const result = await this.model.generateContent(optimizationPrompt);
          return result.response.text();
        },
        'Resume optimization for job'
      );

      console.log('✅ Received optimization response from Gemini');

      // Parse the JSON response
      let optimizedResume;
      try {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          optimizedResume = JSON.parse(jsonMatch[0]);
        } else {
          optimizedResume = JSON.parse(responseText);
        }
      } catch (parseError) {
        console.error(
          '⚠️ Failed to parse optimization response as JSON:',
          parseError
        );
        throw new Error(
          'Failed to parse optimized resume data from AI response'
        );
      }

      console.log('✅ Successfully optimized resume for job application');

      return optimizedResume;
    } catch (error) {
      console.error('❌ Error optimizing resume for job:', error);
      throw error;
    }
  }
}

// Create service instance
const resumeService = new ResumeGeneratorService();

// Export standalone functions for direct use
async function generateResumeFromPds(
  pdsData,
  targetIndustry = 'General',
  targetRole = 'Professional'
) {
  return await resumeService.generateResumeFromPds(
    pdsData,
    targetIndustry,
    targetRole
  );
}

async function generateResumeVariants(
  pdsData,
  industries = ['Technology', 'Healthcare', 'Finance', 'Education']
) {
  return await resumeService.generateResumeVariants(pdsData, industries);
}

async function optimizeResumeForJob(
  resumeData,
  jobDescription,
  jobTitle,
  companyName
) {
  return await resumeService.optimizeResumeForJob(
    resumeData,
    jobDescription,
    jobTitle,
    companyName
  );
}

module.exports = {
  default: resumeService,
  generateResumeFromPds,
  generateResumeVariants,
  optimizeResumeForJob
};
