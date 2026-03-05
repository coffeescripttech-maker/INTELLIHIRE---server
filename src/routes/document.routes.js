const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { auth, authorize } = require('../middleware/auth.middleware');
const Document = require('../models/document.model');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pdsParser = require('../services/pds-parser.service');
const PdsExtractedData = require('../models/pdsExtractedData.model');
const Resume = require('../models/resume.model');
const {
  generateResumeFromPds,
  generateResumeVariants,
  optimizeResumeForJob
} = require('../services/resume-generator.service');

async function isImageOnlyPDF(buffer, threshold = 0.8) {
  // Dynamically import the ESM module
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

  // Convert Node Buffer -> Uint8Array
  const uint8Array = new Uint8Array(buffer);

  const pdf = await pdfjsLib.getDocument({ data: uint8Array }).promise;
  const totalPages = pdf.numPages;
  let imageOnlyPages = 0;

  for (let i = 1; i <= totalPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    if (textContent.items.length === 0) {
      imageOnlyPages++;
    }
  }

  const ratio = imageOnlyPages / totalPages;
  console.log(`PDF: ${imageOnlyPages}/${totalPages} pages have no text`);
  return ratio >= threshold;
}

/**
 * PDS Data Processing Pipeline:
 * 1. PDF → Images (using pdf-poppler)
 * 2. Images → OpenAI Vision API → Raw JSON
 * 3. Clean malformed responses (cleanOpenAIResponse)
 * 4. Normalize structure (normalizePdsStructure)
 * 5. Save to Document.parsedData (original cleaned data)
 * 6. Save to PdsExtractedData.data (normalized structure)
 *
 * Files saved for debugging:
 * - extracted.json: Raw OpenAI responses
 * - parsed_pages.json: Parsed JSON from each page
 * - merged_pds.json: Combined data from all pages
 * - cleaned_data.json: Data after cleaning malformed responses
 * - normalized_data.json: Final uniform structure for database
 */

