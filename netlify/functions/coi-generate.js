// coi-generate.js — staff-only. Takes the staff-reviewed/edited certificate
// data and fills the real ACORD 25, returning the finished (still-editable,
// not flattened) PDF for download.
import { mapToAcordFields } from './lib/map-to-acord.mjs';
import { fillAcord25 } from './lib/fill-pdf.mjs';

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

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response('', { status: 200, headers: cors });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  let body;
  try {
    body = await req.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const { password, data } = body;
  if (!process.env.COI_STAFF_PASSWORD || password !== process.env.COI_STAFF_PASSWORD) {
    return new Response(JSON.stringify({ error: 'Incorrect password' }), {
      status: 401,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
  if (!data) {
    return new Response(JSON.stringify({ error: 'No certificate data provided' }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  try {
    const fullData = {
      ...data,
      producer: data.producer || AGENCY_INFO,
      formCompletionDate: data.formCompletionDate || new Date().toLocaleDateString('en-US'),
    };
    const fields = mapToAcordFields(fullData);
    const pdfBytes = await fillAcord25(fields);

    const insuredName = (data.namedInsured && data.namedInsured.fullName) || 'certificate';
    const safeName = insuredName.replace(/[^a-z0-9]+/gi, '-').toLowerCase();

    return new Response(pdfBytes, {
      status: 200,
      headers: {
        ...cors,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="COI-${safeName}.pdf"`,
      },
    });
  } catch (e) {
    console.error('coi-generate error:', e);
    return new Response(JSON.stringify({ error: 'PDF generation failed: ' + e.message }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
};
