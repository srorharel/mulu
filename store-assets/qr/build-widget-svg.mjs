// Build a compact, vector (no base64) HTML fragment previewing the air-freshener tag.
import QRCode from 'qrcode';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const URL_TARGET = process.argv[2] || 'https://muluwash.com';
const BRAND = '#26B55F', DARK = '#0C3B2A', WHITE = '#FFFFFF';

const qr = QRCode.create(URL_TARGET, { errorCorrectionLevel: 'H' });
const n = qr.modules.size, data = qr.modules.data;
const isDark = (x, y) => data[y * n + x] === 1;
const inFinder = (x, y) => (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);

const QZ = 4, T = n + QZ * 2, c = T / 2;
const span = Math.round(n * 0.26), loMin = c - span / 2, loMax = c + span / 2;

let dpath = '';
for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
  if (!isDark(x, y) || inFinder(x, y)) continue;
  const mx = x + QZ, my = y + QZ, cx = mx + 0.5, cy = my + 0.5;
  if (cx > loMin - 0.5 && cx < loMax + 0.5 && cy > loMin - 0.5 && cy < loMax + 0.5) continue;
  dpath += `M${mx} ${my}h1v1h-1z`;
}
const rr = (x, y, w, h, r, f) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${f}"/>`;
const eye = (ox, oy) => rr(ox, oy, 7, 7, 1.75, DARK) + rr(ox + 1, oy + 1, 5, 5, 1.15, WHITE) + rr(ox + 2, oy + 2, 3, 3, .85, BRAND);
const eyes = eye(QZ, QZ) + eye(QZ + n - 7, QZ) + eye(QZ, QZ + n - 7);
const fontSize = (loMax - loMin) * 0.30;

const svg = `<svg viewBox="0 0 ${T} ${T}" width="100%" role="img" aria-label="MULU QR code" style="display:block">
${rr(0, 0, T, T, 3.2, WHITE)}
<path d="${dpath}" fill="${DARK}"/>
${eyes}
${rr(loMin - 0.6, loMin - 0.6, span + 1.2, span + 1.2, 2.2, WHITE)}
${rr(loMin, loMin, span, span, 1.8, BRAND)}
<text x="${c}" y="${c + fontSize * 0.34}" text-anchor="middle" font-family="'Heebo',Arial,sans-serif" font-weight="800" font-size="${fontSize}" fill="${WHITE}" letter-spacing="-0.05">MULU</text>
</svg>`;

const frag = `<h2 class="sr-only">Preview of the MULU QR code on a green air-freshener tag with a Hebrew call to action and the muluwash.com address.</h2>
<style>
@import url('https://fonts.googleapis.com/css2?family=Heebo:wght@600;800;900&display=swap');
.qwrap{padding:1rem 0;margin:0;display:flex;justify-content:center}
.qsurface{background:var(--color-background-secondary);border-radius:var(--border-radius-lg);padding:22px;max-width:340px;width:100%}
.qtag{background:#2BA85C;border-radius:30px;padding:26px}
.qcard{background:#fff;border-radius:22px;padding:22px 22px 16px;text-align:center}
.qcta{font-family:'Heebo',Arial,sans-serif;font-weight:900;font-size:24px;color:#0C3B2A;margin:10px 0 0;line-height:1.1}
.qdom{font-family:'Heebo',Arial,sans-serif;font-weight:800;font-size:13px;color:#26B55F;margin:6px 0 0;letter-spacing:1px}
</style>
<div class="qwrap"><div class="qsurface"><div class="qtag"><div class="qcard">
${svg}
<p class="qcta" dir="rtl">סורקים ומזמינים שטיפה</p>
<p class="qdom">muluwash.com</p>
</div></div></div></div>`;

fs.writeFileSync(path.join(__dirname, 'widget-vector.html'), frag);
console.log('fragment bytes:', frag.length, '| modules:', n);
