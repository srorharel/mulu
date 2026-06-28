// Build a self-contained HTML fragment that previews the QR designs inline in chat.
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const d = path.dirname(fileURLToPath(import.meta.url));
const uri = async (file, w) => {
  const buf = await sharp(path.join(d, file)).resize(w).png({ compressionLevel: 9, palette: true }).toBuffer();
  return 'data:image/png;base64,' + buf.toString('base64');
};

const fresh = await uri('freshener-mulu.png', 480);
const clean = await uri('qr-mulu-clean.png', 360);

const html = `<h2 class="sr-only">Preview of the MULU QR code: a green air-freshener tag with a scannable code and a Hebrew call to action, plus the bare QR code on its own.</h2>
<style>
.qg{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;padding:1rem 0;margin:0}
.qc{background:var(--color-background-secondary);border-radius:var(--border-radius-lg);padding:16px;text-align:center;margin:0}
.qc img{width:100%;height:auto;display:block;border-radius:var(--border-radius-md)}
.ql{margin:12px 0 0;font-size:13px;color:var(--color-text-secondary);line-height:1.5}
.qt{display:block;font-weight:500;color:var(--color-text-primary)}
</style>
<div class="qg">
  <figure class="qc">
    <img alt="MULU air-freshener tag: green card, scannable QR code with the MULU logo in the centre, Hebrew text 'scan and book a wash', and muluwash.com" src="${fresh}">
    <figcaption class="ql"><span class="qt">Air-freshener tag</span>ready to hand to a printer</figcaption>
  </figure>
  <figure class="qc">
    <img alt="The bare MULU QR code: dark-green modules on white with green corner centres and the MULU tile in the middle" src="${clean}">
    <figcaption class="ql"><span class="qt">Just the code</span>recommended, drop onto any design</figcaption>
  </figure>
</div>`;

fs.writeFileSync(path.join(d, 'widget-fragment.html'), html);
console.log('fragment bytes:', html.length);
