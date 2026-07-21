import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const argumentsMap = {};
for (let index = 2; index < process.argv.length; index += 2) argumentsMap[process.argv[index].replace(/^--/, '')] = process.argv[index + 1];
const spec = JSON.parse(await readFile(path.join(root, 'pet-spec.json'), 'utf8'));
const assetDir = path.resolve(root, argumentsMap.assets ?? path.join('src', 'assets', 'pet'));
const qaDir = path.resolve(root, argumentsMap.qa ?? 'qa');
await mkdir(qaDir, { recursive: true });
const records = [];

for (const state of spec.states) {
  for (const frame of state.frames) {
    const errors = [];
    const file = path.join(assetDir, frame);
    try {
      const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      if (info.width !== 512 || info.height !== 512 || info.channels !== 4) errors.push('must be 512x512 RGBA');
      let transparent = 0;
      let opaque = 0;
      let minX = info.width;
      let minY = info.height;
      let maxX = -1;
      let maxY = -1;
      let borderPixels = 0;
      for (let y = 0; y < info.height; y += 1) for (let x = 0; x < info.width; x += 1) {
        const alpha = data[(y * info.width + x) * 4 + 3];
        if (alpha === 0) transparent += 1;
        if (alpha >= 16) {
          opaque += 1; minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
          if (x === 0 || y === 0 || x === info.width - 1 || y === info.height - 1) borderPixels += 1;
        }
      }
      if (transparent === 0) errors.push('no transparent pixels');
      if (opaque === 0) errors.push('no visible foreground');
      if (borderPixels > 0) errors.push(`foreground touches canvas border (${borderPixels} pixels)`);
      if (opaque > 0) {
        const centerX = ((minX + maxX) / 2) / 511;
        const bottomY = maxY / 511;
        if (Math.abs(centerX - state.anchor.x) > 0.08) errors.push(`horizontal anchor drift: ${centerX.toFixed(3)}`);
        if (Math.abs(bottomY - state.anchor.y) > 0.04) errors.push(`bottom anchor drift: ${bottomY.toFixed(3)}`);
      }
      records.push({ state: state.id, frame, ok: errors.length === 0, errors, transparentRatio: transparent / (info.width * info.height), bounds: opaque ? [minX, minY, maxX, maxY] : null });
    } catch (error) {
      records.push({ state: state.id, frame, ok: false, errors: [error instanceof Error ? error.message : String(error)] });
    }
  }
}

const tiles = [];
const columns = 4;
const tileWidth = 220;
const tileHeight = 250;
for (let index = 0; index < records.length; index += 1) {
  const record = records[index];
  if (!record || !record.frame) continue;
  try {
    const thumb = await sharp(path.join(assetDir, record.frame)).resize(190, 190, { fit: 'contain' }).png().toBuffer();
    const label = Buffer.from(`<svg width="220" height="40" xmlns="http://www.w3.org/2000/svg"><rect width="220" height="40" fill="#fff"/><text x="110" y="25" text-anchor="middle" font-family="Arial,sans-serif" font-size="15" fill="#20242c">${record.state.replaceAll('&','&amp;').replaceAll('<','&lt;')}</text></svg>`);
    tiles.push({ input: thumb, left: (index % columns) * tileWidth + 15, top: Math.floor(index / columns) * tileHeight + 10 });
    tiles.push({ input: label, left: (index % columns) * tileWidth, top: Math.floor(index / columns) * tileHeight + 205 });
  } catch { /* missing file is already in the JSON report */ }
}
const rows = Math.max(1, Math.ceil(records.length / columns));
await sharp({ create: { width: columns * tileWidth, height: rows * tileHeight, channels: 4, background: '#f1f3f5' } }).composite(tiles).png().toFile(path.join(qaDir, 'contact-sheet.png'));
const report = { generatedAt: new Date().toISOString(), passed: records.every((item) => item.ok), assets: records };
await writeFile(path.join(qaDir, 'assets-report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(`Asset QA: ${report.passed ? 'PASS' : 'FAIL'} (${records.filter((item) => item.ok).length}/${records.length})`);
if (!report.passed) process.exit(1);
