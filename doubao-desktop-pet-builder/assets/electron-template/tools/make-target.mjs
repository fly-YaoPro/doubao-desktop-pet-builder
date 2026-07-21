import { spawn } from 'node:child_process';
import process from 'node:process';
import path from 'node:path';

const target = process.argv[2];
const expected = target === 'win' ? 'win32' : target === 'mac' ? 'darwin' : undefined;
if (!expected) throw new Error('Usage: make-target.mjs win|mac');
if (process.platform !== expected) throw new Error(`${target} packages must be built on a real ${expected} host; current host is ${process.platform}`);
const platform = target === 'win' ? 'win32' : 'darwin';
const arch = target === 'win' ? 'x64' : process.arch;
const forgeCli = path.join(process.cwd(), 'node_modules', '@electron-forge', 'cli', 'dist', 'electron-forge.js');

await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [forgeCli, 'make', `--platform=${platform}`, `--arch=${arch}`], { cwd: process.cwd(), stdio: 'inherit', shell: false });
  child.on('error', reject);
  child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`electron-forge make exited with ${code}`)));
});
await import('./collect-release.mjs');
