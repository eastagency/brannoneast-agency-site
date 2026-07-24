// coi-status.js — staff-only. The staff page polls this every few seconds
// with the jobId returned by coi-extract-start, to find out when the
// background extraction has finished (see coi-extract-background.js).
import { getStore } from '@netlify/blobs';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, X-Coi-Password',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json',
};

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response('', { status: 200, headers: cors });
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: cors });
  }

  const password = req.headers.get('x-coi-password');
  if (!process.env.COI_STAFF_PASSWORD || password !== process.env.COI_STAFF_PASSWORD) {
    return new Response(JSON.stringify({ error: 'Incorrect password' }), { status: 401, headers: cors });
  }

  const jobId = new URL(req.url).searchParams.get('jobId');
  if (!jobId) {
    return new Response(JSON.stringify({ error: 'Missing jobId' }), { status: 400, headers: cors });
  }

  const jobStore = getStore({ name: 'coi-jobs', consistency: 'strong' });
  const job = await jobStore.get(jobId, { type: 'json' });
  if (!job) {
    return new Response(JSON.stringify({ status: 'not_found' }), { status: 200, headers: cors });
  }

  return new Response(JSON.stringify(job), { status: 200, headers: cors });
};
