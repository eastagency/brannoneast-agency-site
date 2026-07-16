// submission-created.js
// Fires automatically on every Netlify form submission.
// Validates for spam, then creates a contact in GoHighLevel.

const GHL_API_KEY = process.env.GHL_API_KEY;
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID;

const DISPOSABLE_DOMAINS = [
  'mailinator.com','guerrillamail.com','tempmail.com','throwaway.email',
  'yopmail.com','sharklasers.com','grr.la','spam4.me','trashmail.com',
  'dispostable.com','maildrop.cc','temp-mail.org','fakeinbox.com',
  'spamgourmet.com','getnada.com','getairmail.com','filzmail.com',
  'trashmail.net','trashmail.at','discard.email','spamspot.com'
];

function isValidEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e); }
function isDisposable(e) { return DISPOSABLE_DOMAINS.includes(e.split('@')[1]?.toLowerCase()); }
function isValidPhone(p) { return p && p.replace(/\D/g,'').length >= 10; }
function isValidZip(z) { return !z || /^\d{5}$/.test(z.trim()); }
function hasSpam(v) { return v && /<[^>]+>|https?:\/\/|www\./i.test(v); }

function spamCheck(data) {
  const reasons = [];
  if (data['bot-field']) reasons.push('honeypot');
  if (!data.email || !isValidEmail(data.email)) reasons.push('bad email');
  if (data.email && isDisposable(data.email)) reasons.push('disposable email');
  if (!data.first_name || data.first_name.trim().length < 2) reasons.push('bad first name');
  if (!data.last_name || data.last_name.trim().length < 2) reasons.push('bad last name');
  if (hasSpam(data.first_name) || hasSpam(data.last_name)) reasons.push('spam in name');
  if (hasSpam(data.email)) reasons.push('spam in email');
  if (data.phone && !isValidPhone(data.phone)) reasons.push('bad phone');
  if (!isValidZip(data.zip)) reasons.push('bad zip');
  return reasons;
}

export default async (req) => {
  if (req.method !== 'POST') return new Response('{}', { status: 200 });

  try {
    const body = await req.json();
    const data = body.payload?.data || {};
    const formName = body.payload?.form_name || '';
    // Only process quote forms (skip contact page, etc.)
    const isQuoteForm = formName.includes('insurance') || formName.includes('quote');
    if (!isQuoteForm) return new Response('{}', { status: 200 });

    // Spam check
    const spamReasons = spamCheck(data);
    if (spamReasons.length > 0) {
      console.log(`[GHL] Blocked "${formName}" from ${data.email}: ${spamReasons.join(', ')}`);
      return new Response(JSON.stringify({ blocked: true, reasons: spamReasons }), { status: 200 });
    }

    // Clean phone to E.164
    const rawPhone = data.phone?.replace(/\D/g, '') || '';
    const phone = rawPhone.length >= 10 ? `+1${rawPhone.slice(-10)}` : undefined;

    const contact = {
      locationId: GHL_LOCATION_ID,
      firstName: data.first_name.trim(),
      lastName: data.last_name.trim(),
      email: data.email.trim().toLowerCase(),
      ...(phone && { phone }),
      ...(data.zip && { postalCode: data.zip.trim() }),
      source: 'Website Quote Form',
      tags: [
        'Website Lead',
        data.policy_type || formName,
        'Needs Quote'
      ]
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

    if (resp.ok) {
      console.log(`[GHL] Created contact: ${contact.firstName} ${contact.lastName} (${contact.email}) — ${data.policy_type}`);
      return new Response(JSON.stringify({ success: true, id: result.contact?.id }), { status: 200 });
    } else {
      // If contact already exists (409), that is fine — not an error
      if (resp.status === 409) {
        console.log(`[GHL] Contact already exists: ${contact.email}`);
        return new Response(JSON.stringify({ exists: true }), { status: 200 });
      }
      console.error('[GHL] API error:', JSON.stringify(result));
      return new Response(JSON.stringify({ success: false }), { status: 200 });
    }

  } catch (e) {
    console.error('[GHL] Error:', e.message);
    return new Response(JSON.stringify({ error: e.message }), { status: 200 });
  }
};
