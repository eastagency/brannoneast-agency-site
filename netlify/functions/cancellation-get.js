// cancellation-get.js — public (no staff password). Lets the client fetch
// their pending letter for review before signing. The id itself (an
// unguessable UUID, emailed only to the client) is the access control here —
// same lightweight-link model Brannon signed off on, not a formal
// authenticated e-signature flow.
import { getStore } from '@netlify/blobs';
import { buildBody } from './lib/cancellation-letters.mjs';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json',
};

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response('', { status: 200, headers: cors });
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: cors });
  }

  const id = new URL(req.url).searchParams.get('id');
  if (!id) {
    return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400, headers: cors });
  }

  const store = getStore({ name: 'cancellation-letters', consistency: 'strong' });
  const record = await store.get(id, { type: 'json' });
  if (!record) {
    return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: cors });
  }

  const body = buildBody(record.data);
  return new Response(JSON.stringify({
    status: record.status,
    signedAt: record.signedAt || null,
    clientName: record.data.clientName,
    heading: body.heading,
    html: body.html,
  }), { status: 200, headers: cors });
};
