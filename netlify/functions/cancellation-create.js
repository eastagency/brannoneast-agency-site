// cancellation-create.js — staff-only. Staff fills in the policy/client
// details (no attestation — the client provides that themselves). This
// stores a pending record in Netlify Blobs and emails the client a link to
// review and sign it. Nothing is sent to the client's final recipients
// (or, for Type 2, staged for the prior agent) until they actually sign —
// see cancellation-sign.js.
import { getStore } from '@netlify/blobs';
import { randomUUID } from 'node:crypto';
import { sendEmail } from './lib/resend.mjs';
import { buildBody } from './lib/cancellation-letters.mjs';

const FROM_ADDRESS = 'The East Agency <cancellations@mail.brannoneast.agency>';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

function isValidEmail(e) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e || '');
}

function missingFields(letterType, data) {
  const common = ['clientName', 'clientEmail', 'policyNumber', 'effectiveDate'];
  const type1Only = ['carrier', 'lineOfBusiness', 'reason', 'replacementConfirmed', 'refundDisposition'];
  const type2Only = ['priorAgentName', 'priorAgentEmail'];
  const required = common.concat(letterType === 1 ? type1Only : type2Only);
  return required.filter((f) => !data[f] || String(data[f]).trim() === '');
}

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

  const { password, letterType, data } = body;

  if (!process.env.COI_STAFF_PASSWORD || password !== process.env.COI_STAFF_PASSWORD) {
    return new Response(JSON.stringify({ error: 'Incorrect password' }), { status: 401, headers: cors });
  }
  if (letterType !== 1 && letterType !== 2) {
    return new Response(JSON.stringify({ error: 'letterType must be 1 or 2' }), { status: 400, headers: cors });
  }
  if (!data) {
    return new Response(JSON.stringify({ error: 'No letter data provided' }), { status: 400, headers: cors });
  }
  if (!isValidEmail(data.clientEmail)) {
    return new Response(JSON.stringify({ error: 'Invalid client email' }), { status: 400, headers: cors });
  }
  if (letterType === 2 && !isValidEmail(data.priorAgentEmail)) {
    return new Response(JSON.stringify({ error: 'Invalid prior agent email' }), { status: 400, headers: cors });
  }
  const missing = missingFields(letterType, data);
  if (missing.length) {
    return new Response(JSON.stringify({ error: `Missing required fields: ${missing.join(', ')}` }), { status: 400, headers: cors });
  }

  try {
    const id = randomUUID();
    const store = getStore({ name: 'cancellation-letters', consistency: 'strong' });
    await store.setJSON(id, {
      id,
      letterType,
      data,
      status: 'pending',
      createdAt: new Date().toISOString(),
    });

    const origin = new URL(req.url).origin;
    const signLink = `${origin}/sign?id=${id}`;
    const body_ = buildBody(letterType, data);

    const subject = letterType === 1
      ? 'Please review and sign your cancellation record — The East Agency'
      : 'Please review and sign your cancellation request — The East Agency';

    const html = `
      <p>Hi ${data.clientName},</p>
      <p>The East Agency has prepared the following for your review:</p>
      ${body_.html}
      <p><a href="${signLink}" style="background:#1F7A75;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block">Review &amp; Sign</a></p>
      <p style="font-size:12px;color:#666">If the button doesn't work, copy this link: ${signLink}</p>`;

    await sendEmail({ from: FROM_ADDRESS, to: data.clientEmail, subject, html });

    return new Response(JSON.stringify({ success: true, id }), { status: 200, headers: cors });
  } catch (e) {
    console.error('cancellation-create error:', e);
    return new Response(JSON.stringify({ error: 'Create failed: ' + e.message }), { status: 500, headers: cors });
  }
};
