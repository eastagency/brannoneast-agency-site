﻿// ghl-create.js — called by assets/chat.js after a successful chat submission
// Creates a contact in GoHighLevel from chat-collected form data.

const GHL_API_KEY    = process.env.GHL_API_KEY;
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response('', { status: 200, headers: cors });
  if (req.method !== 'POST')   return new Response('{}', { status: 200, headers: cors });

  try {
    const fd = await req.json();

    if (!fd.email || !fd.first_name) {
      return new Response(JSON.stringify({ skip: true }), { status: 200, headers: cors });
    }

    const rawPhone = (fd.phone || '').replace(/\D/g, '');
    const phone = rawPhone.length >= 10 ? `+1${rawPhone.slice(-10)}` : undefined;

    const contact = {
      locationId: GHL_LOCATION_ID,
      firstName: fd.first_name.trim(),
      lastName: (fd.last_name || '').trim(),
      email: fd.email.trim().toLowerCase(),
      ...(phone && { phone }),
      ...(fd.zip && { postalCode: fd.zip.trim() }),
      source: 'Website Chat Quote',
      tags: ['Website Lead', fd.policy_type || 'Quote', 'Needs Quote']
    };

    const resp = await fetch('https://services.leadconnectorhq.com/contacts/', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GHL_API_KEY}`,
        'Content-Type': 'application/json',
        'Version': '2021-07-28'
      },
      body: JSON.stringify(contact)
    });

    const result = await resp.json();

    if (resp.ok || resp.status === 409) {
      console.log(`[GHL] Chat contact: ${contact.firstName} ${contact.lastName} (${fd.policy_type})`);
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: cors });
    }

    console.error('[GHL] Error:', JSON.stringify(result));
    return new Response(JSON.stringify({ success: false }), { status: 200, headers: cors });

  } catch (e) {
    console.error('[GHL] Exception:', e.message);
    return new Response(JSON.stringify({ error: e.message }), { status: 200, headers: cors });
  }
};

