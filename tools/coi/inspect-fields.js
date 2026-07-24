const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');

async function main() {
  const bytes = fs.readFileSync(path.join(__dirname, 'template', 'acord25.pdf'));
  const pdfDoc = await PDFDocument.load(bytes);
  const form = pdfDoc.getForm();
  const fields = form.getFields();

  const out = fields.map((f) => {
    const name = f.getName();
    const type = f.constructor.name;
    let extra = {};
    if (type === 'PDFCheckBox') {
      try { extra.onValue = f.acroField.getOnValue()?.toString(); } catch (e) {}
    }
    if (type === 'PDFTextField') {
      try { extra.maxLength = f.getMaxLength(); } catch (e) {}
    }
    return { name, type, ...extra };
  });

  out.sort((a, b) => a.name.localeCompare(b.name));
  fs.writeFileSync(path.join(__dirname, 'field-inventory.json'), JSON.stringify(out, null, 2));
  console.log(`Total fields: ${out.length}`);
  const byType = {};
  for (const f of out) byType[f.type] = (byType[f.type] || 0) + 1;
  console.log('By type:', byType);
}

main().catch((e) => { console.error(e); process.exit(1); });
