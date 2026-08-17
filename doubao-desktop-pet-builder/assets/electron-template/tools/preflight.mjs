import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const required = [
  'node_modules/@electron-forge/cli/dist/electron-forge.js',
  'node_modules/electron/package.json',
  'node_modules/sharp/package.json',
  'node_modules/typescript/package.json',
];
const missing = [];
for (const relative of required) {
  try { await access(path.join(root, relative)); }
  catch { missing.push(relative); }
}
if (missing.length) {
  console.error(`Dependency preflight failed. Run exactly "npm ci" once, then retry. Missing:\n${missing.map((item) => `- ${item}`).join('\n')}`);
  process.exit(1);
}
const lock = JSON.parse(await readFile(path.join(root, 'package-lock.json'), 'utf8'));
const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
if (lock.name !== packageJson.name || lock.version !== packageJson.version) {
  console.error('Dependency preflight failed: package-lock identity does not match package.json. Regenerate through the builder, not npm install.');
  process.exit(1);
}
console.log('Dependency preflight: PASS (locked toolchain present).');
