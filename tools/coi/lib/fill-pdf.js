const fs = require('fs');
const { PDFDocument } = require('pdf-lib');

async function fillPdf(templatePath, fieldValues, outputPath) {
  const bytes = fs.readFileSync(templatePath);
  const pdfDoc = await PDFDocument.load(bytes);
  const form = pdfDoc.getForm();

  const missing = [];
  for (const [name, value] of Object.entries(fieldValues)) {
    if (value === undefined || value === null || value === '') continue;
    let field;
    try {
      field = form.getField(name);
    } catch (e) {
      missing.push(name);
      continue;
    }
    if (field.constructor.name === 'PDFCheckBox') {
      if (value) field.check();
    } else {
      field.setText(String(value));
    }
  }

  form.updateFieldAppearances();
  // Do NOT flatten: keeps fields editable so staff can correct anything by hand
  // in a normal PDF viewer before sending, without needing this tool again.
  const outBytes = await pdfDoc.save();
  fs.writeFileSync(outputPath, outBytes);
  return { missing };
}

module.exports = { fillPdf };