// Helper function to clean malformed OpenAI responses
const cleanOpenAIResponse = data => {
  if (!data || typeof data !== 'object') return data;

  const cleaned = {};

  for (const [key, value] of Object.entries(data)) {
    if (Array.isArray(value)) {
      // Clean array values
      cleaned[key] = value.map(item => {
        if (typeof item === 'string' && item.includes('\\n')) {
          // This is a malformed string, try to extract the actual data
          try {
            // Remove escape characters and try to parse
            const cleanedStr = item
              .replace(/\\n/g, '\n')
              .replace(/\\"/g, '"')
              .replace(/\\'/g, "'")
              .replace(/\\t/g, '\t');

            // Try to extract content between square brackets or braces
            const arrayMatch = cleanedStr.match(/\[([\s\S]*)\]/);
            if (arrayMatch) {
              const content = arrayMatch[1];
              // Extract individual items
              const items = content
                .split(',')
                .map(item => item.trim().replace(/^['"]|['"]$/g, ''))
                .filter(item => item && item !== 'null');
              return items;
            }

            // If no array found, try to extract object properties
            const objMatch = cleanedStr.match(/\{([\s\S]*)\}/);
            if (objMatch) {
              const content = objMatch[1];
              const properties = {};
              const propRegex = /(\w+):\s*\[([^\]]*)\]/g;
              let match;
              while ((match = propRegex.exec(content)) !== null) {
                const key = match[1];
                const values = match[2]
                  .split(',')
                  .map(v => v.trim().replace(/^['"]|['"]$/g, ''))
                  .filter(v => v && v !== 'null');
                properties[key] = values;
              }
              return properties;
            }

            return item; // Return original if can't parse
          } catch (e) {
            console.log('⚠️ Failed to clean malformed string:', item);
            return item;
          }
        }
        return item;
      });
    } else if (typeof value === 'object' && value !== null) {
      // Recursively clean nested objects
      cleaned[key] = cleanOpenAIResponse(value);
    } else {
      cleaned[key] = value;
    }
  }

  return cleaned;
};

// Helper function to normalize PDS data structure for consistent database storage
const normalizePdsStructure = data => {
  if (!data || typeof data !== 'object') return data;

  // Define the expected uniform structure
  const normalized = {
    personalInformation: {
      firstName: '',
      lastName: '',
      middleName: '',
      nameExtension: '',
      dateOfBirth: '',
      placeOfBirth: '',
      sex: '',
      civilStatus: '',
      citizenship: {
        type: '',
        dualBy: null,
        country: null
      },
      heightCm: '',
      weightKg: '',
      bloodType: '',
      gsisIdNo: '',
      pagIbigIdNo: '',
      philHealthNo: '',
      sssNo: '',
      tin: '',
      agencyEmployeeNo: '',
      emailAddress: '',
      mobileNo: '',
      telephoneNo: '',
      residentialAddress: {
        houseLotBlockNo: '',
        street: '',
        subdivisionVillage: '',
        barangay: '',
        cityMunicipality: '',
        province: '',
        zipCode: ''
      },
      permanentAddress: {
        houseLotBlockNo: '',
        street: '',
        subdivisionVillage: '',
        barangay: '',
        cityMunicipality: '',
        province: '',
        zipCode: ''
      }
    },
    familyBackground: {
      spouse: {
        firstName: '',
        lastName: '',
        middleName: '',
        nameExtension: '',
        occupation: '',
        businessName: '',
        businessAddress: '',
        telephoneNo: ''
      },
      father: {
        firstName: '',
        lastName: '',
        middleName: '',
        nameExtension: ''
      },
      motherMaidenName: {
        firstName: '',
        lastName: '',
        middleName: '',
        nameExtension: ''
      }
    },
    educationalBackground: [],
    civilServiceEligibility: [],
    workExperience: [],
    voluntaryWork: [],
    trainings: [],
    skills: [],
    recognitions: [],
    memberships: [],
    references: []
  };

  // Map the cleaned data to the normalized structure
  // Handle both snake_case (from Gemini) and camelCase (legacy) field names

  // Personal Information mapping
  const personalData =
    data.personal_information || data.personalInformation || data.personalInfo;
  if (personalData) {
    normalized.personalInformation.firstName =
      personalData.first_name || personalData.firstName || '';
    normalized.personalInformation.lastName =
      personalData.surname || personalData.lastName || '';
    normalized.personalInformation.middleName =
      personalData.middle_name || personalData.middleName || '';
    normalized.personalInformation.dateOfBirth =
      personalData.date_of_birth || personalData.dateOfBirth || '';
    normalized.personalInformation.placeOfBirth =
      personalData.place_of_birth || personalData.placeOfBirth || '';
    normalized.personalInformation.sex = personalData.sex || '';
    normalized.personalInformation.civilStatus =
      personalData.civil_status || personalData.civilStatus || '';
    normalized.personalInformation.heightCm =
      personalData.height || personalData.heightCm || '';
    normalized.personalInformation.weightKg =
      personalData.weight || personalData.weightKg || '';
    normalized.personalInformation.bloodType =
      personalData.blood_type || personalData.bloodType || '';
    normalized.personalInformation.gsisIdNo =
      personalData.gsis_id_no || personalData.gsisIdNo || '';
    normalized.personalInformation.pagIbigIdNo =
      personalData.pag_ibig_id_no || personalData.pagIbigIdNo || '';
    normalized.personalInformation.philHealthNo =
      personalData.philhealth_no || personalData.philHealthNo || '';
    normalized.personalInformation.sssNo =
      personalData.sss_no || personalData.sssNo || '';
    normalized.personalInformation.tin =
      personalData.tin_no || personalData.tin || '';
    normalized.personalInformation.agencyEmployeeNo =
      personalData.agency_employee_no || personalData.agencyEmployeeNo || '';
    normalized.personalInformation.emailAddress =
      personalData.email_address || personalData.emailAddress || '';
    normalized.personalInformation.mobileNo =
      personalData.mobile_no || personalData.mobileNo || '';
    normalized.personalInformation.telephoneNo =
      personalData.telephone_no || personalData.telephoneNo || '';

    // Handle citizenship
    if (personalData.citizenship) {
      if (typeof personalData.citizenship === 'string') {
        normalized.personalInformation.citizenship.type =
          personalData.citizenship;
      } else if (personalData.citizenship.type) {
        normalized.personalInformation.citizenship.type =
          personalData.citizenship.type;
      }
    }

    // Handle addresses
    const residentialAddr =
      personalData.residential_address || personalData.residentialAddress;
    if (residentialAddr) {
      normalized.personalInformation.residentialAddress.houseLotBlockNo =
        residentialAddr.house_block_lot ||
        residentialAddr.houseLotBlockNo ||
        '';
      normalized.personalInformation.residentialAddress.street =
        residentialAddr.street || '';
      normalized.personalInformation.residentialAddress.subdivisionVillage =
        residentialAddr.subdivision_village ||
        residentialAddr.subdivisionVillage ||
        '';
      normalized.personalInformation.residentialAddress.barangay =
        residentialAddr.barangay || '';
      normalized.personalInformation.residentialAddress.cityMunicipality =
        residentialAddr.city_municipality ||
        residentialAddr.cityMunicipality ||
        '';
      normalized.personalInformation.residentialAddress.province =
        residentialAddr.province || '';
      normalized.personalInformation.residentialAddress.zipCode =
        residentialAddr.zip_code || residentialAddr.zipCode || '';
    }

    const permanentAddr =
      personalData.permanent_address || personalData.permanentAddress;
    if (permanentAddr) {
      normalized.personalInformation.permanentAddress.houseLotBlockNo =
        permanentAddr.house_block_lot || permanentAddr.houseLotBlockNo || '';
      normalized.personalInformation.permanentAddress.street =
        permanentAddr.street || '';
      normalized.personalInformation.permanentAddress.subdivisionVillage =
        permanentAddr.subdivision_village ||
        permanentAddr.subdivisionVillage ||
        '';
      normalized.personalInformation.permanentAddress.barangay =
        permanentAddr.barangay || '';
      normalized.personalInformation.permanentAddress.cityMunicipality =
        permanentAddr.city_municipality || permanentAddr.cityMunicipality || '';
      normalized.personalInformation.permanentAddress.province =
        permanentAddr.province || '';
      normalized.personalInformation.permanentAddress.zipCode =
        permanentAddr.zip_code || permanentAddr.zipCode || '';
    }
  }

  // Family Background mapping
  const familyData =
    data.family_background || data.familyBackground || data.family;
  if (familyData) {
    if (familyData.spouse) {
      normalized.familyBackground.spouse.firstName =
        familyData.spouse.first_name || familyData.spouse.firstName || '';
      normalized.familyBackground.spouse.lastName =
        familyData.spouse.surname || familyData.spouse.lastName || '';
      normalized.familyBackground.spouse.middleName =
        familyData.spouse.middle_name || familyData.spouse.middleName || '';
      normalized.familyBackground.spouse.occupation =
        familyData.spouse.occupation || '';
      normalized.familyBackground.spouse.businessName =
        familyData.spouse.employer_business_name ||
        familyData.spouse.businessName ||
        '';
      normalized.familyBackground.spouse.businessAddress =
        familyData.spouse.business_address ||
        familyData.spouse.businessAddress ||
        '';
      normalized.familyBackground.spouse.telephoneNo =
        familyData.spouse.telephone_no || familyData.spouse.telephoneNo || '';
    }

    if (familyData.father) {
      normalized.familyBackground.father.firstName =
        familyData.father.first_name || familyData.father.firstName || '';
      normalized.familyBackground.father.lastName =
        familyData.father.surname || familyData.father.lastName || '';
      normalized.familyBackground.father.middleName =
        familyData.father.middle_name || familyData.father.middleName || '';
    }

    if (familyData.mother || familyData.motherMaidenName) {
      const motherData = familyData.mother || familyData.motherMaidenName;
      normalized.familyBackground.motherMaidenName.firstName =
        motherData.first_name || motherData.firstName || '';
      normalized.familyBackground.motherMaidenName.lastName =
        motherData.surname || motherData.lastName || '';
      normalized.familyBackground.motherMaidenName.middleName =
        motherData.middle_name || motherData.middleName || '';
    }

    if (familyData.children && Array.isArray(familyData.children)) {
      normalized.familyBackground.children = familyData.children;
    }
  }

  // Educational Background mapping
  const educationData =
    data.educational_background || data.educationalBackground || data.education;
  if (Array.isArray(educationData)) {
    normalized.educationalBackground = educationData.map(edu => ({
      level: edu.level || '',
      nameOfSchool: edu.school_name || edu.nameOfSchool || '',
      basicEducationDegreeCourse:
        edu.basic_education_degree_course ||
        edu.basicEducationDegreeCourse ||
        '',
      periodOfAttendance: {
        from: edu.period_attendance?.from || edu.periodOfAttendance?.from || '',
        to: edu.period_attendance?.to || edu.periodOfAttendance?.to || ''
      },
      yearGraduated: edu.year_graduated || edu.yearGraduated || '',
      scholarshipAcademicHonorsReceived:
        edu.scholarship_academic_honors ||
        edu.scholarshipAcademicHonorsReceived ||
        ''
    }));
  }

  // Civil Service Eligibility mapping
  const civilServiceData =
    data.civil_service_eligibility ||
    data.civilServiceEligibility ||
    data.civilService;
  if (Array.isArray(civilServiceData)) {
    normalized.civilServiceEligibility = civilServiceData.map(cs => ({
      careerServiceOrEligibility:
        cs.career_service || cs.careerServiceOrEligibility || '',
      rating: cs.rating || '',
      dateOfExaminationConferment:
        cs.date_of_examination || cs.dateOfExaminationConferment || '',
      placeOfExaminationConferment:
        cs.place_of_examination || cs.placeOfExaminationConferment || '',
      licenseNumber: cs.license_number || cs.licenseNumber || ''
    }));
  }

  // Work Experience mapping
  const workData = data.work_experience || data.workExperience;
  if (Array.isArray(workData)) {
    normalized.workExperience = workData.map(work => ({
      positionTitle: work.position_title || work.positionTitle || '',
      departmentAgencyOfficeCompany:
        work.department_agency_office_company ||
        work.departmentAgencyOfficeCompany ||
        '',
      from: work.inclusive_dates?.from || work.from || '',
      to: work.inclusive_dates?.to || work.to || '',
      monthlySalary: work.monthly_salary || work.monthlySalary || 0,
      salaryJobPayGradeStep:
        work.salary_job_pay_grade || work.salaryJobPayGradeStep || '',
      statusOfAppointment:
        work.status_of_appointment || work.statusOfAppointment || '',
      governmentService:
        work.govt_service === 'Y' || work.governmentService === true
    }));
  }

  // Voluntary Work mapping
  const voluntaryData = data.voluntary_work || data.voluntaryWork;
  if (Array.isArray(voluntaryData)) {
    normalized.voluntaryWork = voluntaryData.map(vol => ({
      nameAndAddress: vol.name_address_organization || vol.nameAndAddress || '',
      positionNatureOfWork:
        vol.position_nature_of_work || vol.positionNatureOfWork || '',
      from: vol.inclusive_dates?.from || vol.from || '',
      to: vol.inclusive_dates?.to || vol.to || '',
      numberOfHours: vol.number_of_hours || vol.numberOfHours || ''
    }));
  }

  // Learning and Development mapping
  const trainingData =
    data.learning_and_development || data.trainings || data.training;
  if (Array.isArray(trainingData)) {
    normalized.trainings = trainingData.map(train => ({
      title: train.title || '',
      typeOfLd: train.type_of_ld || train.typeOfLd || '',
      conductedSponsoredBy:
        train.conducted_sponsored_by || train.conductedSponsoredBy || '',
      from: train.inclusive_dates?.from || train.from || '',
      to: train.inclusive_dates?.to || train.to || '',
      numberOfHours: train.number_of_hours || train.numberOfHours || ''
    }));
  }

  // Other Information mapping (skills, recognitions, memberships)
  const otherData = data.other_information || data.otherInformation;
  if (otherData) {
    // Skills
    if (otherData.special_skills_hobbies) {
      normalized.skills = otherData.special_skills_hobbies
        .split(',')
        .map(s => s.trim())
        .filter(s => s);
    } else if (Array.isArray(data.skills)) {
      normalized.skills = data.skills;
    }

    // Recognitions
    if (otherData.non_academic_distinctions) {
      normalized.recognitions = otherData.non_academic_distinctions
        .split(',')
        .map(r => r.trim())
        .filter(r => r);
    } else if (Array.isArray(data.recognitions)) {
      normalized.recognitions = data.recognitions;
    }

    // Memberships
    if (otherData.membership_in_organizations) {
      normalized.memberships = otherData.membership_in_organizations
        .split(',')
        .map(m => m.trim())
        .filter(m => m);
    } else if (Array.isArray(data.memberships)) {
      normalized.memberships = data.memberships;
    }
  }

  // References mapping
  const referencesData = data.references;
  if (Array.isArray(referencesData)) {
    normalized.references = referencesData.map(ref => ({
      name: ref.name || '',
      address: ref.address || '',
      contactNumber: ref.telephone_no || ref.contactNumber || ''
    }));
  }

  return normalized;
};

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/documents/';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'doc-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage });

// Middleware for validation
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// Upload document
router.post('/', [auth, upload.single('file')], async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    if (req.file.mimetype === 'application/pdf') {
      // Validate if the PDF is image-only (≥80% pages)
      const buffer = fs.readFileSync(req.file.path);
      const isImageOnly = await isImageOnlyPDF(buffer, 0.8);
      console.log('isImageOnly', isImageOnly);
      if (isImageOnly) {
        return res.status(400).json({
          message:
            'Upload failed: This PDF appears to be image-only (scanned, no selectable/copyable text). Please upload a PDF generated by software (with selectable text).'
        });
      }
    }



    // Save document info to DB, including type
    const doc = new Document({
      userId: req.user._id,
      title: req.file.originalname,
      fileUrl: req.file.path,
      type: req.body.type
    });

      console.log({doc});
      
    await doc.save();

    // --- PDS PDF processing with GoogleGenerativeAI + pdf-parse ---
    if (doc.type === 'pds' && req.file.mimetype === 'application/pdf') {
      const pdf = require('pdf-parse');
      const { GoogleGenerativeAI } = require('@google/generative-ai');
      const { rateLimiter } = require('../utils/gemini-rate-limiter');
      const outputDir = path.join('uploads', 'pds', doc._id.toString());

      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      try {
        console.log('📄 Starting PDS PDF processing...');

        // Read PDF file and extract text
        const dataBuffer = fs.readFileSync(req.file.path);
        const pdfData = await pdf(dataBuffer);
        const rawText = pdfData.text;

        console.log(
          `✅ Extracted text from PDF (${rawText.length} characters)`
        );

        // Initialize GoogleGenerativeAI
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        // Using gemini-1.5-flash for better rate limits
        const model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-lite-preview' });

        // Create the prompt for PDS parsing
        const prompt = `

        Convert the following Personal Data Sheet (PDS) raw text into a structured JSON format. Extract all available information and organize it according to the standard PDS sections. Use null for empty or missing fields, and maintain data types appropriately (strings for text, numbers for numeric values, arrays for lists, objects for nested data).
Structure the JSON with the following main sections:
- personal_information
- family_background
- educational_background
- civil_service_eligibility
- work_experience
- voluntary_work
- learning_and_development
- other_information
- questionnaire_responses
- references
- authentication

For each section, create appropriate nested objects and arrays. For dates, use the format "mm/dd/yyyy" as provided in the source. For salary amounts, extract numeric values. For boolean fields in questionnaire responses, use true/false/null.  

Example structure:
{
  "personal_information": {
    "cs_id_no": null,
    "surname": "string",
    "first_name": "string",
    "middle_name": "string",
    "name_extension": null,
    "date_of_birth": "mm/dd/yyyy",
    "place_of_birth": "string",
    "sex": "Male/Female",
    "civil_status": "string",
    "height": "string",
    "weight": "string",
    "blood_type": "string",
    "gsis_id_no": "string",
    "pag_ibig_id_no": "string",
    "philhealth_no": "string",
    "sss_no": "string",
    "tin_no": "string",
    "agency_employee_no": "string",
    "citizenship": "string",
    "dual_citizenship": null,
    "residential_address": {
      "house_block_lot": "string",
      "street": "string",
      "subdivision_village": "string",
      "barangay": "string",
      "city_municipality": "string",
      "province": "string",
      "zip_code": "string"
    },
    "permanent_address": {
      // same structure as residential_address
    },
    "telephone_no": "string",
    "mobile_no": "string",
    "email_address": "string"
  },
  "family_background": {
    "spouse": {
      "surname": "string",
      "first_name": "string",
      "middle_name": "string",
      "occupation": "string",
      "employer_business_name": "string",
      "business_address": "string",
      "telephone_no": "string"
    },
    "children": [
      {
        "name": "string",
        "date_of_birth": "mm/dd/yyyy"
      }
    ],
    "father": {
      "surname": "string",
      "first_name": "string",
      "middle_name": "string"
    },
    "mother": {
      "maiden_name": "string",
      "surname": "string",
      "first_name": "string",
      "middle_name": "string"
    }
  },
  "educational_background": [
    {
      "level": "ELEMENTARY/SECONDARY/VOCATIONAL/COLLEGE/GRADUATE STUDIES",       
      "school_name": "string",
      "basic_education_degree_course": "string",
      "period_attendance": {
        "from": "mm/dd/yyyy",
        "to": "mm/dd/yyyy"
      },
      "highest_level_units_earned": "string",
      "year_graduated": "yyyy",
      "scholarship_academic_honors": "string"
    }
  ],
  "civil_service_eligibility": [
    {
      "career_service": "string",
      "rating": "string",
      "date_of_examination": "mm/dd/yyyy",
      "place_of_examination": "string",
      "license_number": "string",
      "date_of_validity": "mm/dd/yyyy"
    }
  ],
  "work_experience": [
    {
      "position_title": "string",
      "department_agency_office_company": "string",
      "inclusive_dates": {
        "from": "mm/dd/yyyy",
        "to": "mm/dd/yyyy"
      },
      "monthly_salary": number,
      "salary_job_pay_grade": "string",
      "status_of_appointment": "string",
      "govt_service": "Y/N"
    }
  ],
  "voluntary_work": [
    {
      "name_address_organization": "string",
      "position_nature_of_work": "string",
      "inclusive_dates": {
        "from": "mm/dd/yyyy",
        "to": "mm/dd/yyyy"
      },
      "number_of_hours": "string"
    }
  ],
  "learning_and_development": [
    {
      "title": "string",
      "type_of_ld": "string",
      "conducted_sponsored_by": "string",
      "inclusive_dates": {
        "from": "mm/dd/yyyy",
        "to": "mm/dd/yyyy"
      },
      "number_of_hours": "string"
    }
  ],
  "other_information": {
    "special_skills_hobbies": "string",
    "non_academic_distinctions": "string",
    "membership_in_organizations": "string"
  },
  "questionnaire_responses": {
    "person_with_disability": null,
    "solo_parent": null,
    "member_of_indigenous_group": null,
    "immigrant_permanent_resident": null,
    "related_by_consanguinity_affinity": null,
    "found_guilty_administrative_offense": null,
    "criminally_charged": null,
    "convicted_of_crime": null,
    "candidate_in_election": null,
    "resigned_for_election_campaign": null,
    "separated_from_service": null
  },
  "references": [
    {
      "name": "string",
      "address": "string",
      "telephone_no": "string"
    }
  ],
  "authentication": {
    "date_accomplished": "mm/dd/yyyy",
    "government_issued_id": "string",
    "id_number": "string",
    "date_of_issuance": "mm/dd/yyyy"
  }
}
}

Now convert the following PDS raw text:

${rawText}

Return ONLY the JSON object as output.`;

        console.log('🤖 Processing with Gemini 1.5 Pro...');

        // Generate content using Gemini with rate limiting
        const responseText = await rateLimiter.executeWithRetry(
          async () => {
            const result = await model.generateContent(prompt);
            return result.response.text();
          },
          'PDS parsing'
        );

        console.log('✅ Received response from Gemini');

        // Parse the JSON response
        let parsedData;
        try {
          // Clean the response text to extract JSON
          const jsonMatch = responseText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            parsedData = JSON.parse(jsonMatch[0]);
          } else {
            parsedData = JSON.parse(responseText);
          }
        } catch (parseError) {
          console.error(
            '⚠️ Failed to parse Gemini response as JSON:',
            parseError
          );
          console.error('Raw response:', responseText);
          throw new Error('Failed to parse PDS data from AI response');
        }

        console.log('✅ Successfully parsed PDS data');

        // Clean the parsed data to fix any malformed responses
        console.log('🧹 Cleaning parsed data...');
        const cleanedData = cleanOpenAIResponse(parsedData);

        // Normalize the structure for consistent database storage
        console.log('🔧 Normalizing PDS data structure...');
        const normalizedData = normalizePdsStructure(cleanedData);

        // Save debug files
        const rawResponsePath = path.join(outputDir, 'raw_response.txt');
        const parsedDataPath = path.join(outputDir, 'parsed_data.json');
        const cleanedDataPath = path.join(outputDir, 'cleaned_data.json');
        const normalizedDataPath = path.join(outputDir, 'normalized_data.json');

        fs.writeFileSync(rawResponsePath, responseText, 'utf-8');
        fs.writeFileSync(
          parsedDataPath,
          JSON.stringify(parsedData, null, 2),
          'utf-8'
        );
        fs.writeFileSync(
          cleanedDataPath,
          JSON.stringify(cleanedData, null, 2),
          'utf-8'
        );
        fs.writeFileSync(
          normalizedDataPath,
          JSON.stringify(normalizedData, null, 2),
          'utf-8'
        );

        console.log('📁 Saved debug files:', {
          rawResponse: rawResponsePath,
          parsedData: parsedDataPath,
          cleanedData: cleanedDataPath,
          normalizedData: normalizedDataPath
        });

        // Save the cleaned data to the document (keep original for backward compatibility)
        console.log('💾 Saving cleaned data to Document model...');

        console.log({ cleanedData });
        doc.parsedData = cleanedData;
        const savedDoc = await doc.save();
        console.log(
          '✅ Document saved with parsedData:',
          !!savedDoc.parsedData
        );

        // Remove any existing PDS data for this document to prevent duplicates
        console.log('🗑️ Removing existing PDS data for this document...');
        const deletedCount = await PdsExtractedData.deleteMany({
          userId: doc.userId,
          documentId: doc._id
        });
        console.log(
          `🗑️ Deleted ${deletedCount.deletedCount} existing PDS entries`
        );

        // Save the normalized data to PdsExtractedData collection for consistent structure
        console.log('💾 Creating new PdsExtractedData entry...');
        const pdsExtractedData = await PdsExtractedData.create({
          userId: doc.userId,
          documentId: doc._id,
          data: cleanedData
        });
        console.log(
          '✅ PdsExtractedData created with ID:',
          pdsExtractedData._id
        );

        // Automatically generate and save resume from PDS data
        console.log('🤖 Generating resume from PDS data...');
        try {
          const resumeData = await generateResumeFromPds(
            cleanedData,
            'General',
            'Professional'
          );

          // Save the generated resume to database
          const resume = await Resume.create({
            userId: doc.userId,
            documentId: doc._id,
            resumeData: resumeData,
            metadata: {
              generatedAt: new Date(),
              atsOptimized: true,
              targetIndustry: 'General',
              targetRole: 'Professional',
              keywordCount: resumeData.metadata?.keywordCount || 0,
              atsScore: resumeData.atsOptimization?.atsScore || 0
            },
            status: 'generated'
          });

          console.log('✅ Resume generated and saved with ID:', resume._id);
          console.log(
            '📊 Resume ATS Score:',
            resumeData.atsOptimization?.atsScore || 'N/A'
          );
        } catch (resumeError) {
          console.error('❌ Error generating resume:', resumeError);
          // Don't fail the entire PDS processing if resume generation fails
          console.log(
            '⚠️ Continuing PDS processing despite resume generation error'
          );
        }

        // Verify the data was saved correctly
        console.log('🔍 Verifying saved data...');
        const verifyDoc = await Document.findById(doc._id);
        const verifyPdsData = await PdsExtractedData.findOne({
          userId: doc.userId,
          documentId: doc._id
        });

        console.log('📊 Document verification:', {
          hasParsedData: !!verifyDoc?.parsedData,
          parsedDataKeys: verifyDoc?.parsedData
            ? Object.keys(verifyDoc.parsedData)
            : []
        });

        console.log('📊 PdsExtractedData verification:', {
          found: !!verifyPdsData,
          hasData: !!verifyPdsData?.data,
          dataKeys: verifyPdsData?.data ? Object.keys(verifyPdsData.data) : []
        });

        console.log('✅ Successfully saved PDS data to database');
        console.log('📊 Data structure keys:', Object.keys(normalizedData));
        console.log('📊 Document ID:', doc._id);
        console.log('📊 User ID:', doc.userId);
      } catch (error) {
        console.error('❌ Error processing PDS:', error);
        // Don't fail the entire upload if PDS processing fails
        console.log(
          '⚠️ Continuing with document upload despite PDS processing error'
        );
      }
    }



    // --- Resume/CV processing with GoogleGenerativeAI ---
    if (doc.type === 'resume' && req.file.mimetype === 'application/pdf') {
     
     
      const pdf = require('pdf-parse');
      const { GoogleGenerativeAI } = require('@google/generative-ai');
      const { rateLimiter } = require('../utils/gemini-rate-limiter');
      const outputDir = path.join('uploads', 'resume', doc._id.toString());

      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      try {
        console.log('📄 Starting Resume/CV PDF processing...');

        // Read PDF file and extract text
        const dataBuffer = fs.readFileSync(req.file.path);
        const pdfData = await pdf(dataBuffer);
        const rawText = pdfData.text;

        console.log(
          `✅ Extracted text from Resume/CV (${rawText.length} characters)`
        );

        // Initialize GoogleGenerativeAI
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        // Using gemini-1.5-flash for better rate limits
        const model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-lite-preview' });

        // Create the prompt for Resume parsing and extraction
        const extractPrompt = `
You are an expert Resume/CV parser and ATS specialist. Extract all information from the following resume text and convert it into a structured JSON format.

**IMPORTANT**: Only extract skills that are ACTUALLY present in the resume. Do NOT invent or assume technical skills.

Extract and organize the information into these sections:
- personal_information (name, contact details, address, professional title/headline)
- professional_summary (career summary or objective statement)
- work_experience (job history with positions, companies, dates, responsibilities, achievements)
- education (degrees, institutions, graduation dates, honors)
- skills (ONLY extract skills explicitly mentioned in the resume - for non-technical resumes, focus on soft skills, languages, and professional competencies)
- certifications (professional certifications and licenses)
- projects (if any)
- awards_and_honors (if any)
- volunteer_work (if any)
- references (if any)

Return the data in this JSON structure:
{
  "personal_information": {
    "full_name": "string",
    "email": "string",
    "phone": "string",
    "address": "string",
    "linkedin": "string",
    "portfolio": "string",
    "professional_title": "string"
  },
  "professional_summary": "string",
  "work_experience": [
    {
      "position": "string",
      "company": "string",
      "location": "string",
      "start_date": "MM/YYYY",
      "end_date": "MM/YYYY or Present",
      "responsibilities": ["string"],
      "achievements": ["string"]
    }
  ],
  "education": [
    {
      "degree": "string",
      "institution": "string",
      "location": "string",
      "graduation_year": "YYYY",
      "gpa": "string",
      "honors": "string"
    }
  ],
  "technical_skills": {
    "programming_languages": [],
    "frameworks_libraries": [],
    "tools_platforms": [],
    "databases": [],
    "other": []
  },
  "soft_skills": ["string"],
  "languages": [
    {
      "language": "string",
      "proficiency": "string"
    }
  ],
  "certifications": [
    {
      "name": "string",
      "issuer": "string",
      "date_obtained": "MM/YYYY",
      "credential_id": "string"
    }
  ],
  "projects": [
    {
      "name": "string",
      "description": "string",
      "technologies": ["string"],
      "link": "string"
    }
  ],
  "awards_honors": ["string"],
  "volunteer_work": [
    {
      "organization": "string",
      "role": "string",
      "duration": "string",
      "description": "string"
    }
  ],
  "references": [
    {
      "name": "string",
      "title": "string",
      "company": "string",
      "phone": "string",
      "email": "string"
    }
  ]
}

Resume text to parse:

${rawText}

Return ONLY the JSON object as output.`;

        console.log('🤖 Processing Resume with GoogleGenerativeAI...');

        // Generate content using Gemini with rate limiting
        const extractResponseText = await rateLimiter.executeWithRetry(
          async () => {
            const result = await model.generateContent(extractPrompt);
            return result.response.text();
          },
          'Resume extraction'
        );

        console.log('✅ Received extraction response from Gemini');

        // Parse the JSON response
        let extractedData;
        try {
          const jsonMatch = extractResponseText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            extractedData = JSON.parse(jsonMatch[0]);
          } else {
            extractedData = JSON.parse(extractResponseText);
          }
        } catch (parseError) {
          console.error(
            '⚠️ Failed to parse Gemini response as JSON:',
            parseError
          );
          console.error('Raw response:', extractResponseText);
          throw new Error('Failed to parse resume data from AI response');
        }

        console.log('✅ Successfully extracted resume data');

        // Save extracted data
        const extractedDataPath = path.join(outputDir, 'extracted_data.json');
        fs.writeFileSync(
          extractedDataPath,
          JSON.stringify(extractedData, null, 2),
          'utf-8'
        );

        // Now generate ATS-optimized version

        const atsPrompt = `
You are an ATS (Applicant Tracking System) optimization expert. Create an ATS-compliant, professionally formatted resume from the following extracted resume data.

**CRITICAL**: Only include technical skills (programming languages, frameworks, databases, etc.) if they are ACTUALLY present in the extracted data. For non-technical resumes, focus on soft skills, professional competencies, and industry-specific skills instead.

Guidelines for ATS optimization:
1. Use clear, standard section headings (e.g., "Professional Experience", "Education", "Skills")
2. Include industry-relevant keywords and action verbs
3. Format dates consistently (MM/YYYY format)
4. Use bullet points for clarity
5. Quantify achievements where possible (numbers, percentages, metrics)
6. Optimize professional summary with target keywords
7. Group skills by category for better parsing
8. Ensure proper formatting for ATS parsing (avoid tables, images, complex formatting)
9. **Do NOT fabricate or add technical skills that are not in the original resume**

Extracted resume data:
${JSON.stringify(extractedData, null, 2)}

Generate an ATS-optimized resume in this JSON structure:
{
  "personalInfo": {
    "fullName": "string",
    "professionalTitle": "string",
    "email": "string",
    "phone": "string",
    "address": "string",
    "linkedin": "string",
    "portfolio": "string"
  },
  "professionalSummary": "ATS-optimized professional summary with keywords (2-3 sentences)",
  "coreCompetencies": ["skill1", "skill2", "skill3"],
  "workExperience": [
    {
      "position": "string",
      "company": "string",
      "location": "string",
      "startDate": "MM/YYYY",
      "endDate": "MM/YYYY or Present",
      "achievements": [
        "Achievement 1 with quantifiable results",
        "Achievement 2 with impact metrics",
        "Achievement 3 highlighting skills"
      ]
    }
  ],
  "education": [
    {
      "degree": "string",
      "institution": "string",
      "location": "string",
      "graduationYear": "YYYY",
      "honors": "string"
    }
  ],
  "technicalSkills": {
    "programmingLanguages": [],
    "frameworksLibraries": [],
    "toolsPlatforms": [],
    "databases": [],
    "other": []
  },
  "certifications": [
    {
      "name": "string",
      "issuer": "string",
      "dateObtained": "MM/YYYY",
      "credentialId": "string"
    }
  ],
  "projects": [
    {
      "name": "string",
      "description": "string",
      "technologies": ["string"],
      "link": "string"
    }
  ],
  "atsOptimization": {
    "atsScore": 85,
    "keywordDensity": "Optimal",
    "suggestions": ["suggestion1", "suggestion2"],
    "industryKeywords": ["keyword1", "keyword2"]
  },
  "metadata": {
    "generatedAt": "${new Date().toISOString()}",
    "sourceType": "uploaded_resume",
    "optimizationLevel": "professional",
    "keywordCount": 45
  }
}

Return ONLY the JSON object as output.`;

        const atsResult = await model.generateContent(atsPrompt);
        const atsResponseText = atsResult.response.text();

        console.log('✅ Received ATS-optimized resume from Gemini');

        // Parse the ATS-optimized resume
        let atsResumeData;
        try {
          const jsonMatch = atsResponseText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            atsResumeData = JSON.parse(jsonMatch[0]);
          } else {
            atsResumeData = JSON.parse(atsResponseText);
          }
        } catch (parseError) {
          console.error(
            '⚠️ Failed to parse ATS resume response as JSON:',
            parseError
          );
          console.error('Raw response:', atsResponseText);
          throw new Error('Failed to parse ATS resume from AI response');
        }

        console.log('✅ Successfully generated ATS-optimized resume');

        // Save ATS-optimized resume
        const atsResumePath = path.join(outputDir, 'ats_resume.json');
        fs.writeFileSync(
          atsResumePath,
          JSON.stringify(atsResumeData, null, 2),
          'utf-8'
        );

        // Save to Resume model in database
        const resume = await Resume.create({
          userId: doc.userId,
          documentId: doc._id,
          resumeData: atsResumeData,
          metadata: {
            generatedAt: new Date(),
            atsOptimized: true,
            sourceType: 'uploaded_resume',
            targetIndustry: 'General',
            targetRole: 'Professional',
            keywordCount: atsResumeData.metadata?.keywordCount || 0,
            atsScore: atsResumeData.atsOptimization?.atsScore || 0
          },
          status: 'generated'
        });

        console.log('✅ ATS-optimized resume saved with ID:', resume._id);
        console.log(
          '📊 Resume ATS Score:',
          atsResumeData.atsOptimization?.atsScore || 'N/A'
        );

        // Save extracted data to document for reference
        doc.parsedData = extractedData;
        await doc.save();

        console.log('✅ Successfully processed Resume/CV');
      } catch (error) {
        console.error('❌ Error processing Resume/CV:', error);
        // Don't fail the entire upload if resume processing fails
        console.log(
          '⚠️ Continuing with document upload despite Resume/CV processing error'
        );
      }
    }

    res.status(201).json(doc);
  } catch (error) {
    console.log({ error });
    res
      .status(500)
      .json({ message: 'Error uploading document', error: error.message });
  }
});

