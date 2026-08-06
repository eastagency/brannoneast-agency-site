// cancellation-letters.mjs — builds the cancellation record letter content
// (for both the PDF and the email bodies). Lightweight click-attestation
// only, no TCPA/CAN-SPAM opt-out language (deliberately left out for now).
// Single letter type: an internal cancellation record, signed by the
// client. If it needs to go to a prior agent/carrier, staff forward the
// signed PDF themselves — there's no separate "Type 2" letter anymore.
//
// Supports multiple lines of business cancelling together (e.g. Home + Auto
// + Umbrella in one letter, each with its own policy number), a client
// address, and an optional forwarding address that determines where any
// refund/correspondence should go.

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

function formatAddress(street, city, state, zip) {
  if (!street) return '';
  return `${street}, ${city}, ${state} ${zip}`;
}

function lineLabel(l) {
  return l.line === 'Other' ? (l.otherLabel || 'Other') : l.line;
}

export function buildBody(data) {
  const reasonLabel = data.reason === 'other'
    ? (data.reasonOther || 'Other')
    : (REASON_LABELS[data.reason] || data.reason || '');

  const replacement = data.replacementConfirmed === 'yes'
    ? `Yes, effective ${data.replacementDate || '(not provided)'}`
    : 'No — client acknowledges no coverage gap risk was reviewed with agent.';

  const refundLabel = { pro_rata: 'Pro-rata refund due', short_rate: 'Short-rate per policy terms', none: 'No refund due' }[data.refundDisposition] || data.refundDisposition || '';
  const refundAmount = data.refundAmount ? ` (Amount: ${data.refundAmount})` : '';

  const clientAddress = formatAddress(data.clientAddressStreet, data.clientAddressCity, data.clientAddressState, data.clientAddressZip);
  const hasForwarding = !!(data.useForwardingAddress && data.forwardingAddressStreet);
  const forwardingAddress = hasForwarding
    ? formatAddress(data.forwardingAddressStreet, data.forwardingAddressCity, data.forwardingAddressState, data.forwardingAddressZip)
    : '';
  const refundAddress = hasForwarding ? forwardingAddress : clientAddress;

  const lines = Array.isArray(data.linesOfBusiness) ? data.linesOfBusiness : [];
  const lineItems = lines.map((l) => `${lineLabel(l)} — Policy #${l.policyNumber}`);

  const pdfParagraphs = [
    `Client Name: ${data.clientName}`,
    `Client Address: ${clientAddress}`,
    ...(hasForwarding ? [`Forwarding / New Address: ${forwardingAddress}`] : []),
    '',
    `Prior Carrier: ${data.priorCarrier}`,
    'Policies Being Cancelled:',
    ...lineItems.map((t) => `  - ${t}`),
    '',
    `Requested Cancellation Effective Date: ${data.effectiveDate}`,
    '',
    `Reason for Cancellation: ${reasonLabel}`,
    '',
    `Replacement Coverage Confirmed? ${replacement}`,
    '',
    `Refund Disposition: ${refundLabel}${refundAmount}`,
    `Refund / Correspondence Address: ${refundAddress}`,
  ];

  const html = `
    <ul>
      <li>Client Address: ${esc(clientAddress)}</li>
      ${hasForwarding ? `<li>Forwarding / New Address: ${esc(forwardingAddress)}</li>` : ''}
      <li>Prior Carrier: ${esc(data.priorCarrier)}</li>
      <li>Policies Being Cancelled: ${lineItems.map(esc).join('; ')}</li>
      <li>Requested Effective Date: ${esc(data.effectiveDate)}</li>
      <li>Reason: ${esc(reasonLabel)}</li>
      <li>Replacement Coverage Confirmed: ${esc(replacement)}</li>
      <li>Refund Disposition: ${esc(refundLabel)}${esc(refundAmount)}</li>
      <li>Refund / Correspondence Address: ${esc(refundAddress)}</li>
    </ul>`;

  return { heading: 'THE EAST AGENCY — POLICY CANCELLATION RECORD', pdfParagraphs, html };
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
export function buildFinal(data, meta) {
  const body = buildBody(data);
  const certifyText = 'I certify the above is accurate and confirm I am requesting this cancellation.';

  const pdfParagraphs = [
    ...body.pdfParagraphs,
    '',
    ...attestationParagraphs(certifyText, meta.typedName, meta.dateStr, meta.timestamp, meta.ip),
  ];

  const attestHtml = attestationHtml(certifyText, meta.typedName, meta.dateStr, meta.timestamp, meta.ip);
  const clientIntro = `<p>Hi ${esc(data.clientName)},</p><p>This confirms your signed policy cancellation record with The East Agency. A copy is attached as a PDF for your files.</p>`;

  return {
    pdfHeading: body.heading,
    pdfParagraphs,
    clientEmailSubject: 'Your Signed Policy Cancellation Record — The East Agency',
    clientEmailHtml: `${clientIntro}${body.html}${attestHtml}<p>Questions? Reply to this email or call The East Agency.</p>`,
  };
}
