// cancellation-resend.js — staff-only. Re-sends the signed copy (client +
// staff BCC) for a record that's already been signed, using the original
// attestation captured at signing time. For cases where the original
// cancellation-sign.js email failed or didn't arrive.
import { getStore } from '@netlify/blobs';
import { sendEmail } from './lib/resend.mjs';
import { renderLetterPdf } from './lib/cancellation-pdf.mjs';
import { buildFinal } from './lib/cancellation-letters.mjs';

const FROM_ADDRESS = 'The East Agency <cancellations@mail.brannoneast.agency>';
const STAFF_EMAILS = ['info@brannoneastagency.com', 'brannoneast1@gmail.com'];

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

  const { password, id } = body;
  if (!process.env.COI_STAFF_PASSWORD || password !== process.env.COI_STAFF_PASSWORD) {
    return new Response(JSON.stringify({ error: 'Incorrect password' }), { status: 401, headers: cors });
  }
  if (!id) {
    return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400, headers: cors });
  }

  try {
    const store = getStore({ name: 'cancellation-letters', consistency: 'strong' });
    const record = await store.get(id, { type: 'json' });
    if (!record) {
      return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: cors });
    }
    if (record.status !== 'signed' || !record.attestation) {
      return new Response(JSON.stringify({ error: 'Record is not signed yet — nothing to resend' }), { status: 400, headers: cors });
    }

    const { data, attestation } = record;
    const letter = buildFinal(data, attestation);

    const pdfBytes = await renderLetterPdf({ heading: letter.pdfHeading, paragraphs: letter.pdfParagraphs });
    const pdfBase64 = Buffer.from(pdfBytes).toString('base64');
    const safeName = String(data.clientName || 'client').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    const attachments = [{ filename: `cancellation-${safeName}.pdf`, content: pdfBase64 }];

    await sendEmail({
      from: FROM_ADDRESS,
      to: data.clientEmail,
      bcc: STAFF_EMAILS,
      subject: letter.clientEmailSubject,
      html: letter.clientEmailHtml,
      attachments,
    });

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: cors });
  } catch (e) {
    console.error('cancellation-resend error:', e);
    return new Response(JSON.stringify({ error: 'Resend failed: ' + e.message }), { status: 500, headers: cors });
  }
};