// Get user's documents
router.get('/my-documents', auth, async (req, res) => {
  try {
    const { type } = req.query;
    const query = { userId: req.user._id };

    if (type) {
      query.type = type;
    }

    const documents = await Document.find(query).sort('-createdAt');

    res.json(documents);
  } catch (error) {
    res
      .status(500)
      .json({ message: 'Error fetching documents', error: error.message });
  }
});

// Get PDS extracted data for a specific document
router.get('/pds-data/:documentId', auth, async (req, res) => {
  try {
    const { documentId } = req.params;

    console.log(`🔍 Fetching PDS data for document: ${documentId}`);

    // First verify the document exists and user has access
    const document = await Document.findById(documentId);
    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }

    if (document.userId.toString() !== req.user._id.toString()) {
      return res
        .status(403)
        .json({ message: 'Not authorized to access this document' });
    }

    // Get the extracted PDS data - be more specific
    const pdsData = await PdsExtractedData.findOne({
      userId: req.user._id,
      documentId: documentId
    }).sort({ createdAt: -1 }); // Get the most recent one if multiple exist

    if (!pdsData) {
      // Let's check what's in the collection for debugging
      const allPdsData = await PdsExtractedData.find({
        userId: req.user._id
      });

      console.log(`⚠️ No PDS data found for document ${documentId}`);
      console.log(`📊 Total PDS entries for user: ${allPdsData.length}`);
      console.log(
        `📋 Available document IDs:`,
        allPdsData.map(p => p.documentId.toString())
      );

      return res.status(404).json({
        message: 'PDS extracted data not found',
        debug: {
          totalEntries: allPdsData.length,
          availableDocumentIds: allPdsData.map(p => p.documentId.toString())
        }
      });
    }

    console.log(`✅ Found PDS data for document ${documentId}`);
    console.log(`📅 PDS data created at: ${pdsData.createdAt}`);
    console.log(`🔑 Data keys:`, Object.keys(pdsData.data || {}));

    res.json(pdsData.data);
  } catch (error) {
    console.error('❌ Error fetching PDS data:', error);
    res
      .status(500)
      .json({ message: 'Error fetching PDS data', error: error.message });
  }
});

