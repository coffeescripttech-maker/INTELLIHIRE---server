const fs = require('fs');
const path = require('path');
const PDFParser = require('pdf2json');

// https://cloud.llamaindex.ai/project/ce6bc9ed-46e0-4bad-831b-11d5839f792f/extraction/1db8b3ec-6b00-4915-9b28-3415021b4654?job_id=5e17a08d-dcb6-4b31-b4de-0d327cd3b2a4&run_id=c2afbf15-76de-49fa-8a8c-02c1e3c10516

const parsePDF = filePath => {
  return new Promise((resolve, reject) => {
    const pdfParser = new PDFParser();

    pdfParser.on('pdfParser_dataError', errData => reject(errData.parserError));
    pdfParser.on('pdfParser_dataReady', pdfData => {
      const pages = pdfData.formImage.Pages;
      const result = [];

      pages.forEach((page, pageIndex) => {
        const textElements = page.Texts.map(t => {
          const text = t.R.map(r => decodeURIComponent(r.T)).join('');
          return {
            text,
            x: t.x,
            y: t.y
          };
        });

        // Sort top-to-bottom, left-to-right
        textElements.sort((a, b) => a.y - b.y || a.x - b.x);

        result.push(...textElements);
      });

      resolve(result);
    });

    pdfParser.loadPDF(filePath);
  });
};

async function extractTextWithPdf2json(filePath) {
  return new Promise((resolve, reject) => {
    const pdfParser = new PDFParser();
    pdfParser.on('pdfParser_dataError', errData => reject(errData.parserError));
    pdfParser.on('pdfParser_dataReady', pdfData => {
      if (!pdfData.formImage || !Array.isArray(pdfData.formImage.Pages)) {
        return reject(
          new Error(
            'Could not extract pages from PDF. The file may be encrypted, corrupted, or not a standard PDF.'
          )
        );
      }
      let text = '';
      pdfData.formImage.Pages.forEach(page => {
        page.Texts.forEach(t => {
          text += decodeURIComponent(t.R[0].T) + ' ';
        });
        text += '\n';
      });
      resolve(text);
    });
    pdfParser.loadPDF(filePath);
  });
}

// Example function to group text into key-value pairs based on layout
const groupKeyValuePairs = textElements => {
  const keyValuePairs = {};
  for (let i = 0; i < textElements.length - 1; i++) {
    const current = textElements[i].text.trim();
    const next = textElements[i + 1].text.trim();

    // Simple rule: if current ends with ':' or is in uppercase and next is valid
    if (
      (/:$/.test(current) || /^[A-Z ]{2,}$/.test(current)) &&
      next &&
      next !== ':'
    ) {
      keyValuePairs[current.replace(/:$/, '')] = next;
    }
  }
  return keyValuePairs;
};

// // 🔍 Load and parse your uploaded file
// (async () => {
//   const filePath = path.join(
//     'C:\\Users\\ACER\\Desktop\\2025 Capstone Project\\INTELLIHIRE',
//     'CS_Form_No._212_Revised-2017_Personal-Data-Sheet_4.pdf'
//   );

//   try {
//     console.log({ filePath });
//     const textElements = await extractTextWithPdf2json(filePath);
//     const keyValues = groupKeyValuePairs(textElements);

//     console.log('Extracted Key-Value Pairs:');
//     console.log(keyValues);
//   } catch (err) {
//     console.error('Error parsing PDF:', err);
//   }
// })();
