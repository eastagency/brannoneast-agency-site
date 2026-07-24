import Anthropic from '@anthropic-ai/sdk';

// Split into two concurrent calls (core policy data + checklist findings)
// instead of one combined call. A single call reading a real multi-page
// policy PDF and writing out both the structured data AND seven detailed
// checklist citations took 55-59 seconds against Netlify's 60-second
// synchronous function ceiling — too close to safe. Running two smaller,
// more focused calls in parallel (each re-reads the PDF, but that read cost
// is paid concurrently, not added twice) cuts wall-clock time enough to
// leave real margin.
const MODEL = 'claude-opus-4-8';

const CHECKLIST_ITEMS = [
  'waiverOfSubrogation',
  'primaryNonContributory',
  'ongoingOperationsAI',
  'completedOperationsAI',
  'jobServiceLocation',
  'jobServiceProvided',
  'cancellationNotice30Day',
];

const COMMON_POLICY_FIELDS = {
  letter: { type: 'string', description: 'ACORD insurer letter this line is placed with, e.g. "A"' },
  policyNumber: { type: 'string' },
  effectiveDate: { type: 'string', description: 'MM/DD/YYYY' },
  expirationDate: { type: 'string', description: 'MM/DD/YYYY' },
};
const COMMON_REQUIRED = ['letter', 'policyNumber', 'effectiveDate', 'expirationDate'];

const generalLiabilitySchema = {
  type: 'object',
  properties: {
    ...COMMON_POLICY_FIELDS,
    lineOfBusiness: { type: 'string', enum: ['generalLiability'] },
    occurrenceForm: { type: 'boolean' },
    claimsMadeForm: { type: 'boolean' },
    eachOccurrence: { type: 'string' },
    damageToRentedPremises: { type: 'string' },
    medExpense: { type: 'string' },
    personalAdvertisingInjury: { type: 'string' },
    generalAggregate: { type: 'string' },
    productsCompletedOpsAggregate: { type: 'string' },
    aggregateAppliesPer: { type: 'string', enum: ['policy', 'project', 'location', 'unknown'] },
    additionalInsured: { type: 'boolean' },
    subrogationWaived: { type: 'boolean' },
  },
  required: [...COMMON_REQUIRED, 'lineOfBusiness'],
  additionalProperties: false,
};

const automobileSchema = {
  type: 'object',
  properties: {
    ...COMMON_POLICY_FIELDS,
    lineOfBusiness: { type: 'string', enum: ['automobile'] },
    anyAuto: { type: 'boolean' },
    ownedAutos: { type: 'boolean' },
    scheduledAutos: { type: 'boolean' },
    hiredAutos: { type: 'boolean' },
    nonOwnedAutos: { type: 'boolean' },
    combinedSingleLimit: { type: 'string' },
    bodilyInjuryPerPerson: { type: 'string' },
    bodilyInjuryPerAccident: { type: 'string' },
    propertyDamage: { type: 'string' },
    additionalInsured: { type: 'boolean' },
    subrogationWaived: { type: 'boolean' },
  },
  required: [...COMMON_REQUIRED, 'lineOfBusiness'],
  additionalProperties: false,
};

const umbrellaExcessSchema = {
  type: 'object',
  properties: {
    ...COMMON_POLICY_FIELDS,
    lineOfBusiness: { type: 'string', enum: ['umbrella', 'excess'] },
    occurrenceForm: { type: 'boolean' },
    claimsMadeForm: { type: 'boolean' },
    eachOccurrence: { type: 'string' },
    aggregate: { type: 'string' },
    deductibleOrRetention: { type: 'string' },
    deductibleType: { type: 'string', enum: ['deductible', 'retention', 'unknown'] },
    subrogationWaived: { type: 'boolean' },
  },
  required: [...COMMON_REQUIRED, 'lineOfBusiness'],
  additionalProperties: false,
};

