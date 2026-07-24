// Mechanics test: fills the real ACORD 25 template using data manually verified
// against the Custom Quality Flooring LLC sample policy, independent of the
// Claude extraction step (which needs an API key this test doesn't require).
const path = require('path');
const { mapToAcordFields } = require('./lib/map-to-acord');
const { fillPdf } = require('./lib/fill-pdf');
const { lookupNaic } = require('./lib/naic-lookup');

const AGENCY_INFO = {
  fullName: 'The East Agency',
  addressLine1: '47 Stonewall St',
  city: 'Cartersville',
  state: 'GA',
  postalCode: '30120',
  contactName: 'Brannon East',
  phone: '(678) 562-6905',
  email: 'info@brannoneastagency.com',
};

const data = {
  producer: AGENCY_INFO,
  namedInsured: {
    fullName: 'Custom Quality Flooring LLC',
    addressLine1: '163 Green Park Way',
    city: 'Newnan',
    state: 'GA',
    postalCode: '30263',
  },
  certificateHolder: {
    fullName: 'PunchListUSA',
    addressLine1: '123 Test Holder Ave',
    city: 'Atlanta',
    state: 'GA',
    postalCode: '30301',
  },
  certificateNumber: 'TEST-0001',
  formCompletionDate: '07/23/2026',
  descriptionOfOperations:
    'PunchListUSA is included as an Additional Insured with respect to General Liability per written contract, ongoing operations only. Waiver of Subrogation applies per attached form.',
  insurers: [
    {
      letter: 'A',
      fullName: 'National Specialty Insurance Company',
      naic: lookupNaic('National Specialty Insurance Company'),
    },
  ],
  policies: [
    {
      letter: 'A',
      lineOfBusiness: 'generalLiability',
      occurrenceForm: true,
      policyNumber: 'IBL-P3JQPVP27-2',
      effectiveDate: '08/11/2024',
      expirationDate: '08/11/2025',
      eachOccurrence: '2,000,000',
      damageToRentedPremises: '100,000',
      medExpense: '5,000',
      personalAdvertisingInjury: '2,000,000',
      generalAggregate: '2,000,000',
      productsCompletedOpsAggregate: '2,000,000',
      aggregateAppliesPer: 'policy',
      additionalInsured: true,
      subrogationWaived: true,
    },
  ],
};

async function main() {
  const naic = lookupNaic('National Specialty Insurance Company');
  console.log('NAIC lookup result:', naic);
  if (!naic) throw new Error('NAIC lookup failed — check data/naic-carriers.json');

  const fields = mapToAcordFields(data);
  console.log(`Mapped ${Object.keys(fields).length} fields.`);

  const outDir = path.join(__dirname, 'test-samples');
  require('fs').mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'test-output.pdf');

  const { missing } = await fillPdf(
    path.join(__dirname, 'template', 'acord25.pdf'),
    fields,
    outPath
  );

  if (missing.length) {
    console.warn('WARNING — field names not found in template:', missing);
  } else {
    console.log('All mapped field names matched the template.');
  }
  console.log('Wrote:', outPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
