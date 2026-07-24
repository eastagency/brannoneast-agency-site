import { PDFDocument } from 'pdf-lib';
import { ACORD25_TEMPLATE_BASE64 } from './acord25-template-base64.mjs';

export async function fillAcord25(fieldValues) {
  const templateBytes = Buffer.from(ACORD25_TEMPLATE_BASE64, 'base64');
  const pdfDoc = await PDFDocument.load(templateBytes);
  const form = pdfDoc.getForm();

  for (const [name, value] of Object.entries(fieldValues)) {
    if (value === undefined || value === null || value === '') continue;
    let field;
    try {
      field = form.getField(name);
    } catch (e) {
      continue;
    }
    if (field.constructor.name === 'PDFCheckBox') {
      if (value) field.check();
    } else {
      field.setText(String(value));
    }
  }

  form.updateFieldAppearances();
  // Not flattened — stays editable so staff can hand-correct in any PDF viewer.
  return pdfDoc.save();
}
