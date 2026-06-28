// Build a print-ready PDF: 2 pages (front, back), 76x106mm with 3mm bleed + trim box.
import { PDFDocument } from 'pdf-lib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const d = path.dirname(fileURLToPath(import.meta.url));
const mm = v => v * 72 / 25.4;
const W = mm(76), H = mm(106); // bleed size

const doc = await PDFDocument.create();
doc.setTitle('MULU car air freshener - print ready');
doc.setCreator('MULU');

for (const f of ['print-front-green.png', 'print-back.png']) {
  const png = await doc.embedPng(fs.readFileSync(path.join(d, f)));
  const p = doc.addPage([W, H]);
  p.drawImage(png, { x: 0, y: 0, width: W, height: H });
  p.setTrimBox(mm(3), mm(3), mm(70), mm(100)); // 70x100mm finished cut
  p.setBleedBox(0, 0, W, H);
}

fs.writeFileSync(path.join(d, 'mulu-freshener-print-ready.pdf'), await doc.save());
console.log('PDF: 2 pages, 76x106mm bleed, 70x100mm trim');
