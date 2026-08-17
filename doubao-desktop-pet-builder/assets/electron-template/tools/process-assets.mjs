import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

function argsOf(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 2) result[argv[index].replace(/^--/, '')] = argv[index + 1];
  return result;
}

const args = argsOf(process.argv.slice(2));
const inputDir = path.resolve(args.input ?? 'incoming-assets');
const outputDir = path.resolve(args.output ?? path.join('src', 'assets', 'pet'));
const trayDir = path.resolve(args.tray ?? path.join('src', 'assets', 'tray'));
const specPath = path.resolve(args.spec ?? 'pet-spec.json');
const spec = JSON.parse(await readFile(specPath, 'utf8'));
const threshold = Number(spec.assetPipeline?.backgroundTolerance);
const feather = Number(spec.assetPipeline?.edgeFeather);
const safeMargin = Number(spec.assetPipeline?.safeMargin);
const targetOccupancy = Number(spec.assetPipeline?.targetOccupancy);
const generationBackground = spec.assetPipeline?.generationBackground;
if (spec.assetPipeline?.backgroundMode !== 'adaptive-flood') throw new Error('pet-spec assetPipeline.backgroundMode must be adaptive-flood');
if (!['transparent-grid', 'solid-chroma'].includes(generationBackground)) throw new Error('pet-spec generationBackground must be transparent-grid or solid-chroma');
if (![threshold, feather, safeMargin, targetOccupancy].every(Number.isFinite)) throw new Error('pet-spec assetPipeline values must be numbers');

const names = new Set([spec.character.coreAsset, ...spec.states.flatMap((state) => state.frames)]);
await mkdir(outputDir, { recursive: true });
await mkdir(trayDir, { recursive: true });

const reports = [];
const failures = [];
const extracted = new Map();
const colorDistance = (data, offset, color) => Math.hypot(data[offset] - color[0], data[offset + 1] - color[1], data[offset + 2] - color[2]);
const colorDistanceRgb = (left, right) => Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);

function borderIndexes(width, height) {
  const result = [];
  for (let x = 0; x < width; x += 1) {
    result.push(x);
    if (height > 1) result.push((height - 1) * width + x);
  }
  for (let y = 1; y + 1 < height; y += 1) {
    result.push(y * width);
    if (width > 1) result.push(y * width + width - 1);
  }
  return result;
}

function detectBorderPalette(data, width, height, name) {
  const indexes = borderIndexes(width, height);
  const transparentCount = indexes.reduce((total, index) => total + (data[index * 4 + 3] < 16 ? 1 : 0), 0);
  if (transparentCount / indexes.length >= 0.9) return { transparentInput: true, palette: [], coverage: 1, clusterCount: 0 };

  const bins = new Map();
  for (const index of indexes) {
    const offset = index * 4;
    if (data[offset + 3] < 16) continue;
    const key = `${Math.floor(data[offset] / 16)}:${Math.floor(data[offset + 1] / 16)}:${Math.floor(data[offset + 2] / 16)}`;
    const item = bins.get(key) ?? { count: 0, sum: [0, 0, 0] };
    item.count += 1;
    item.sum[0] += data[offset]; item.sum[1] += data[offset + 1]; item.sum[2] += data[offset + 2];
    bins.set(key, item);
  }
  const opaqueCount = [...bins.values()].reduce((total, item) => total + item.count, 0);
  const sorted = [...bins.values()].sort((left, right) => right.count - left.count);
  const selected = [];
  let covered = 0;
  for (const item of sorted) {
    selected.push(item);
    covered += item.count;
    if (covered / Math.max(1, opaqueCount) >= 0.92) break;
    if (selected.length === 4) break;
  }
  const coverage = covered / Math.max(1, opaqueCount);
  if (coverage < 0.92 || selected.length > 3) {
    throw new Error(`${name}: border needs ${selected.length > 3 ? 'more than 3' : 'too many'} color clusters (${(coverage * 100).toFixed(1)}% coverage); regenerate without gradient or scene background`);
  }
  const palette = selected.map((item) => item.sum.map((value) => Math.round(value / item.count)));
  if (generationBackground === 'transparent-grid') {
    const invalid = palette.some((color) => {
      const luminance = 0.2126 * color[0] + 0.7152 * color[1] + 0.0722 * color[2];
      const saturation = Math.max(...color) - Math.min(...color);
      return luminance < 210 || saturation > 42;
    });
    if (invalid) throw new Error(`${name}: background is not a light neutral transparency grid; regenerate as an isolated transparent PNG without ground or shadow`);
    if (palette.length > 1) {
      const widest = Math.max(...palette.flatMap((color, index) => palette.slice(index + 1).map((other) => colorDistanceRgb(color, other))), 0);
      if (widest > 72) throw new Error(`${name}: transparency-grid colors drift too far apart; regenerate a neutral checkerboard`);
    }
  } else if (palette.length > 2 || coverage < 0.95) {
    throw new Error(`${name}: solid-chroma background is not a stable flat color; regenerate without gradient`);
  }
  return { transparentInput: false, palette, coverage, clusterCount: palette.length };
}