// Debug endpoint to see all PDS extracted data for a user
router.get('/pds-data-debug', auth, async (req, res) => {
  try {
    const allPdsData = await PdsExtractedData.find({
      userId: req.user._id
    }).populate('documentId', 'title type createdAt');

    console.log(
      `🔍 Debug: Found ${allPdsData.length} PDS entries for user ${req.user._id}`
    );

    res.json({
      totalEntries: allPdsData.length,
      entries: allPdsData.map(entry => ({
        id: entry._id,
        documentId: entry.documentId,
        documentTitle: entry.documentId?.title || 'Unknown',
        documentType: entry.documentId?.type || 'Unknown',
        documentCreatedAt: entry.documentId?.createdAt,
        pdsDataCreatedAt: entry.createdAt,
        dataKeys: Object.keys(entry.data || {}),
        hasPersonalInfo: !!entry.data?.personalInformation
      }))
    });
  } catch (error) {
    console.error('❌ Error in PDS debug endpoint:', error);
    res.status(500).json({
      message: 'Error fetching PDS debug info',
      error: error.message
    });
  }
});

// Cleanup endpoint to remove duplicate/old PDS data entries
router.delete('/pds-data-cleanup', auth, async (req, res) => {
  try {
    const allPdsData = await PdsExtractedData.find({
      userId: req.user._id
    });

    if (allPdsData.length <= 1) {
      return res.json({
        message: 'No cleanup needed',
        totalEntries: allPdsData.length
      });
    }

    // Option 1: Keep only the most recent entry for each document (current behavior)
    // Option 2: Keep only the single most recent entry across all documents

    const { keepOnePerDocument = true } = req.query; // Default to current behavior

    let entriesToKeep, entriesToRemove;

    if (keepOnePerDocument === 'false') {
      // Keep only the single most recent entry across all documents
      const sortedByDate = allPdsData.sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
      );
      entriesToKeep = [sortedByDate[0]]; // Keep only the most recent one
      entriesToRemove = allPdsData.slice(1); // Remove all others
    } else {
      // Keep only the most recent entry for each document (current behavior)
      const documentGroups = {};

      console.log({ allPdsData });
      allPdsData.forEach(entry => {
        const docId = entry.documentId.toString();
        if (
          !documentGroups[docId] ||
          new Date(entry.createdAt) > new Date(documentGroups[docId].createdAt)
        ) {
          documentGroups[docId] = entry;
        }
      });

      entriesToKeep = Object.values(documentGroups);

      console.log({ entriesToKeep });
      entriesToRemove = allPdsData.filter(
        entry =>
          !entriesToKeep.find(
            keep => keep._id.toString() === entry._id.toString()
          )
      );
    }

    console.log({ entriesToRemove });
    if (entriesToRemove.length > 0) {
      await PdsExtractedData.deleteMany({
        _id: { $in: entriesToRemove.map(e => e._id) }
      });
    }

    console.log(
      `🧹 Cleaned up ${entriesToRemove.length} duplicate PDS entries for user ${req.user._id}`
    );

    res.json({
      message: 'Cleanup completed',
      removedEntries: entriesToRemove.length,
      remainingEntries: entriesToKeep.length,
      remainingDocuments: entriesToKeep.map(e => e.documentId.toString()),
      cleanupMode:
        keepOnePerDocument === 'false'
          ? 'single_most_recent'
          : 'one_per_document'
    });
  } catch (error) {
    console.error('❌ Error in PDS cleanup endpoint:', error);
    res.status(500).json({
      message: 'Error during cleanup',
      error: error.message
    });
  }
});

