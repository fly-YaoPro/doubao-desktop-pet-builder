import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import sharp from 'sharp';

function argsOf(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 2) result[argv[i].replace(/^--/, '')] = argv[i + 1];
  return result;
}

const args = argsOf(process.argv.slice(2));
const inputDir = path.resolve(args.input ?? 'incoming-assets');
const outputDir = path.resolve(args.output ?? 'src/assets/pet');
const specPath = path.resolve(args.spec ?? 'pet-spec.json');
const threshold = Number(args.threshold ?? 42);
const feather = Number(args.feather ?? 16);
const safeMargin = Number(args.margin ?? 24);
if (![threshold, feather, safeMargin].every(Number.isFinite)) throw new Error('threshold, feather and margin must be numbers');

const spec = JSON.parse(await readFile(specPath, 'utf8'));
const names = new Set([spec.character.coreAsset, ...spec.states.flatMap((state) => state.frames)]);
await mkdir(outputDir, { recursive: true });
const reports = [];

const colorDistance = (data, offset, seed) => Math.hypot(data[offset] - seed[0], data[offset + 1] - seed[1], data[offset + 2] - seed[2]);

async function processOne(name) {
  const source = path.join(inputDir, name);
  const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  if (width < 64 || height < 64) throw new Error(`${name}: source is too small`);
  const pixelCount = width * height;
  const cornerIndexes = [0, width - 1, (height - 1) * width, pixelCount - 1];
  const seeds = cornerIndexes.map((index) => {
    const offset = index * 4;
    return [data[offset], data[offset + 1], data[offset + 2], data[offset + 3]];
  });
  const background = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  let head = 0;
  let tail = 0;
  const eligible = (index) => {
    const offset = index * 4;
    if (data[offset + 3] < 16) return true;
    return seeds.some((seed) => seed[3] >= 16 && colorDistance(data, offset, seed) <= threshold);
  };
  for (const index of cornerIndexes) if (!background[index] && eligible(index)) { background[index] = 1; queue[tail++] = index; }
  while (head < tail) {
    const index = queue[head++];
    const x = index % width;
    const y = Math.floor(index / width);
    const neighbors = [x > 0 ? index - 1 : -1, x + 1 < width ? index + 1 : -1, y > 0 ? index - width : -1, y + 1 < height ? index + width : -1];
    for (const next of neighbors) if (next >= 0 && !background[next] && eligible(next)) { background[next] = 1; queue[tail++] = next; }
  }

  const output = Buffer.from(data);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let foregroundPixels = 0;
  let touchesBorder = false;
  for (let index = 0; index < pixelCount; index += 1) {
    const offset = index * 4;
    if (background[index]) { output[offset + 3] = 0; continue; }
    const x = index % width;
    const y = Math.floor(index / width);
    let alphaFactor = 1;
    const adjacentBackground = (x > 0 && background[index - 1]) || (x + 1 < width && background[index + 1]) || (y > 0 && background[index - width]) || (y + 1 < height && background[index + width]);
    if (adjacentBackground) {
      const nearest = seeds.filter((seed) => seed[3] >= 16).sort((a, b) => colorDistance(data, offset, a) - colorDistance(data, offset, b))[0];
      if (nearest) {
        const distance = colorDistance(data, offset, nearest);
        alphaFactor = Math.max(0.08, Math.min(1, (distance - threshold) / Math.max(1, feather)));
        for (let channel = 0; channel < 3; channel += 1) {
          const foreground = (data[offset + channel] - (1 - alphaFactor) * nearest[channel]) / alphaFactor;
          output[offset + channel] = Math.max(0, Math.min(255, Math.round(foreground)));
        }
      }
    }
    output[offset + 3] = Math.round(data[offset + 3] * alphaFactor);
    if (output[offset + 3] >= 16) {
      foregroundPixels += 1;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) touchesBorder = true;
    }
  }
  if (foregroundPixels / pixelCount < 0.01) throw new Error(`${name}: foreground is empty or background conflicts with subject`);
  if (touchesBorder) throw new Error(`${name}: subject touches the source border; regenerate with more margin`);

  const cropWidth = maxX - minX + 1;
  const cropHeight = maxY - minY + 1;
  const maximum = 512 - safeMargin * 2;
  const scale = Math.min(maximum / cropWidth, maximum / cropHeight, 1);
  const targetWidth = Math.max(1, Math.round(cropWidth * scale));
  const targetHeight = Math.max(1, Math.round(cropHeight * scale));
  const cropped = await sharp(output, { raw: { width, height, channels: 4 } })
    .extract({ left: minX, top: minY, width: cropWidth, height: cropHeight })
    .resize(targetWidth, targetHeight, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
    .png().toBuffer();
  const left = Math.round((512 - targetWidth) / 2);
  const top = 512 - safeMargin - targetHeight;
  const destination = path.join(outputDir, name);
  await mkdir(path.dirname(destination), { recursive: true });
  await sharp({ create: { width: 512, height: 512, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: cropped, left, top }]).png({ compressionLevel: 9, adaptiveFiltering: true }).toFile(destination);
  return { name, sourceSize: [width, height], foregroundRatio: foregroundPixels / pixelCount, sourceBounds: [minX, minY, maxX, maxY], outputBounds: [left, top, left + targetWidth - 1, top + targetHeight - 1] };
}

for (const name of names) {
  try { reports.push({ ok: true, ...(await processOne(name)) }); }
  catch (error) { reports.push({ ok: false, name, error: error instanceof Error ? error.message : String(error) }); }
}
const reportPath = path.join(outputDir, 'asset-processing-report.json');
await writeFile(reportPath, `${JSON.stringify({ threshold, feather, safeMargin, assets: reports }, null, 2)}\n`, 'utf8');
const failures = reports.filter((item) => !item.ok);
console.log(`Processed ${reports.length - failures.length}/${reports.length} assets. Report: ${reportPath}`);
if (failures.length) { for (const failure of failures) console.error(failure.error); process.exit(1); }
