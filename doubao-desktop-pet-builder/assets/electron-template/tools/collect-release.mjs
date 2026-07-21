import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const root = process.cwd();
const release = path.resolve(root, 'release');
if (path.dirname(release) !== path.resolve(root)) throw new Error('Refusing unsafe release path');
await rm(release, { recursive: true, force: true });
await mkdir(release, { recursive: true });
const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const accepted = new Set(['.exe', '.dmg', '.zip']);
const found = [];

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(full);
    else if (accepted.has(path.extname(entry.name).toLowerCase())) found.push(full);
  }
}
await walk(path.join(root, 'out', 'make'));
if (!found.length) throw new Error('No .exe, .dmg or .zip artifacts found under out/make');
const artifacts = [];
for (const source of found) {
  let name = path.basename(source);
  let destination = path.join(release, name);
  for (let index = 1; await stat(destination).then(() => true, () => false); index += 1) {
    const parsed = path.parse(name);
    destination = path.join(release, `${parsed.name}-${index}${parsed.ext}`);
  }
  await copyFile(source, destination);
  const bytes = await readFile(destination);
  artifacts.push({ file: path.basename(destination), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
}
const manifest = { app: packageJson.productName ?? packageJson.name, version: packageJson.version, platform: process.platform, arch: process.arch, unsigned: true, artifacts };
await writeFile(path.join(release, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(`Collected ${artifacts.length} artifact(s) in ${release}`);