// Get document by ID
router.get('/:id', auth, async (req, res) => {
  try {
    const document = await Document.findById(req.params.id);

    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }

    // Check if user has permission to access this document
    if (
      document.userId.toString() !== req.user._id.toString() &&
      req.user.role !== 'admin' &&
      req.user.role !== 'employer'
    ) {
      return res
        .status(403)
        .json({ message: 'Not authorized to access this document' });
    }

    res.json(document);
  } catch (error) {
    res
      .status(500)
      .json({ message: 'Error fetching document', error: error.message });
  }
});

// Update document
router.put(
  '/:id',
  [
    auth,
    body('title').optional(),
    body('isDefault').optional().isBoolean(),
    validate
  ],
  async (req, res) => {
    try {
      const document = await Document.findById(req.params.id);

      if (!document) {
        return res.status(404).json({ message: 'Document not found' });
      }

      if (document.userId.toString() !== req.user._id.toString()) {
        return res
          .status(403)
          .json({ message: 'Not authorized to update this document' });
      }

      if (req.body.title) document.title = req.body.title;
      if (req.body.isDefault !== undefined) {
        document.isDefault = req.body.isDefault;

        // If setting as default, unset other defaults of the same type
        if (document.isDefault) {
          await Document.updateMany(
            {
              userId: req.user._id,
              type: document.type,
              isDefault: true,
              _id: { $ne: document._id }
            },
            { isDefault: false }
          );
        }
      }

      await document.save();
      res.json(document);
    } catch (error) {
      res
        .status(500)
        .json({ message: 'Error updating document', error: error.message });
    }
  }
);

