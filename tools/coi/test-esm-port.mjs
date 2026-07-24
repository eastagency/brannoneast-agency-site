// One-off verification that the ESM port under netlify/functions/lib behaves
// identically to the proven CommonJS prototype in this directory.
import fs from 'fs';
import { extractPolicyData } from '../../netlify/functions/lib/extract.mjs';
import { mapToAcordFields } from '../../netlify/functions/lib/map-to-acord.mjs';
import { fillAcord25 } from '../../netlify/functions/lib/fill-pdf.mjs';
import { lookupNaic } from '../../netlify/functions/lib/naic-carriers.mjs';

const pdfPath = process.argv[2];
const pdfBase64 = fs.readFileSync(pdfPath).toString('base64');

console.log('Extracting via ESM port...');
const extracted = await extractPolicyData(pdfBase64);

console.log('policies count:', extracted.policies.length);
console.log('policies:', JSON.stringify(extracted.policies, null, 2));

for (const insurer of extracted.insurers || []) {
  insurer.naic = lookupNaic(insurer.fullName) || '';
  console.log(`NAIC for ${insurer.fullName}:`, insurer.naic);
}

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
    fullName: '[ESM TEST HOLDER]',
    addressLine1: '123 Test Ave',
    city: 'Atlanta',
    state: 'GA',
    postalCode: '30301',
  },
  certificateNumber: 'ESM-TEST-0001',
  formCompletionDate: new Date().toLocaleDateString('en-US'),
};

const fields = mapToAcordFields(data);
console.log('Mapped field count:', Object.keys(fields).length);

const pdfBytes = await fillAcord25(fields);
const outDir = new URL('./test-samples/', import.meta.url);
fs.mkdirSync(outDir, { recursive: true });
const outPath = new URL('./test-samples/esm-output.pdf', import.meta.url);
fs.writeFileSync(outPath, pdfBytes);
console.log('Wrote:', outPath.pathname);
