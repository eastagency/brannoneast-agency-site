const fs = require('fs');
const path = require('path');
const bytes = fs.readFileSync(path.join(__dirname, 'template', 'acord25.pdf'));
const b64 = bytes.toString('base64');
const out = `export const ACORD25_TEMPLATE_BASE64 = '${b64}';\n`;
const outPath = path.join(__dirname, '..', '..', 'netlify', 'functions', 'lib', 'acord25-template-base64.mjs');
fs.writeFileSync(outPath, out);
console.log('Wrote', outPath, '- base64 length:', b64.length);