// Delete document
router.delete('/:id', auth, async (req, res) => {
  try {
    const document = await Document.findById(req.params.id);

    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }

    if (document.userId.toString() !== req.user._id.toString()) {
      return res
        .status(403)
        .json({ message: 'Not authorized to delete this document' });
    }

    // Delete file from storage
    if (fs.existsSync(document.fileUrl)) {
      fs.unlinkSync(document.fileUrl);
    }

    await Document.findByIdAndDelete(req.params.id);
    res.json({ message: 'Document deleted successfully' });
  } catch (error) {
    res
      .status(500)
      .json({ message: 'Error deleting document', error: error.message });
  }
});

// Parse PDS document
router.post('/parse-pds/:id', [auth, authorize('admin')], async (req, res) => {
  try {
    const document = await Document.findById(req.params.id);

    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }

    if (document.type !== 'pds') {
      return res.status(400).json({ message: 'Document is not a PDS' });
    }

    const parsedData = await pdsParser.parsePDS(document.fileUrl);
    document.parsedData = parsedData;
    await document.save();

    res.json(document);
  } catch (error) {
    res
      .status(500)
      .json({ message: 'Error parsing PDS', error: error.message });
  }
});

// Get latest resume by user ID (admin only) - MUST be BEFORE /resume/:documentId to avoid route conflict
router.get(
  '/resume/user/:userId',
  [auth, authorize('admin', 'employer')],
  async (req, res) => {
    try {
      const { userId } = req.params;

      console.log(`🔍 Admin fetching resume for user: ${userId}`);

      // Find the latest saved resume for this user
      const resume = await Resume.findOne({
        userId: userId
      }).sort({ createdAt: -1 });

      console.log({resume})

      if (!resume) {
        console.log(`❌ No saved resume found for user: ${userId}`);
        return res.status(404).json({
          success: false,
          message: 'No saved resume found for this applicant.',
          userId
        });
      }

      console.log(`✅ Found saved resume with ID: ${resume._id}`);
      console.log(`📊 Resume ATS Score: ${resume.metadata?.atsScore || 'N/A'}`);

      res.json({
        success: true,
        resumeData: resume.resumeData,
        metadata: resume.metadata,
        variants: resume.variants,
        optimizedForJobs: resume.optimizedForJobs,
        status: resume.status,
        createdAt: resume.createdAt,
        updatedAt: resume.updatedAt
      });
    } catch (error) {
      console.error('Error fetching user resume:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch resume',
        error: error.message
      });
    }
  }
);

