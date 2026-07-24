const fs = require('fs');
const pdfParse = require('pdf-parse');

async function readPolicyText(pdfPath) {
  const bytes = fs.readFileSync(pdfPath);
  const data = await pdfParse(bytes);
  return data.text;
}

module.exports = { readPolicyText };
