const pdf_table_extractor = require('pdf-table-extractor');
const fs = require('fs');
const path = require('path');

// Path to your PDF file (adjust as needed)
const pdfPath =
  'C:/Users/ACER/Desktop/2025 Capstone Project/INTELLIHIRE/PDS.pdf';

// pdsParser.js
// Node.js script to parse raw PDS array into structured JSON

function parsePDS(rawData) {
  const text = rawData.join('\n'); // flatten into 1 string for regex search

  // --- Helper functions ---
  const extract = (regex, group = 1) => {
    const match = text.match(regex);
    return match && match[group] ? match[group].trim() : null;
  };

  const extractAll = (regex, group = 1) => {
    return [...text.matchAll(regex)].map(m => m[group].trim());
  };

  // --- PERSONAL INFORMATION ---
  const personal_information = {
    surname: extract(/SURNAME\s*([A-Za-z]+)/i),
    first_name: extract(/FIRST NAME\s*([A-Za-z ]+)/i),
    middle_name: extract(/MIDDLE NAME\s*([A-Za-z]+)/i),
    name_extension: extract(/NAME EXTENSION.*?([A-Z]{2,}\.?)/i),
    date_of_birth: extract(/DATE OF BIRTH.*?(\d{1,2}\/\d{1,2}\/\d{4})/i),
    place_of_birth: extract(/PLACE OF BIRTH([^\n]+)/i),
    sex: extract(/SEX\s*(Male|Female)/i),
    civil_status: extract(
      /CIVIL STATUS.*?(Single|Married|Widowed|Separated|Other)/i
    ),
    height_cm: extract(/HEIGHT.*?(\d+)\s*cm/i),
    weight_kg: extract(/WEIGHT.*?(\d+)\s*kg/i),
    blood_type: extract(/BLOOD TYPE\s*([A-Z0-9+-]+)/i),
    citizenship: extract(/CITIZENSHIP[\s\S]*?\n([A-Za-z]+)/i),
    residential_address: {
      house_lot: extract(/RESIDENTIAL ADDRESS[\s\S]*?(Mabuhay Street)/i),
      subdivision: extract(
        /RESIDENTIAL ADDRESS[\s\S]*?(GreenField Subdivision)/i
      ),
      barangay: extract(/RESIDENTIAL ADDRESS[\s\S]*?(Barangay [A-Za-z ]+)/i),
      city_municipality: extract(/RESIDENTIAL ADDRESS[\s\S]*?(Quezon City)/i),
      province: extract(/RESIDENTIAL ADDRESS[\s\S]*?(Metro Manila)/i),
      zip_code: extract(/RESIDENTIAL ADDRESS[\s\S]*?ZIP CODE\s*(\d+)/i)
    },
    permanent_address: {
      house_lot: extract(/PERMANENT ADDRESS[\s\S]*?(Mabuhay Street)/i),
      subdivision: extract(
        /PERMANENT ADDRESS[\s\S]*?(GreenField Subdivision)/i
      ),
      barangay: extract(/PERMANENT ADDRESS[\s\S]*?(Barangay [A-Za-z ]+)/i),
      city_municipality: extract(/PERMANENT ADDRESS[\s\S]*?(Quezon City)/i),
      province: extract(/PERMANENT ADDRESS[\s\S]*?(Metro Manila)/i),
      zip_code: extract(/PERMANENT ADDRESS[\s\S]*?ZIP CODE\s*(\d+)/i)
    },
    telephone_no: extract(/TELEPHONE NO.\s*([0-9()-]+)/i),
    mobile_no: extract(/MOBILE NO.\s*([0-9-]+)/i),
    email_address: extract(/E-MAIL ADDRESS.*?([^\s]+@[^\s]+)/i),
    gsis_id_no: extract(/GSIS ID NO.\s*([\d-]+)/i),
    pagibig_id_no: extract(/PAG-IBIG ID NO.\s*([\d-]+)/i),
    philhealth_no: extract(/PHILHEALTH NO.\s*([\d-]+)/i),
    sss_no: extract(/SSS NO.\s*([\d-]+)/i),
    tin_no: extract(/TIN NO.\s*([\d-]+)/i),
    agency_employee_no: extract(/AGENCY EMPLOYEE NO.\s*(\d+)/i)
  };

  // --- FAMILY BACKGROUND ---
  const family_background = {
    spouse: {
      surname: extract(/SPOUSE'S SURNAME\s*([A-Za-z]+)/i),
      first_name: extract(/FIRST NAME\s*([A-Za-z]+)/i),
      middle_name: extract(/MIDDLE NAME\s*([A-Za-z]+)/i),
      occupation: extract(/OCCUPATION\s*([A-Za-z ]+)/i),
      employer: extract(/EMPLOYER\/BUSINESS NAME\s*([A-Za-z ]+)/i),
      business_address: extract(/BUSINESS ADDRESS\s*([A-Za-z ,]+)/i),
      telephone_no: extract(/SPOUSE[\s\S]*?TELEPHONE NO.\s*([0-9()-]+)/i)
    },
    children: [...text.matchAll(/([\w ]+)\n(\d{1,2}\/\d{1,2}\/\d{4})/gi)].map(
      m => ({
        name: m[1].trim(),
        date_of_birth: m[2].trim()
      })
    ),
    father: {
      surname: extract(/FATHER'S SURNAME\s*([A-Za-z]+)/i),
      first_name: extract(/FATHER'S[\s\S]*?FIRST NAME\s*([A-Za-z]+)/i),
      middle_name: extract(/FATHER'S[\s\S]*?MIDDLE NAME\s*([A-Za-z]+)/i)
    },
    mother_maiden_name: {
      surname: extract(/MOTHER'S MAIDEN NAME[\s\S]*?SURNAME\s*([A-Za-z]+)/i),
      first_name: extract(
        /MOTHER'S MAIDEN NAME[\s\S]*?FIRST NAME\s*([A-Za-z]+)/i
      ),
      middle_name: extract(
        /MOTHER'S MAIDEN NAME[\s\S]*?MIDDLE NAME\s*([A-Za-z]+)/i
      )
    }
  };

  // --- EDUCATIONAL BACKGROUND ---
  const educationMatches = [
    ...text.matchAll(
      /(ELEMENTARY|SECONDARY|VOCATIONAL|COLLEGE|GRADUATE STUDIES)[\s\S]*?(\d{1,2}\/\d{1,2}\/\d{4})(\d{1,2}\/\d{1,2}\/\d{4})(Completed|\w+)(\d{4})([^\n]+)\n([^\n]+)\n([^\n]+)/gi
    )
  ];

  const educational_background = educationMatches.map(m => ({
    level: m[1].trim(),
    from: m[2],
    to: m[3],
    highest_units_earned: m[4],
    year_graduated: m[5],
    school: m[6].trim(),
    degree_course: m[7].trim(),
    scholarship_honors: m[8].trim()
  }));

  // --- CIVIL SERVICE ELIGIBILITY ---
  const civil_service_eligibility = [
    ...text.matchAll(
      /(Certified Public Accountant|Board Exam|Civil Service|Driver's License)[\s\S]*?(\d{1,2}\/\d{1,2}\/\d{4})([A-Za-z ]+)/gi
    )
  ].map(m => ({
    eligibility: m[1].trim(),
    date_of_exam: m[2],
    place_of_exam: m[3].trim()
  }));

  // --- WORK EXPERIENCE ---
  const work_experience = [
    ...text.matchAll(
      /(\d{1,2}\/\d{1,2}\/\d{4})\n(\d{1,2}\/\d{1,2}\/\d{4})\n([A-Za-z ]+)\n([A-Za-z ]+)\nPHP ([0-9 ]+)\n([0-9-]+)([A-Za-z]+)\n/gi
    )
  ].map(m => ({
    from: m[1],
    to: m[2],
    position_title: m[3].trim(),
    company: m[4].trim(),
    monthly_salary: parseInt(m[5].replace(/\s/g, '')),
    salary_grade: m[6],
    status: m[7]
  }));

  // --- VOLUNTARY WORK ---
  const voluntary_work = [
    ...text.matchAll(
      /(\d{1,2}\/\d{1,2}\/\d{4}|Present)\n(\d{1,2}\/\d{1,2}\/\d{4}|Present)([0-9]+ hrs\/year)([A-Za-z ,]+)([A-Za-z ]+)/gi
    )
  ].map(m => ({
    from: m[1],
    to: m[2],
    hours: m[3],
    organization: m[4].trim(),
    position: m[5].trim()
  }));

  // --- TRAININGS ---
  const trainings = [
    ...text.matchAll(
      /(\d{1,2}\/\d{1,2}\/\d{4})(\d{1,2}\/\d{1,2}\/\d{4})([0-9]+) hours([A-Za-z ]+)([A-Za-z ,]+)([A-Za-z ]+)/gi
    )
  ].map(m => ({
    from: m[1],
    to: m[2],
    hours: parseInt(m[3]),
    type: m[4].trim(),
    title: m[5].trim(),
    sponsor: m[6].trim()
  }));

  // --- OTHER INFO ---
  const other_information = {
    skills_hobbies: extractAll(/SPECIAL SKILLS.*?\n([^\n]+)/gi),
    recognitions: extractAll(/NON-ACADEMIC DISTINCTIONS.*?\n([^\n]+)/gi),
    memberships: extractAll(/MEMBERSHIP.*?\n([^\n]+)/gi)
  };

  // --- GOVERNMENT QUESTIONS ---
  const government_questions = {
    related_to_appointing_authority: extract(/consanguinity.*?\nYES(NO)?/i)
      ? 'Yes'
      : 'No',
    guilty_of_administrative_offense: extract(/administrative offense\?YES/i)
      ? 'Yes'
      : 'No',
    criminally_charged: extract(/criminally charged.*?YES/i) ? 'Yes' : 'No',
    convicted: extract(/convicted.*?YES/i) ? 'Yes' : 'No',
    separated_from_service: extract(/separated.*?YES/i) ? 'Yes' : 'No',
    candidate_in_election: extract(/candidate.*?YES/i) ? 'Yes' : 'No',
    resigned_for_campaign: extract(/resigned.*?YES/i) ? 'Yes' : 'No',
    immigrant_status: extract(/immigrant.*?YES/i) ? 'Yes' : 'No',
    indigenous_group_member: extract(/indigenous.*?YES/i) ? 'Yes' : 'No',
    person_with_disability: extract(/disability.*?YES/i) ? 'Yes' : 'No',
    solo_parent: extract(/solo parent.*?YES/i) ? 'Yes' : 'No'
  };

  return {
    personal_information,
    family_background,
    educational_background,
    civil_service_eligibility,
    work_experience,
    voluntary_work,
    trainings,
    other_information,
    government_questions
  };
}

function arrayToCSV(table) {
  return table
    .map(row => {
      // If row is not an array, treat it as a single-cell row
      if (!Array.isArray(row)) row = [row];
      return row
        .map(v => {
          if (typeof v === 'undefined' || v === null) return '';
          let val = String(v);
          if (val.includes('"')) val = val.replace(/"/g, '""');
          if (val.includes('"') || val.includes('\n') || val.includes(','))
            val = `"${val}"`;
          return val;
        })
        .join(',');
    })
    .join('\n');
}

function mergeAllTables(pageTables) {
  // Flatten all tables from all pages into one big array
  let merged = [];
  pageTables.forEach(pageTable => {
    pageTable.tables.forEach(table => {
      merged = merged.concat(table);
    });
  });
  return merged;
}

function success(result) {
  console.log('PDF Table Extraction Result:');
  console.log(JSON.stringify(result, null, 2));
  // Write to JSON file (full extraction result)
  const outputPath = path.join(__dirname, 'extracted_table.json');
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf8');
  console.log(`Extraction result saved to ${outputPath}`);

  // Only write merged CSV and merged JSON for all tables to single files
  if (result.pageTables && result.pageTables.length > 0) {
    const merged = mergeAllTables(result.pageTables);
    const mergedCSV = arrayToCSV(merged);

    // Write merged JSON as well
    const mergedJSONPath = path.join(__dirname, 'extracted_table_all.json');
    fs.writeFileSync(
      mergedJSONPath,
      JSON.stringify(
        merged.filter(r => !!r),
        null,
        2
      ),
      'utf8'
    );

    // Write merged CSV as well
    // const mergedCSVPath = path.join(__dirname, 'extracted_table_all.txt');
    // fs.writeFileSync(mergedCSVPath, mergedCSV, 'utf8');

    // // --- STRUCTURED JSON ---
    // // Flatten if merged is array of arrays
    // const lines = Array.isArray(merged[0]) ? merged.flat() : merged;
    // // Remove empty lines and trim
    // const cleanLines = lines
    //   .map(l => (Array.isArray(l) ? l.join(' ') : l))
    //   .map(l => (l || '').trim())
    //   .filter(l => l.length > 0);
    // const structured = parsePDS(cleanLines);
    // const structuredPath = path.join(__dirname, 'structured_pds.json');
    // fs.writeFileSync(
    //   structuredPath,
    //   JSON.stringify(structured, null, 2),
    //   'utf8'
    // );
    // console.log(`Structured PDS JSON saved to ${structuredPath}`);
  }
}

function error(err) {
  console.error('Error extracting table:', err);
}

pdf_table_extractor(pdfPath, success, error);