async function extractForeground(name) {
  const source = path.join(inputDir, name);
  const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  if (width < 64 || height < 64) throw new Error(`${name}: source is too small`);
  const pixelCount = width * height;
  const detected = detectBorderPalette(data, width, height, name);
  const background = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  let head = 0;
  let tail = 0;
  const eligible = (index) => {
    const offset = index * 4;
    if (data[offset + 3] < 16) return true;
    return !detected.transparentInput && detected.palette.some((color) => colorDistance(data, offset, color) <= threshold);
  };
  for (const index of borderIndexes(width, height)) {
    if (!background[index] && eligible(index)) { background[index] = 1; queue[tail++] = index; }
  }
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
  let backgroundLikeForeground = 0;
  let touchesBorder = false;
  for (let index = 0; index < pixelCount; index += 1) {
    const offset = index * 4;
    if (background[index]) { output[offset + 3] = 0; continue; }
    const x = index % width;
    const y = Math.floor(index / width);
    const adjacentBackground = (x > 0 && background[index - 1]) || (x + 1 < width && background[index + 1]) || (y > 0 && background[index - width]) || (y + 1 < height && background[index + width]);
    let alphaFactor = 1;
    if (adjacentBackground && !detected.transparentInput && detected.palette.length) {
      const nearest = detected.palette.reduce((best, color) => colorDistance(data, offset, color) < colorDistance(data, offset, best) ? color : best, detected.palette[0]);
      const distance = colorDistance(data, offset, nearest);
      alphaFactor = Math.max(0.08, Math.min(1, (distance - threshold) / Math.max(1, feather)));
      for (let channel = 0; channel < 3; channel += 1) {
        const foreground = (data[offset + channel] - (1 - alphaFactor) * nearest[channel]) / alphaFactor;
        output[offset + channel] = Math.max(0, Math.min(255, Math.round(foreground)));
      }
    }
    output[offset + 3] = Math.round(data[offset + 3] * alphaFactor);
    if (output[offset + 3] >= 16) {
      if (!detected.transparentInput && detected.palette.some((color) => colorDistance(data, offset, color) <= threshold)) backgroundLikeForeground += 1;
      foregroundPixels += 1;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) touchesBorder = true;
    }
  }
  if (foregroundPixels / pixelCount < 0.01) throw new Error(`${name}: foreground is empty or background conflicts with subject`);
  if (touchesBorder) throw new Error(`${name}: subject touches the source border; regenerate with more margin`);
  return {
    name, data: output, width, height, minX, minY, maxX, maxY,
    cropWidth: maxX - minX + 1,
    cropHeight: maxY - minY + 1,
    detected,
    foregroundRatio: foregroundPixels / pixelCount,
    backgroundLikeForegroundRatio: backgroundLikeForeground / pixelCount,
  };
}

for (const name of names) {
  try { extracted.set(name, await extractForeground(name)); }
  catch (error) { failures.push({ ok: false, name, error: error instanceof Error ? error.message : String(error) }); }
}

