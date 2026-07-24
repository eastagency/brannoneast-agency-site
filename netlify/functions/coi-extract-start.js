// coi-extract-start.js — staff-only. Kicks off policy extraction as a
// background job instead of doing the work inline.
//
// Why: reading a real multi-page commercial policy PDF and extracting both
// the core data and the 7-item checklist takes 45-60+ seconds. Netlify's
// synchronous function ceiling is 30 seconds (confirmed directly against the
// real Netlify runtime, not just assumed) — no combination of splitting the
// work into parallel calls gets reliably under that for a real policy. A
// Background Function (15-minute ceiling) is the only architecture that
// actually holds for arbitrarily large/complex policies.
//
// This function does the fast, synchronous part: validate the password and
// file size, stash the PDF bytes in Netlify Blobs under a job id, fire the
// background function (which reads the PDF back out of Blobs by that same
// job id), and return the job id immediately so the staff page can poll
// coi-status for the result.
import { getStore } from '@netlify/blobs';

const MAX_BYTES = 5.5 * 1024 * 1024; // stay under Netlify's ~6MB request payload limit with headroom

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, X-Coi-Password, X-Job-Id',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response('', { status: 200, headers: cors });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: cors });
  }

  const password = req.headers.get('x-coi-password');
  if (!process.env.COI_STAFF_PASSWORD || password !== process.env.COI_STAFF_PASSWORD) {
    return new Response(JSON.stringify({ error: 'Incorrect password' }), { status: 401, headers: cors });
  }

  let pdfBuffer;
  try {
    const arrayBuffer = await req.arrayBuffer();
    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
      return new Response(JSON.stringify({ error: 'No policy PDF provided' }), { status: 400, headers: cors });
    }
    if (arrayBuffer.byteLength > MAX_BYTES) {
      return new Response(
        JSON.stringify({
          error: `This policy PDF is ${(arrayBuffer.byteLength / 1024 / 1024).toFixed(1)}MB, which is over the ${(MAX_BYTES / 1024 / 1024).toFixed(0)}MB limit this tool currently supports. Ask Brannon to add large-file support (it needs a direct-to-storage upload path), or split/compress the PDF if possible.`,
        }),
        { status: 413, headers: cors }
      );
    }
    pdfBuffer = Buffer.from(arrayBuffer);
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Could not read uploaded file' }), { status: 400, headers: cors });
  }

  const jobId = crypto.randomUUID();

  try {
    const pdfStore = getStore({ name: 'coi-pdf-uploads', consistency: 'strong' });
    await pdfStore.set(jobId, pdfBuffer);

    const jobStore = getStore({ name: 'coi-jobs', consistency: 'strong' });
    await jobStore.setJSON(jobId, { status: 'processing', startedAt: Date.now() });

    // Fire the background function and don't wait for it to finish — Netlify
    // returns 202 for background functions almost instantly regardless of how
    // long the function body actually runs.
    const origin = new URL(req.url).origin;
    await fetch(`${origin}/.netlify/functions/coi-extract-background`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId }),
    });

    return new Response(JSON.stringify({ jobId }), { status: 200, headers: cors });
  } catch (e) {
    console.error('coi-extract-start error:', e);
    return new Response(JSON.stringify({ error: 'Could not start extraction: ' + e.message }), { status: 500, headers: cors });
  }
};
