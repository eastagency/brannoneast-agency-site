// coi-extract-background.js — the "-background" suffix in the filename is
// what tells Netlify to run this as a Background Function (15-minute ceiling,
// caller gets an immediate empty 202 and never sees this function's return
// value). Triggered by coi-extract-start, which already validated the
// password and stashed the PDF in Netlify Blobs under `jobId`.
//
// All errors are caught and written into the job record as status "error"
// rather than thrown, so a deterministic failure (e.g. a malformed Claude
// response) doesn't trigger Netlify's automatic background-function retries
// (it retries failed/thrown invocations after 1 minute, then 2 minutes).
import { getStore } from '@netlify/blobs';
import { extractPolicyData } from './lib/extract.mjs';
import { lookupNaic } from './lib/naic-carriers.mjs';

export default async (req) => {
  const jobStore = getStore({ name: 'coi-jobs', consistency: 'strong' });
  const pdfStore = getStore({ name: 'coi-pdf-uploads', consistency: 'strong' });

  let jobId;
  try {
    ({ jobId } = await req.json());
    if (!jobId) throw new Error('Missing jobId');

    const pdfBuffer = await pdfStore.get(jobId, { type: 'arrayBuffer' });
    if (!pdfBuffer) throw new Error('Uploaded policy PDF not found (it may have expired) — please re-upload.');

    const pdfBase64 = Buffer.from(pdfBuffer).toString('base64');
    const extracted = await extractPolicyData(pdfBase64);

    const naicWarnings = [];
    for (const insurer of extracted.insurers || []) {
      const naic = lookupNaic(insurer.fullName);
      insurer.naic = naic || '';
      if (!naic) naicWarnings.push(insurer.fullName);
    }

    await jobStore.setJSON(jobId, { status: 'done', extracted, naicWarnings, finishedAt: Date.now() });
  } catch (e) {
    console.error('coi-extract-background error:', e);
    if (jobId) {
      await jobStore.setJSON(jobId, { status: 'error', message: e.message, finishedAt: Date.now() });
    }
  } finally {
    if (jobId) {
      // The uploaded policy is a client's real insurance document — don't
      // keep a copy in blob storage longer than it takes to process it.
      await pdfStore.delete(jobId).catch(() => {});
    }
  }

  return new Response('', { status: 200 });
};
