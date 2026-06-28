// Branded, scan-verified QR code generator for MULU.
// Usage: node build-qr.mjs [url]
// Outputs SVG (vector, for print) + 2000px PNG for each variant, and decode-verifies each.
import QRCode from 'qrcode';
import sharp from 'sharp';
import jsQR from 'jsqr';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const URL_TARGET = process.argv[2] || 'https://muluwash.com';

const BRAND = '#26B55F';   // MULU brand green (primary-700)
const DARK  = '#0C3B2A';   // deep green-black for modules — ~12:1 contrast on white
const WHITE = '#FFFFFF';

const logoPath = path.resolve(__dirname, '../../public/logo.png');
const logoHref = 'data:image/png;base64,' + fs.readFileSync(logoPath).toString('base64');

const qr = QRCode.create(URL_TARGET, { errorCorrectionLevel: 'H' });
const n = qr.modules.size;
const data = qr.modules.data;
const isDark = (x, y) => x >= 0 && y >= 0 && x < n && y < n && data[y * n + x] === 1;
const inFinder = (x, y) => (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);

const QZ = 4;                 // quiet zone (modules)
const T = n + QZ * 2;         // total canvas in module units
const c = T / 2;
const logoSpan = Math.round(n * 0.26);
const loMin = c - logoSpan / 2;
const loMax = c + logoSpan / 2;

const rrect = (x, y, w, h, r, fill) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" ry="${r}" fill="${fill}"/>`;

function finderEye(ox, oy, outer, inner) {
  return rrect(ox, oy, 7, 7, 1.75, outer)
    + rrect(ox + 1, oy + 1, 5, 5, 1.15, WHITE)
    + rrect(ox + 2, oy + 2, 3, 3, 0.85, inner);
}

function buildSVG({ eyeOuter, eyeInner }) {
  let modules = '';
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (!isDark(x, y) || inFinder(x, y)) continue;
      const mx = x + QZ, my = y + QZ;
      const cx = mx + 0.5, cy = my + 0.5;
      if (cx > loMin - 0.5 && cx < loMax + 0.5 && cy > loMin - 0.5 && cy < loMax + 0.5) continue; // under logo
      modules += `<rect x="${mx}" y="${my}" width="1" height="1" rx="0.16" ry="0.16" fill="${DARK}"/>`;
    }
  }
  const eyes =
    finderEye(QZ, QZ, eyeOuter, eyeInner) +
    finderEye(QZ + n - 7, QZ, eyeOuter, eyeInner) +
    finderEye(QZ, QZ + n - 7, eyeOuter, eyeInner);

  const halo = rrect(loMin - 0.6, loMin - 0.6, (loMax - loMin) + 1.2, (loMax - loMin) + 1.2, 2.2, WHITE);
  const logo = `<g clip-path="url(#lc)"><image href="${logoHref}" x="${loMin}" y="${loMin}" width="${loMax - loMin}" height="${loMax - loMin}" preserveAspectRatio="xMidYMid meet"/></g>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${T} ${T}" width="${T * 40}" height="${T * 40}">
<defs><clipPath id="lc"><rect x="${loMin}" y="${loMin}" width="${loMax - loMin}" height="${loMax - loMin}" rx="1.8" ry="1.8"/></clipPath></defs>
${rrect(0, 0, T, T, 3.2, WHITE)}
<g>${modules}</g>
<g>${eyes}</g>
${halo}
${logo}
</svg>`;
}

async function render(name, opts) {
  const svg = buildSVG(opts);
  fs.writeFileSync(path.join(__dirname, name + '.svg'), svg);
  const png = await sharp(Buffer.from(svg), { density: 384 })
    .resize(2000, 2000, { fit: 'contain', background: WHITE })
    .png().toBuffer();
  fs.writeFileSync(path.join(__dirname, name + '.png'), png);

  const { data: raw, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const code = jsQR(new Uint8ClampedArray(raw), info.width, info.height);
  const ok = code && code.data === URL_TARGET;
  console.log(`${name.padEnd(18)} ${ok ? 'DECODE OK' : 'DECODE FAIL'}  ${code ? '-> ' + JSON.stringify(code.data) : '(no code found)'}`);
  return ok;
}

console.log(`URL: ${URL_TARGET}  | version ${qr.version} (${n}x${n} modules)\n`);
await render('qr-mulu-clean',      { eyeOuter: DARK,  eyeInner: BRAND });
await render('qr-mulu-dark',       { eyeOuter: DARK,  eyeInner: DARK  });
await render('qr-mulu-greeneyes',  { eyeOuter: BRAND, eyeInner: BRAND });
console.log('\nDone. Files written to store-assets/qr/');