const workersCompSchema = {
  type: 'object',
  properties: {
    ...COMMON_POLICY_FIELDS,
    lineOfBusiness: { type: 'string', enum: ['workersComp'] },
    statutoryLimits: { type: 'boolean' },
    eachAccident: { type: 'string' },
    diseaseEachEmployee: { type: 'string' },
    diseasePolicyLimit: { type: 'string' },
    subrogationWaived: { type: 'boolean' },
  },
  required: [...COMMON_REQUIRED, 'lineOfBusiness'],
  additionalProperties: false,
};

const policyLineSchema = {
  anyOf: [generalLiabilitySchema, automobileSchema, umbrellaExcessSchema, workersCompSchema],
};

const CORE_DATA_TOOL = {
  name: 'submit_policy_core_data',
  description: 'Submit the named insured, insurers, policy lines, and forms schedule extracted from a commercial insurance policy.',
  input_schema: {
    type: 'object',
    properties: {
      namedInsured: {
        type: 'object',
        properties: {
          fullName: { type: 'string' },
          addressLine1: { type: 'string' },
          addressLine2: { type: 'string' },
          city: { type: 'string' },
          state: { type: 'string' },
          postalCode: { type: 'string' },
        },
        required: ['fullName', 'addressLine1', 'addressLine2', 'city', 'state', 'postalCode'],
        additionalProperties: false,
      },
      insurers: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            letter: { type: 'string' },
            fullName: { type: 'string' },
          },
          required: ['letter', 'fullName'],
          additionalProperties: false,
        },
      },
      policies: { type: 'array', items: policyLineSchema },
      formsSchedule: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            formNumber: { type: 'string' },
            title: { type: 'string' },
          },
          required: ['formNumber', 'title'],
          additionalProperties: false,
        },
      },
    },
    required: ['namedInsured', 'insurers', 'policies', 'formsSchedule'],
    additionalProperties: false,
  },
};

const checklistFindingSchema = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['present', 'not_found', 'excluded', 'unclear'] },
    detail: { type: 'string', description: 'Plain-English explanation citing the actual form number and wording found' },
    relevantForms: { type: 'array', items: { type: 'string' } },
    parties: { type: 'array', items: { type: 'string' } },
  },
  required: ['status', 'detail', 'relevantForms', 'parties'],
  additionalProperties: false,
};

const checklistProps = {};
for (const key of CHECKLIST_ITEMS) checklistProps[key] = checklistFindingSchema;

const CHECKLIST_TOOL = {
  name: 'submit_checklist_findings',
  description: 'Submit findings for the 7 special-request checklist items based on the policy endorsements.',
  input_schema: {
    type: 'object',
    properties: { checklistFindings: { type: 'object', properties: checklistProps, required: CHECKLIST_ITEMS, additionalProperties: false } },
    required: ['checklistFindings'],
    additionalProperties: false,
  },
};

const SHARED_RULES = `This is for a licensed insurance agency. Accuracy matters — a wrong limit or a falsely claimed endorsement on a certificate is a real liability (E&O) exposure for the agency, not just a formatting error.

Extract ONLY what is explicitly stated in the document. Never infer, assume, or fill in a value that "should" be there based on typical policies. If a field is not present, omit it (or use an empty string for required string fields) rather than guessing.`;

const CORE_DATA_SYSTEM_PROMPT = `You are extracting the core policy data from a commercial insurance policy PDF to help fill out an ACORD 25 Certificate of Liability Insurance.

${SHARED_RULES}

Rules specific to this task:
- For dates, use MM/DD/YYYY format exactly as shown on the declarations page.
- The "policies" array is ONLY for the four coverage lines an ACORD 25 actually has rows for: General Liability, Automobile Liability, Umbrella/Excess Liability, and Workers' Compensation/Employers' Liability. This policy package may also include other coverage parts on the same Common Policy Declarations — Commercial Inland Marine, Commercial Property, Crime, Cyber, Professional Liability, Equipment Breakdown, etc. DO NOT put those in the "policies" array under any lineOfBusiness value — a Certificate of Liability Insurance has no row for them, and misclassifying one as "generalLiability" (or any other line) would silently corrupt the real liability limits. If a coverage part doesn't clearly match one of the four ACORD 25 lines, leave it out of "policies" entirely.
- Never emit two entries in "policies" with the same "letter" and "lineOfBusiness" unless the policy genuinely has two distinct layers of that same coverage (rare) — a second entry's blank fields can overwrite a first entry's real values downstream.
- List every form/endorsement you see in the Forms Schedule with its form number and title — this does not need interpretation, just a faithful list.
- Do not include NAIC numbers — those come from a separate verified lookup table, not from your reading of the document.`;

