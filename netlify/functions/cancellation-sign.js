// cancellation-sign.js — public (no staff password, gated by the unguessable
// id link the client received by email). This is the real attestation
// moment: typed name + certification checkbox + timestamp + IP are all
// captured from the CLIENT'S own request here, not entered by staff.
//
// Only once this fires do the real sends go out:
// - Type 1: client gets their signed copy, BCC to STAFF_EMAILS.
// - Type 2: client gets their signed copy immediately. The copy meant for
//   the prior agent goes to STAFF_EMAILS for Brannon to review and forward
//   manually — never straight to the prior agent.
import { getStore } from '@netlify/blobs';
import { sendEmail } from './lib/resend.mjs';
import { renderLetterPdf } from './lib/cancellation-pdf.mjs';
import { buildFinal } from './lib/cancellation-letters.mjs';

const FROM_ADDRESS = 'The East Agency <cancellations@mail.brannoneast.agency>';
// info@ is on a brand-new sending domain with no DMARC yet — Microsoft 365
// (hosted via GoDaddy) may quarantine first-contact mail from it. gmail is
// a redundant backup until info@ delivery is confirmed reliable; remove it
// once that's verified.
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

  const { id, typedName, certified } = body;
  if (!id) {
    return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400, headers: cors });
  }
  if (!typedName || !String(typedName).trim() || !certified) {
    return new Response(JSON.stringify({ error: 'Typed name and the certification checkbox are both required' }), { status: 400, headers: cors });
  }

  const store = getStore({ name: 'cancellation-letters', consistency: 'strong' });
  const record = await store.get(id, { type: 'json' });
  if (!record) {
    return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: cors });
  }
  if (record.status === 'signed') {
    return new Response(JSON.stringify({ error: 'already_signed', signedAt: record.signedAt }), { status: 409, headers: cors });
  }

  try {
    const timestamp = new Date().toISOString();
    const dateStr = new Date().toLocaleDateString('en-US');
    const ip = req.headers.get('x-nf-client-connection-ip') || req.headers.get('x-forwarded-for') || 'unknown';
    const meta = { typedName: String(typedName).trim(), dateStr, timestamp, ip };

    const { letterType, data } = record;
    const letter = buildFinal(letterType, data, meta);

    const pdfBytes = await renderLetterPdf({ heading: letter.pdfHeading, paragraphs: letter.pdfParagraphs });
    const pdfBase64 = Buffer.from(pdfBytes).toString('base64');
    const safeName = String(data.clientName || 'client').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    const attachments = [{ filename: `cancellation-${safeName}.pdf`, content: pdfBase64 }];

    if (letterType === 1) {
      await sendEmail({
        from: FROM_ADDRESS,
        to: data.clientEmail,
        bcc: STAFF_EMAILS,
        subject: letter.clientEmailSubject,
        html: letter.clientEmailHtml,
        attachments,
      });
    } else {
      await sendEmail({
        from: FROM_ADDRESS,
        to: data.clientEmail,
        subject: letter.clientEmailSubject,
        html: letter.clientEmailHtml,
        attachments,
      });
      await sendEmail({
        from: FROM_ADDRESS,
        to: STAFF_EMAILS,
        subject: letter.internalReviewSubject,
        html: letter.internalReviewHtml,
        attachments,
      });
    }

    await store.setJSON(id, {
      ...record,
      status: 'signed',
      signedAt: timestamp,
      attestation: meta,
    });

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: cors });
  } catch (e) {
    console.error('cancellation-sign error:', e);
    return new Response(JSON.stringify({ error: 'Sign/send failed: ' + e.message }), { status: 500, headers: cors });
  }
};