// Get saved resume for a document
router.get('/resume/:documentId', auth, async (req, res) => {
  try {
    const { documentId } = req.params;

    console.log(`🔍 Looking for saved resume for document: ${documentId}`);
    console.log(`👤 User ID: ${req.user._id}`);

    // Find the saved resume
    const resume = await Resume.findOne({
      userId: req.user._id,
      documentId: documentId
    }).sort({ createdAt: -1 });


    console.log({resume})

    if (!resume) {
      console.log(`❌ No saved resume found for document: ${documentId}`);
      return res.status(404).json({
        message: 'No saved resume found. Please generate a resume first.',
        debug: {
          documentId,
          userId: req.user._id
        }
      });
    }

    console.log(`✅ Found saved resume with ID: ${resume._id}`);
    console.log(`📊 Resume ATS Score: ${resume.metadata?.atsScore || 'N/A'}`);

    res.json({
      success: true,
      resume: resume.resumeData,
      metadata: resume.metadata,
      variants: resume.variants,
      optimizedForJobs: resume.optimizedForJobs,
      status: resume.status,
      createdAt: resume.createdAt,
      updatedAt: resume.updatedAt
    });
  } catch (error) {
    console.error('Error fetching saved resume:', error);
    res.status(500).json({
      message: 'Failed to fetch saved resume',
      error: error.message
    });
  }
});

