// Extract the exact white MULU lettering from the real logo (white-on-transparent).
import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const d = path.dirname(fileURLToPath(import.meta.url));
const logo = path.resolve(d, '../../public/logo.png');

const { data, info } = await sharp(logo).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width, height, channels } = info;
const out = Buffer.alloc(width * height * 4);
const lo = 165, hi = 235; // min-channel: green/shadow -> 0, white text -> 1, smooth edges between
for (let i = 0, j = 0; i < width * height * channels; i += channels, j += 4) {
  const mn = Math.min(data[i], data[i + 1], data[i + 2]);
  let a = (mn - lo) / (hi - lo);
  a = a < 0 ? 0 : a > 1 ? 1 : a;
  a *= data[i + 3] / 255;
  out[j] = 255; out[j + 1] = 255; out[j + 2] = 255; out[j + 3] = Math.round(a * 255);
}
const png = await sharp(out, { raw: { width, height, channels: 4 } }).png().toBuffer();
await sharp(png).trim({ threshold: 10 }).png().toFile(path.join(d, 'mulu-text.png'));
const m = await sharp(path.join(d, 'mulu-text.png')).metadata();
console.log('mulu-text.png:', m.width + 'x' + m.height);
