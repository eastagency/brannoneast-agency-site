// cancellation-letters.mjs — builds the letter content (for both the PDF
// record and the email bodies) for the two cancellation letter types.
// Wording matches the drafts Brannon approved: lightweight click-attestation
// only, no TCPA/CAN-SPAM opt-out language (deliberately left out for now).
//
// Split into a "body" (policy/client facts, no attestation) and an
// "attestation" section appended once the client actually signs — the body
// is what's shown to the client for review before they sign; the finished
// letter is body + attestation together.

const REASON_LABELS = {
  switched_carriers: 'Switched carriers',
  sold_no_longer_own: 'Sold / no longer own insured asset',
  no_longer_needed: 'No longer needed',
  non_payment: 'Non-payment',
  other: 'Other',
};

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function type1Body(data) {
  const reasonLabel = data.reason === 'other'
    ? (data.reasonOther || 'Other')
    : (REASON_LABELS[data.reason] || data.reason || '');

  const replacement = data.replacementConfirmed === 'yes'
    ? `Yes, effective ${data.replacementDate || '(not provided)'}`
    : 'No — client acknowledges no coverage gap risk was reviewed with agent.';

  const refundLabel = { pro_rata: 'Pro-rata refund due', short_rate: 'Short-rate per policy terms', none: 'No refund due' }[data.refundDisposition] || data.refundDisposition || '';
  const refundAmount = data.refundAmount ? ` (Amount: ${data.refundAmount})` : '';

  const pdfParagraphs = [
    `Client Name: ${data.clientName}`,
    `Policy Number: ${data.policyNumber}`,
    `Carrier: ${data.carrier}`,
    `Line of Business: ${data.lineOfBusiness}`,
    '',
    `Requested Cancellation Effective Date: ${data.effectiveDate}`,
    '',
    `Reason for Cancellation: ${reasonLabel}`,
    '',
    `Replacement Coverage Confirmed? ${replacement}`,
    '',
    `Refund Disposition: ${refundLabel}${refundAmount}`,
  ];

  const html = `
    <ul>
      <li>Policy Number: ${esc(data.policyNumber)}</li>
      <li>Carrier: ${esc(data.carrier)} (${esc(data.lineOfBusiness)})</li>
      <li>Requested Effective Date: ${esc(data.effectiveDate)}</li>
      <li>Reason: ${esc(reasonLabel)}</li>
      <li>Replacement Coverage Confirmed: ${esc(replacement)}</li>
      <li>Refund Disposition: ${esc(refundLabel)}${esc(refundAmount)}</li>
    </ul>`;

  return { heading: 'THE EAST AGENCY — POLICY CANCELLATION RECORD', pdfParagraphs, html };
}

function type2Body(data) {
  const pdfParagraphs = [
    `To: ${data.priorAgentName} <${data.priorAgentEmail}>`,
    `From: ${data.clientName}, on behalf of The East Agency (new agent of record)`,
    '',
    `Policy Number: ${data.policyNumber}`,
    `Insured Name: ${data.clientName}`,
    '',
    `This letter serves as notice that the above-referenced policy is being cancelled, effective ${data.effectiveDate}.`,
    '',
    'I have selected The East Agency as my new agent of record and have secured replacement coverage. Please:',
    '1. Cancel the referenced policy effective the date above.',
    '2. Process any pro-rata refund of unearned premium.',
    '3. Send written confirmation of cancellation and refund to both parties listed below.',
    '',
    `Client Email: ${data.clientEmail}`,
    'Copy to (new agent): info@brannoneastagency.com',
  ];

  const html = `
    <p>To: ${esc(data.priorAgentName)} &lt;${esc(data.priorAgentEmail)}&gt;<br>
    From: ${esc(data.clientName)}, on behalf of The East Agency (new agent of record)</p>
    <ul>
      <li>Policy Number: ${esc(data.policyNumber)}</li>
      <li>Requested Effective Date: ${esc(data.effectiveDate)}</li>
    </ul>
    <p>This letter serves as notice that the above-referenced policy is being cancelled, effective ${esc(data.effectiveDate)}. The client has selected The East Agency as their new agent of record and secured replacement coverage. It requests the prior agent cancel the policy, process any pro-rata refund, and confirm in writing to both the client and info@brannoneastagency.com.</p>`;

  return { heading: 'CANCELLATION REQUEST', pdfParagraphs, html };
}

export function buildBody(letterType, data) {
  return letterType === 1 ? type1Body(data) : type2Body(data);
}

function attestationParagraphs(certifyText, typedName, dateStr, timestamp, ip) {
  return [
    '## Client Attestation',
    certifyText,
    `Typed Name: ${typedName}     Date: ${dateStr}`,
    `(Recorded: ${timestamp} — IP address ${ip})`,
  ];
}

function attestationHtml(certifyText, typedName, dateStr, timestamp, ip) {
  return `
    <p style="margin-top:20px"><strong>Client Attestation</strong><br>
    ${esc(certifyText)}<br>
    Typed Name: <strong>${esc(typedName)}</strong> &nbsp; Date: ${esc(dateStr)}<br>
    <span style="color:#666;font-size:12px">Recorded: ${esc(timestamp)} — IP address ${esc(ip)}</span></p>`;
}

// Called once the client has actually signed. meta = { typedName, dateStr, timestamp, ip }
// captured from the client's own signing request, not entered by staff.
export function buildFinal(letterType, data, meta) {
  const body = buildBody(letterType, data);
  const certifyText = letterType === 1
    ? 'I certify the above is accurate and confirm I am requesting this cancellation.'
    : 'I certify the above is accurate and confirm I am requesting this cancellation on my policy.';

  const pdfParagraphs = [
    ...body.pdfParagraphs,
    '',
    ...attestationParagraphs(certifyText, meta.typedName, meta.dateStr, meta.timestamp, meta.ip),
  ];

  const attestHtml = attestationHtml(certifyText, meta.typedName, meta.dateStr, meta.timestamp, meta.ip);

  const clientIntro = letterType === 1
    ? `<p>Hi ${esc(data.clientName)},</p><p>This confirms your signed policy cancellation record with The East Agency. A copy is attached as a PDF for your files.</p>`
    : `<p>Hi ${esc(data.clientName)},</p><p>This is your signed copy of the cancellation request regarding your policy with ${esc(data.priorAgentName)}. A PDF copy is attached for your records.</p>`;

  const clientEmailHtml = `${clientIntro}${body.html}${attestHtml}<p>Questions? Reply to this email or call The East Agency.</p>`;

  const result = {
    pdfHeading: body.heading,
    pdfParagraphs,
    clientEmailSubject: letterType === 1 ? 'Your Signed Policy Cancellation Record — The East Agency' : 'Your Signed Cancellation Request — The East Agency',
    clientEmailHtml,
  };

  if (letterType === 2) {
    result.internalReviewSubject = `Signed — review & forward to ${data.priorAgentName}: ${data.clientName}`;
    result.internalReviewHtml = `
      <p><strong>Action needed:</strong> the client has signed. Forward the attached cancellation request to the prior agent below. This was intentionally routed here first, not sent directly, so you can glance at it before it lands with a competing agency.</p>
      <ul>
        <li>Prior agent: ${esc(data.priorAgentName)} — <strong>${esc(data.priorAgentEmail)}</strong></li>
        <li>Client: ${esc(data.clientName)} (${esc(data.clientEmail)})</li>
        <li>Policy Number: ${esc(data.policyNumber)}</li>
        <li>Effective Date: ${esc(data.effectiveDate)}</li>
      </ul>
      ${attestHtml}`;
  }

  return result;
}
