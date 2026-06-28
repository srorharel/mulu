// Front faces for the air freshener, print-ready: 70x100mm + 3mm bleed @ 300 DPI = 898x1252 px.
import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const d = path.dirname(fileURLToPath(import.meta.url));
const logo = path.resolve(d, '../../public/logo.png');
const W = 898, H = 1252;

// Green, full-bleed: the real logo tile scaled to cover the whole card (MULU stays centred).
await sharp(logo)
  .resize(W, H, { fit: 'cover', position: 'centre' })
  .flatten({ background: '#37BE73' })
  .png().toFile(path.join(d, 'print-front-green.png'));

// White, clean: the logo centred at ~47 mm on a white card.
const lg = await sharp(logo).resize(560, 560, { fit: 'inside' }).png().toBuffer();
await sharp({ create: { width: W, height: H, channels: 4, background: '#FFFFFF' } })
  .composite([{ input: lg, gravity: 'centre' }])
  .png().toFile(path.join(d, 'print-front-white.png'));

console.log('fronts written:', W + 'x' + H);