const CHECKLIST_SYSTEM_PROMPT = `You are checking a commercial insurance policy PDF for seven specific certificate-of-insurance requests, based strictly on its actual endorsements.

${SHARED_RULES}

Read the full Forms Schedule / list of endorsements carefully — this is the most reliable source. For each of the seven checklist items, determine status strictly from the actual endorsements and their text:
- waiverOfSubrogation: look for a Waiver of Transfer of Rights of Recovery Against Others endorsement (ISO form CG 24 04 or a carrier-proprietary equivalent). Note whether it's blanket ("any person you agree in writing") or limited to specific named parties.
- primaryNonContributory: look for a Primary And Noncontributory - Other Insurance Condition endorsement (ISO CG 20 01 or equivalent).
- ongoingOperationsAI: an Additional Insured endorsement whose grant of coverage is limited to the named insured's ongoing operations (ISO CG 20 10 or a carrier-proprietary "Designated Additional Insured" endorsement with equivalent "in the performance of your ongoing operations" wording).
- completedOperationsAI: an Additional Insured endorsement extending to completed operations / products-completed operations hazard (ISO CG 20 37 or equivalent wording).
- jobServiceLocation: whether any Additional Insured or ongoing-operations endorsement is limited to a specific scheduled location, versus applying blanket to all locations.
- jobServiceProvided: whether coverage or Additional Insured status is limited to specific described operations/work (e.g. a "Designated Work" or "Designated Ongoing Operations" schedule), versus applying to all of the named insured's operations.
- cancellationNotice30Day: any endorsement requiring the carrier to send advance notice of cancellation (of any length) directly to a certificate holder or designated party, beyond the standard ACORD boilerplate "in accordance with the policy provisions" language.

If a checklist item is genuinely ambiguous from the text, use status "unclear" and explain why — do not force a yes/no. If an item is explicitly excluded or the policy states it does NOT apply, use status "excluded" and quote the relevant exclusion.`;

function documentContent(pdfBase64, promptText) {
  return [
    {
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 },
    },
    { type: 'text', text: promptText },
  ];
}

async function callTool({ system, tool, promptText, pdfBase64 }) {
  const client = new Anthropic();
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 8000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium' },
    system,
    tools: [tool],
    tool_choice: { type: 'tool', name: tool.name },
    messages: [{ role: 'user', content: documentContent(pdfBase64, promptText) }],
  });
  const message = await stream.finalMessage();
  const toolUse = message.content.find((b) => b.type === 'tool_use');
  if (!toolUse) {
    throw new Error(`No tool_use block in response from ${tool.name}. stop_reason=${message.stop_reason}`);
  }
  return toolUse.input;
}

export async function extractPolicyData(pdfBase64) {
  const [coreData, checklistResult] = await Promise.all([
    callTool({
      system: CORE_DATA_SYSTEM_PROMPT,
      tool: CORE_DATA_TOOL,
      promptText: 'Extract this commercial policy\'s core data into the submit_policy_core_data tool, following the rules in the system prompt exactly.',
      pdfBase64,
    }),
    callTool({
      system: CHECKLIST_SYSTEM_PROMPT,
      tool: CHECKLIST_TOOL,
      promptText: 'Evaluate this commercial policy against the 7 checklist items and submit via the submit_checklist_findings tool, following the rules in the system prompt exactly.',
      pdfBase64,
    }),
  ]);

  return {
    ...coreData,
    checklistFindings: checklistResult.checklistFindings,
  };
}
