// cancellation-pdf.mjs — renders a simple text letter (heading + wrapped
// paragraphs) to PDF with pdf-lib. No form template needed, unlike the ACORD
// 25 (fill-pdf.mjs) — these letters are plain generated documents.
import { PDFDocument, StandardFonts } from 'pdf-lib';

const PAGE_WIDTH = 612; // US Letter, points
const PAGE_HEIGHT = 792;
const MARGIN = 56;
const FONT_SIZE = 10.5;
const LINE_HEIGHT = 15;

function wrapText(text, font, size, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// paragraphs: array of strings.
// '' renders as blank-line spacing. A leading '## ' renders bold (sub-header).
export async function renderLetterPdf({ heading, paragraphs }) {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const maxWidth = PAGE_WIDTH - MARGIN * 2;

  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  function ensureRoom(need) {
    if (y - need < MARGIN) {
      page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
  }

  ensureRoom(24);
  page.drawText(heading, { x: MARGIN, y, size: 14, font: bold });
  y -= 26;

  for (const para of paragraphs) {
    if (para === '') {
      y -= LINE_HEIGHT * 0.6;
      continue;
    }
    const isSub = para.startsWith('## ');
    const text = isSub ? para.slice(3) : para;
    const useFont = isSub ? bold : font;
    for (const line of wrapText(text, useFont, FONT_SIZE, maxWidth)) {
      ensureRoom(LINE_HEIGHT);
      page.drawText(line, { x: MARGIN, y, size: FONT_SIZE, font: useFont });
      y -= LINE_HEIGHT;
    }
  }

  return pdfDoc.save();
}
