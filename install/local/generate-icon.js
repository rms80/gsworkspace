// Generates favicon.ico from favicon.svg using sharp (backend dependency)
// Run: node generate-icon.js

const path = require('path');
const sharp = require(path.join(__dirname, '..', '..', 'backend', 'node_modules', 'sharp'));
const fs = require('fs');

const svgPath = path.join(__dirname, '..', '..', 'frontend', 'public', 'favicon.svg');
const icoPath = path.join(__dirname, 'gsworkspace.ico');

async function generateIco() {
  const svg = fs.readFileSync(svgPath);

  // Generate PNGs at standard ICO sizes
  const sizes = [16, 32, 48, 256];
  const pngBuffers = await Promise.all(
    sizes.map(size =>
      sharp(svg, { density: Math.round(72 * size / 32) })
        .resize(size, size)
        .png()
        .toBuffer()
    )
  );

  // Build ICO file
  // Header: 6 bytes
  const headerSize = 6;
  const entrySize = 16;
  const dataOffset = headerSize + entrySize * sizes.length;

  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);             // reserved
  header.writeUInt16LE(1, 2);             // type: 1 = ICO
  header.writeUInt16LE(sizes.length, 4);  // image count

  const entries = [];
  let currentOffset = dataOffset;

  for (let i = 0; i < sizes.length; i++) {
    const entry = Buffer.alloc(entrySize);
    entry.writeUInt8(sizes[i] === 256 ? 0 : sizes[i], 0);  // width (0 = 256)
    entry.writeUInt8(sizes[i] === 256 ? 0 : sizes[i], 1);  // height (0 = 256)
    entry.writeUInt8(0, 2);               // color palette
    entry.writeUInt8(0, 3);               // reserved
    entry.writeUInt16LE(1, 4);            // color planes
    entry.writeUInt16LE(32, 6);           // bits per pixel
    entry.writeUInt32LE(pngBuffers[i].length, 8);   // data size
    entry.writeUInt32LE(currentOffset, 12);          // data offset
    entries.push(entry);
    currentOffset += pngBuffers[i].length;
  }

  const ico = Buffer.concat([header, ...entries, ...pngBuffers]);
  fs.writeFileSync(icoPath, ico);
  console.log(`Created ${icoPath} (${ico.length} bytes, ${sizes.length} sizes: ${sizes.join(', ')})`);
}

generateIco().catch(err => {
  console.error('Failed to generate icon:', err);
  process.exit(1);
});
