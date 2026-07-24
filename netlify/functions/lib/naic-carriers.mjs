// Verified NAIC company codes for carriers The East Agency places business
// with. Never guess a NAIC number — verify against an authoritative source
// (NAIC company search, state DOI lookup, cross-checked against the policy's
// own address) before adding an entry here.
export const NAIC_CARRIERS = [
  {
    carrierName: 'National Specialty Insurance Company',
    naic: '22608',
    verifiedAddress: '1900 L. Don Dodson Drive, Bedford, TX 76021',
    source: 'NAIC company search, cross-checked against policy address',
    dateAdded: '2026-07-23',
  },
];

function normalize(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function lookupNaic(insurerFullName) {
  if (!insurerFullName) return null;
  const target = normalize(insurerFullName);
  const hit = NAIC_CARRIERS.find(
    (c) => target.includes(normalize(c.carrierName)) || normalize(c.carrierName).includes(target)
  );
  return hit ? hit.naic : null;
}
