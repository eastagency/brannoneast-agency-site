// End-to-end test: extract a real policy PDF with Claude, then fill the ACORD 25.
// Run with:  node --env-file=.env test-extract.js <path-to-policy-pdf>
const path = require('path');
const fs = require('fs');
const { extractPolicyData } = require('./lib/extract');
const { mapToAcordFields } = require('./lib/map-to-acord');
const { fillPdf } = require('./lib/fill-pdf');
const { lookupNaic } = require('./lib/naic-lookup');

async function main() {
  const pdfPath = process.argv[2];
  if (!pdfPath) {
    console.error('Usage: node --env-file=.env test-extract.js <path-to-policy-pdf>');
    process.exit(1);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY is not set. Put it in tools/coi/.env and run with --env-file=.env');
    process.exit(1);
  }

  console.log('Extracting policy data with Claude...');
  const pdfBase64 = fs.readFileSync(pdfPath).toString('base64');
  const extracted = await extractPolicyData(pdfBase64);

  const outDir = path.join(__dirname, 'test-samples');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'extracted.json'), JSON.stringify(extracted, null, 2));
  console.log('Wrote test-samples/extracted.json — review this first.');

  console.log('\n=== Checklist findings ===');
  for (const [key, finding] of Object.entries(extracted.checklistFindings || {})) {
    console.log(`${key}: ${finding.status} — ${finding.detail}`);
  }

  console.log('\n=== NAIC lookup ===');
  const naicWarnings = [];
  for (const insurer of extracted.insurers || []) {
    const naic = lookupNaic(insurer.fullName);
    insurer.naic = naic || '';
    if (!naic) {
      naicWarnings.push(insurer.fullName);
      console.log(`⚠ No NAIC number on file for "${insurer.fullName}" — add it to data/naic-carriers.json before issuing a real COI.`);
    } else {
      console.log(`${insurer.fullName}: ${naic}`);
    }
  }

  // Minimal placeholder certificate holder — a real run collects this from the staff form.
  const data = {
    ...extracted,
    producer: {
      fullName: 'The East Agency',
      addressLine1: '47 Stonewall St',
      city: 'Cartersville',
      state: 'GA',
      postalCode: '30120',
      contactName: 'Brannon East',
      phone: '(678) 562-6905',
      email: 'info@brannoneastagency.com',
    },
    certificateHolder: {
      fullName: '[TEST — fill in from staff form]',
      addressLine1: '',
      city: '',
      state: '',
      postalCode: '',
    },
    certificateNumber: 'TEST-EXTRACT-0001',
    formCompletionDate: new Date().toLocaleDateString('en-US'),
  };

  const fields = mapToAcordFields(data);
  const outPath = path.join(outDir, 'extracted-output.pdf');
  const { missing } = await fillPdf(path.join(__dirname, 'template', 'acord25.pdf'), fields, outPath);
  if (missing.length) console.warn('Unmapped field names:', missing);
  console.log(`\nWrote filled PDF: ${outPath}`);
  if (naicWarnings.length) {
    console.log(`\nNote: ${naicWarnings.length} carrier(s) missing NAIC numbers — NAIC field left blank on the PDF.`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
