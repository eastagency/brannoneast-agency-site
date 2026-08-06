// resend.mjs — thin wrapper around the Resend REST API. No SDK dependency,
// same style as the raw-fetch GHL call in submission-created.js.
const RESEND_API_KEY = process.env.RESEND_API_KEY;

export async function sendEmail({ from, to, bcc, subject, html, attachments }) {
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to,
      ...(bcc && { bcc }),
      subject,
      html,
      ...(attachments && { attachments }),
    }),
  });

  const result = await resp.json();
  if (!resp.ok) {
    throw new Error(`Resend send failed: ${JSON.stringify(result)}`);
  }
  return result;
}
