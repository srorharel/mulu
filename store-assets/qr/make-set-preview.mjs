// Build a lightweight inline preview of the final front (logo) + back (QR tag).
import QRCode from 'qrcode';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const d = path.dirname(fileURLToPath(import.meta.url));
const BRAND = '#26B55F', DARK = '#0C3B2A', WHITE = '#FFFFFF';

const qr = QRCode.create('https://muluwash.com', { errorCorrectionLevel: 'H' });
const n = qr.modules.size, data = qr.modules.data;
const isDark = (x, y) => data[y * n + x] === 1;
const inFinder = (x, y) => (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);
const QZ = 4, T = n + QZ * 2, c = T / 2, span = Math.round(n * 0.26), loMin = c - span / 2, loMax = c + span / 2;
let dp = '';
for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
  if (!isDark(x, y) || inFinder(x, y)) continue;
  const mx = x + QZ, my = y + QZ, cx = mx + .5, cy = my + .5;
  if (cx > loMin - .5 && cx < loMax + .5 && cy > loMin - .5 && cy < loMax + .5) continue;
  dp += `M${mx} ${my}h1v1h-1z`;
}
const rr = (x, y, w, h, r, f) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${f}"/>`;
const eye = (ox, oy) => rr(ox, oy, 7, 7, 1.75, DARK) + rr(ox + 1, oy + 1, 5, 5, 1.15, WHITE) + rr(ox + 2, oy + 2, 3, 3, .85, BRAND);
const eyes = eye(QZ, QZ) + eye(QZ + n - 7, QZ) + eye(QZ, QZ + n - 7);
const fz = (loMax - loMin) * 0.30;
const qrsvg = `<svg viewBox="0 0 ${T} ${T}" width="100%" role="img" aria-label="MULU QR code" style="display:block"><rect x="0" y="0" width="${T}" height="${T}" rx="3.2" fill="${WHITE}"/><path d="${dp}" fill="${DARK}"/>${eyes}${rr(loMin - .6, loMin - .6, span + 1.2, span + 1.2, 2.2, WHITE)}${rr(loMin, loMin, span, span, 1.8, BRAND)}<text x="${c}" y="${c + fz * 0.34}" text-anchor="middle" font-family="'Heebo',Arial,sans-serif" font-weight="800" font-size="${fz}" fill="${WHITE}">MULU</text></svg>`;

const txt = await sharp(path.join(d, 'mulu-text.png')).resize(260).png({ palette: true, compressionLevel: 9 }).toBuffer();
const txtUri = 'data:image/png;base64,' + txt.toString('base64');

const frag = `<h2 class="sr-only">Final two faces of the MULU air freshener: front is the green logo with the white MULU wordmark, back is the QR code with the Hebrew line and muluwash.com.</h2>
<style>
@import url('https://fonts.googleapis.com/css2?family=Heebo:wght@600;800;900&display=swap');
.pz{padding:1rem 0;margin:0}
.prow{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:16px}
.pcell{text-align:center}
.pcard{aspect-ratio:7/10;border-radius:20px;overflow:hidden;display:flex;align-items:center;justify-content:center;padding:14px}
.front{background:radial-gradient(120% 85% at 28% 6%,rgba(255,255,255,.18),transparent 55%),linear-gradient(160deg,#56D78C,#2EBA66)}
.back{background:linear-gradient(158deg,#54CD83,#21A455)}
.wm{width:66%;height:auto;display:block;filter:drop-shadow(0 3px 7px rgba(8,60,30,.32))}
.ppanel{background:#fff;border-radius:16px;padding:14px;width:86%}
.pcta{font-family:'Heebo',Arial,sans-serif;font-weight:900;font-size:13px;color:#0C3B2A;margin:8px 0 0;line-height:1.15}
.pdom{font-family:'Heebo',Arial,sans-serif;font-weight:800;font-size:11px;color:#26B55F;margin:4px 0 0}
.plabel{font-weight:500;color:var(--color-text-primary);font-size:14px;margin:12px 0 2px}
.psub{color:var(--color-text-secondary);font-size:13px;margin:0}
.pnote{margin:14px 0 0;padding:12px 14px;background:var(--color-background-secondary);border-radius:var(--border-radius-md);color:var(--color-text-secondary);font-size:13px;line-height:1.6;text-align:center}
.pnote b{color:var(--color-text-primary);font-weight:500}
</style>
<div class="pz"><div class="prow">
<div class="pcell"><div class="pcard front"><img class="wm" src="${txtUri}"></div><p class="plabel">Front</p><p class="psub">your logo</p></div>
<div class="pcell"><div class="pcard back"><div class="ppanel">${qrsvg}<p class="pcta" dir="rtl">סורקים ומזמינים שטיפה</p><p class="pdom">muluwash.com</p></div></div><p class="plabel">Back</p><p class="psub">QR ≈ 30 mm</p></div>
</div>
<p class="pnote"><b>Finished 70 × 100 mm</b> · design file 76 × 106 mm with 3 mm bleed · 300 DPI</p></div>`;

fs.writeFileSync(path.join(d, 'set-preview.html'), frag);
console.log('bytes:', frag.length);
