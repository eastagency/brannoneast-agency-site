// cancellation-list.js — staff-only. Lists recent cancellation records so
// staff can find a specific letter (e.g. to resend a copy that failed to
// deliver) without needing direct access to the Netlify Blobs store.
import { getStore } from '@netlify/blobs';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response('', { status: 200, headers: cors });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: cors });
  }

  let body;
  try {
    body = await req.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: cors });
  }

  const { password } = body;
  if (!process.env.COI_STAFF_PASSWORD || password !== process.env.COI_STAFF_PASSWORD) {
    return new Response(JSON.stringify({ error: 'Incorrect password' }), { status: 401, headers: cors });
  }

  try {
    const store = getStore({ name: 'cancellation-letters', consistency: 'strong' });
    const { blobs } = await store.list();

    const records = await Promise.all(
      blobs.map(async ({ key }) => {
        const record = await store.get(key, { type: 'json' });
        if (!record) return null;
        return {
          id: record.id,
          clientName: record.data?.clientName || '(unknown)',
          clientEmail: record.data?.clientEmail || '',
          status: record.status,
          createdAt: record.createdAt,
          signedAt: record.signedAt || null,
        };
      })
    );

    const sorted = records
      .filter(Boolean)
      .sort((a, b) => new Date(b.signedAt || b.createdAt) - new Date(a.signedAt || a.createdAt));

    return new Response(JSON.stringify({ records: sorted }), { status: 200, headers: cors });
  } catch (e) {
    console.error('cancellation-list error:', e);
    return new Response(JSON.stringify({ error: 'List failed: ' + e.message }), { status: 500, headers: cors });
  }
};
