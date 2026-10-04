import zlib from 'zlib';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, '../public');

// Precompute CRC table
const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  crcTable[i] = c >>> 0;
}

function crc32(buf) {
  let crc = 0 ^ (-1);
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xFF];
  }
  return (crc ^ (-1)) >>> 0;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.concat([t, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcBuf), 0);
  return Buffer.concat([len, t, data, crc]);
}

function generateFieldnoteIcon(size, isMaskable = false) {
  const rowSize = size * 4 + 1;
  const raw = Buffer.alloc(rowSize * size);

  const cx = size / 2;
  const cy = size / 2;
  const outerRadius = size * (isMaskable ? 0.38 : 0.44);
  const innerRadius = size * (isMaskable ? 0.28 : 0.32);
  const starRadius = size * (isMaskable ? 0.22 : 0.25);

  for (let y = 0; y < size; y++) {
    const rowOffset = y * rowSize;
    raw[rowOffset] = 0; // Filter: None

    for (let x = 0; x < size; x++) {
      const px = rowOffset + 1 + x * 4;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Default background: Deep Slate Dark #020617
      let r = 2, g = 6, b = 23, a = 255;

      // Draw compass dial ring
      if (dist >= innerRadius && dist <= outerRadius) {
        // Emerald gradient: #10b981 (16, 185, 129)
        r = 16; g = 185; b = 129; a = 255;
      }

      // Compass needle/diamond: 4-pointed star
      // |dx| + |dy| <= starRadius
      const diamondDist = Math.abs(dx) + Math.abs(dy);
      if (diamondDist <= starRadius) {
        // Upper/right quadrant teal, lower/left quadrant emerald
        if (dx >= 0 && dy <= 0) {
          // North-East facet: #34d399 (bright teal)
          r = 52; g = 211; b = 153;
        } else if (dx <= 0 && dy <= 0) {
          // North-West facet: #059669
          r = 5; g = 150; b = 105;
        } else if (dx <= 0 && dy >= 0) {
          // South-West facet: #047857
          r = 4; g = 120; b = 87;
        } else {
          // South-East facet: #10b981
          r = 16; g = 185; b = 129;
        }
      }

      // Center pivot point
      if (dist <= size * 0.04) {
        r = 248; g = 250; b = 252; // White/slate-50
      }

      raw[px] = r;
      raw[px + 1] = g;
      raw[px + 2] = b;
      raw[px + 3] = a;
    }
  }

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = zlib.deflateSync(raw);
  return Buffer.concat([
    sig,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', idat),
    makeChunk('IEND', Buffer.alloc(0))
  ]);
}

// Generate PWA icons
console.log('[FIELDNOTE] Generating PWA icons...');
const icon192 = generateFieldnoteIcon(192, false);
fs.writeFileSync(path.join(publicDir, 'pwa-192x192.png'), icon192);

const icon512 = generateFieldnoteIcon(512, false);
fs.writeFileSync(path.join(publicDir, 'pwa-512x512.png'), icon512);

const maskable512 = generateFieldnoteIcon(512, true);
fs.writeFileSync(path.join(publicDir, 'maskable-icon-512x512.png'), maskable512);

// Generate updated favicon.svg
const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="22" fill="#020617"/>
  <circle cx="50" cy="50" r="36" fill="none" stroke="#10b981" stroke-width="6"/>
  <path d="M50 18 L58 46 L82 50 L58 54 L50 82 L42 54 L18 50 L42 46 Z" fill="#10b981"/>
  <circle cx="50" cy="50" r="5" fill="#f8fafc"/>
</svg>`;
fs.writeFileSync(path.join(publicDir, 'favicon.svg'), faviconSvg);

console.log('[FIELDNOTE] Icons generated successfully: pwa-192x192.png, pwa-512x512.png, maskable-icon-512x512.png, favicon.svg');