// Generate resume from PDS data (now checks for existing resume first)
router.post('/generate-resume/:documentId', auth, async (req, res) => {
  try {
    const { documentId } = req.params;
    const { targetIndustry = 'General', targetRole = 'Professional' } =
      req.body;

    console.log(`🎯 Generating resume for document: ${documentId}`);
    console.log(`📊 Target industry: ${targetIndustry}`);
    console.log(`📊 Target role: ${targetRole}`);
    console.log(`👤 User ID: ${req.user._id}`);

    // Check if resume already exists for this document
    const existingResume = await Resume.findOne({
      userId: req.user._id,
      documentId: documentId
    }).sort({ createdAt: -1 });

    if (existingResume) {
      console.log(`✅ Found existing resume with ID: ${existingResume._id}`);
      console.log(
        `📊 Existing resume ATS Score: ${
          existingResume.metadata?.atsScore || 'N/A'
        }`
      );

      // If it's the same industry and role, return existing resume
      if (
        existingResume.metadata?.targetIndustry === targetIndustry &&
        existingResume.metadata?.targetRole === targetRole
      ) {
        return res.json({
          success: true,
          resume: existingResume.resumeData,
          metadata: existingResume.metadata,
          variants: existingResume.variants,
          optimizedForJobs: existingResume.optimizedForJobs,
          status: existingResume.status,
          message: 'Using existing resume'
        });
      }
    }

    // First verify the document exists and user has access
    const document = await Document.findById(documentId);
    console.log(`📄 Document found:`, !!document);
    if (document) {
      console.log(`📄 Document type: ${document.type}`);
      console.log(`📄 Document user ID: ${document.userId}`);
      console.log(`📄 Document title: ${document.title}`);
    }

    if (!document) {
      console.log(`❌ Document not found for ID: ${documentId}`);
      return res.status(404).json({ message: 'Document not found' });
    }

    if (document.userId.toString() !== req.user._id.toString()) {
      return res
        .status(403)
        .json({ message: 'Not authorized to access this document' });
    }

    // Get the extracted PDS data
    console.log(
      `🔍 Looking for PDS data for user: ${req.user._id}, document: ${documentId}`
    );
    const pdsData = await PdsExtractedData.findOne({
      userId: req.user._id,
      documentId: documentId
    }).sort({ createdAt: -1 });

    console.log(`📋 PDS data found:`, !!pdsData);
    if (pdsData) {
      console.log(`📋 PDS data ID: ${pdsData._id}`);
      console.log(`📋 PDS data keys:`, Object.keys(pdsData.data || {}));
    }

    if (!pdsData) {
      // Let's check what PDS data exists for this user
      const allPdsData = await PdsExtractedData.find({
        userId: req.user._id
      });
      console.log(`⚠️ No PDS data found for document ${documentId}`);
      console.log(`📊 Total PDS entries for user: ${allPdsData.length}`);
      console.log(
        `📋 Available document IDs:`,
        allPdsData.map(p => p.documentId.toString())
      );

      return res.status(404).json({
        message:
          'PDS extracted data not found. Please ensure PDS processing is complete.',
        debug: {
          totalEntries: allPdsData.length,
          availableDocumentIds: allPdsData.map(p => p.documentId.toString())
        }
      });
    }

    console.log('📋 Found PDS data, generating resume...');

    // Generate resume from PDS data
    const resumeData = await generateResumeFromPds(
      pdsData.data,
      targetIndustry,
      targetRole
    );

    // Save the generated resume to database
    const resume = await Resume.create({
      userId: req.user._id,
      documentId: documentId,
      resumeData: resumeData,
      metadata: {
        generatedAt: new Date(),
        atsOptimized: true,
        targetIndustry: targetIndustry,
        targetRole: targetRole,
        keywordCount: resumeData.metadata?.keywordCount || 0,
        atsScore: resumeData.atsOptimization?.atsScore || 0
      },
      status: 'generated'
    });

    console.log('✅ Resume generated and saved with ID:', resume._id);
    console.log(
      '📊 Resume ATS Score:',
      resumeData.atsOptimization?.atsScore || 'N/A'
    );

    res.json({
      success: true,
      resume: resumeData,
      metadata: resumeData.metadata,
      resumeId: resume._id,
      message: 'Resume generated and saved successfully'
    });
  } catch (error) {
    console.error('❌ Error generating resume:', error);
    res.status(500).json({
      message: 'Error generating resume',
      error: error.message
    });
  }
});

// Generate multiple resume variants for different industries
router.post('/generate-resume-variants/:documentId', auth, async (req, res) => {
  try {
    const { documentId } = req.params;
    const {
      industries = ['Technology', 'Healthcare', 'Finance', 'Education']
    } = req.body;

    console.log(`🎯 Generating resume variants for document: ${documentId}`);
    console.log(`📊 Industries: ${industries.join(', ')}`);

    // First verify the document exists and user has access
    const document = await Document.findById(documentId);
    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }

    if (document.userId.toString() !== req.user._id.toString()) {
      return res
        .status(403)
        .json({ message: 'Not authorized to access this document' });
    }

    // Get the extracted PDS data
    const pdsData = await PdsExtractedData.findOne({
      userId: req.user._id,
      documentId: documentId
    }).sort({ createdAt: -1 });

    if (!pdsData) {
      return res.status(404).json({
        message:
          'PDS extracted data not found. Please ensure PDS processing is complete.'
      });
    }

    console.log('📋 Found PDS data, generating resume variants...');

    // Generate resume variants for different industries
    const resumeVariants = await resumeGenerator.generateResumeVariants(
      pdsData.data,
      industries
    );

    console.log('✅ Resume variants generated successfully');

    res.json({
      success: true,
      variants: resumeVariants,
      metadata: {
        documentId,
        generatedAt: new Date().toISOString(),
        industries,
        sourceData: 'PDS'
      }
    });
  } catch (error) {
    console.error('❌ Error generating resume variants:', error);
    res.status(500).json({
      message: 'Error generating resume variants',
      error: error.message
    });
  }
});

// Optimize resume for specific job
router.post('/optimize-resume-for-job', auth, async (req, res) => {
  try {
    const { resumeData, jobDescription, jobTitle, companyName } = req.body;

    if (!resumeData || !jobDescription || !jobTitle) {
      return res.status(400).json({
        message: 'Missing required fields: resumeData, jobDescription, jobTitle'
      });
    }

    console.log(`🎯 Optimizing resume for job: ${jobTitle} at ${companyName}`);

    // Optimize resume for the specific job
    const optimizedResume = await resumeGenerator.optimizeResumeForJob(
      resumeData,
      jobDescription,
      jobTitle,
      companyName
    );

    console.log('✅ Resume optimized successfully');

    res.json({
      success: true,
      optimizedResume,
      metadata: {
        optimizedAt: new Date().toISOString(),
        jobTitle,
        companyName,
        originalResume: resumeData
      }
    });
  } catch (error) {
    console.error('❌ Error optimizing resume:', error);
    res.status(500).json({
      message: 'Error optimizing resume for job',
      error: error.message
    });
  }
});

module.exports = router;