const maximum = Math.min(512 - safeMargin * 2, Math.floor(512 * targetOccupancy));
if (!failures.length) {
  for (const state of spec.states) {
    const stateAssets = state.frames.map((frame) => extracted.get(frame));
    if (stateAssets.some((asset) => !asset)) { failures.push({ ok: false, name: state.id, error: `${state.id}: missing extracted frame` }); continue; }
    const groupWidth = Math.max(...stateAssets.map((asset) => asset.cropWidth));
    const groupHeight = Math.max(...stateAssets.map((asset) => asset.cropHeight));
    const sharedScale = Math.min(maximum / groupWidth, maximum / groupHeight, 1);
    for (const asset of stateAssets) {
      try {
        const targetWidth = Math.max(1, Math.round(asset.cropWidth * sharedScale));
        const targetHeight = Math.max(1, Math.round(asset.cropHeight * sharedScale));
        const cropped = await sharp(asset.data, { raw: { width: asset.width, height: asset.height, channels: 4 } })
          .extract({ left: asset.minX, top: asset.minY, width: asset.cropWidth, height: asset.cropHeight })
          .resize(targetWidth, targetHeight, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
          .png().toBuffer();
        const anchorX = Math.round(state.anchor.x * 511);
        const anchorY = Math.round(state.anchor.y * 511);
        const left = Math.round(anchorX - targetWidth / 2);
        const top = Math.round(anchorY - targetHeight);
        if (left < 0 || top < 0 || left + targetWidth > 512 || top + targetHeight > 512) throw new Error(`${asset.name}: normalized frame exceeds canvas; regenerate with consistent framing`);
        const destination = path.join(outputDir, asset.name);
        await mkdir(path.dirname(destination), { recursive: true });
        await sharp({ create: { width: 512, height: 512, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
          .composite([{ input: cropped, left, top }]).png({ compressionLevel: 9, adaptiveFiltering: true }).toFile(destination);
        reports.push({
          ok: true,
          name: asset.name,
          state: state.id,
          backgroundInput: asset.detected.transparentInput ? 'real-alpha' : generationBackground,
          backgroundPalette: asset.detected.palette.map((color) => `#${color.map((value) => value.toString(16).padStart(2, '0')).join('').toUpperCase()}`),
          borderCoverage: asset.detected.coverage,
          sourceSize: [asset.width, asset.height],
          foregroundRatio: asset.foregroundRatio,
          backgroundLikeForegroundRatio: asset.backgroundLikeForegroundRatio,
          sourceBounds: [asset.minX, asset.minY, asset.maxX, asset.maxY],
          sharedScale,
          groupSourceMaximum: [groupWidth, groupHeight],
          outputBounds: [left, top, left + targetWidth - 1, top + targetHeight - 1],
        });
      } catch (error) {
        failures.push({ ok: false, name: asset.name, error: error instanceof Error ? error.message : String(error) });
      }
    }
  }
}

let trayIcon;
if (!failures.length) {
  const trayPath = path.join(trayDir, 'tray-icon.png');
  const corePath = path.join(outputDir, spec.character.coreAsset);
  const trimmed = await sharp(corePath).trim({ threshold: 8 }).resize(28, 28, { fit: 'contain', kernel: sharp.kernel.lanczos3 }).png().toBuffer();
  await sharp({ create: { width: 32, height: 32, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: trimmed, left: 2, top: 2 }]).png({ compressionLevel: 9 }).toFile(trayPath);
  const metadata = await sharp(trayPath).metadata();
  trayIcon = { path: path.relative(process.cwd(), trayPath).replaceAll('\\', '/'), width: metadata.width, height: metadata.height };
}

const reportPath = path.join(outputDir, 'asset-processing-report.json');
await writeFile(reportPath, `${JSON.stringify({
  schemaVersion: spec.schemaVersion,
  backgroundMode: spec.assetPipeline.backgroundMode,
  generationBackground,
  threshold,
  feather,
  safeMargin,
  targetOccupancy,
  trayIcon,
  assets: [...reports, ...failures],
}, null, 2)}\n`, 'utf8');
console.log(`Processed ${reports.length}/${names.size} assets. Report: ${reportPath}`);
if (failures.length) {
  for (const failure of failures) console.error(failure.error);
  process.exit(1);
}
