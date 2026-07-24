// NAIC company codes are fixed per carrier but different across carriers, so we
// never guess one. This is a small persisted list the tool learns from over time:
// the first time a new carrier shows up on an uploaded policy, staff look up its
// real NAIC number once (verified against an authoritative source) and it's
// remembered for every future policy from that same carrier.
const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '..', 'data', 'naic-carriers.json');

function loadCarriers() {
  if (!fs.existsSync(DATA_PATH)) return [];
  return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
}

function saveCarriers(carriers) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(carriers, null, 2) + '\n');
}

// Case-insensitive, tolerant of minor suffix differences (e.g. "a stock company").
function normalize(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function lookupNaic(insurerFullName) {
  if (!insurerFullName) return null;
  const target = normalize(insurerFullName);
  const carriers = loadCarriers();
  const hit = carriers.find(
    (c) => target.includes(normalize(c.carrierName)) || normalize(c.carrierName).includes(target)
  );
  return hit ? hit.naic : null;
}

// Called once per new carrier — verify the NAIC number against an authoritative
// source (NAIC company search, state DOI lookup) before calling this.
function learnCarrier({ carrierName, naic, verifiedAddress, source }) {
  const carriers = loadCarriers();
  if (carriers.some((c) => normalize(c.carrierName) === normalize(carrierName))) {
    throw new Error(`Carrier "${carrierName}" is already in the lookup table.`);
  }
  carriers.push({
    carrierName,
    naic,
    verifiedAddress: verifiedAddress || '',
    source: source || '',
    dateAdded: new Date().toISOString().slice(0, 10),
  });
  saveCarriers(carriers);
}

module.exports = { lookupNaic, learnCarrier, loadCarriers };
