import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { acquireActivityLock } from './activity-lock.mjs';

const root = process.cwd();
const buildDirectory = path.join(root, '.build');
const readyFile = path.join(buildDirectory, 'runtime-ready.json');
const failureFile = path.join(buildDirectory, 'runtime-failed.json');
const statusFile = path.join(buildDirectory, 'dev-status.json');
const forgeCli = path.join(root, 'node_modules', '@electron-forge', 'cli', 'dist', 'electron-forge.js');
const preflight = path.join(root, 'tools', 'preflight.mjs');
const npmCli = process.env.npm_execpath || path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
const spec = JSON.parse(await readFile(path.join(root, 'pet-spec.json'), 'utf8'));
const projectKey = createHash('sha256').update(root).digest('hex').slice(0, 12);
const asciiWindowsBase = [process.env.LOCALAPPDATA, process.env.TEMP, path.parse(root).root].find((value) => value && /^[\x00-\x7F]+$/.test(value));
const previewBase = process.platform === 'win32'
  ? path.join(asciiWindowsBase || path.parse(root).root, 'DoubaoPetPreview', projectKey)
  : path.join(path.dirname(root), '.doubao-pet-preview', projectKey);
const outDirectory = path.join(previewBase, 'out');
const activityLock = await acquireActivityLock(buildDirectory, 'dev-preview');
let child;

async function status(stage, extra = {}) {
  await writeFile(statusFile, `${JSON.stringify({ stage, pid: process.pid, updatedAt: new Date().toISOString(), ...extra }, null, 2)}\n`, 'utf8');
}

async function run(command, args, environment = {}) {
  const processChild = spawn(command, args, { cwd: root, stdio: 'inherit', shell: false, windowsHide: true, env: { ...process.env, ...environment } });
  const code = await new Promise((resolve, reject) => {
    processChild.once('error', reject);
    processChild.once('exit', (value) => resolve(value ?? 1));
  });
  if (code !== 0) throw new Error(`${path.basename(command)} ${args.join(' ')} exited with code ${code}`);
}

async function readJsonIfExists(file) {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if (error?.code === 'ENOENT') return undefined; throw error; }
}

async function waitForRuntimeReady(timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const failure = await readJsonIfExists(failureFile);
    if (failure) throw new Error(`Development preview failed at ${failure.event}: ${failure.message}`);
    const ready = await readJsonIfExists(readyFile);
    if (ready) {
      if (ready.status !== 'ready' || ready.naturalWidth < 1 || ready.assetCount !== ready.expectedAssetCount || ready.windowCount !== 3 || ready.petVisible !== true) {
        throw new Error(`Invalid runtime ready report: ${JSON.stringify(ready)}`);
      }
      return ready;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Development preview did not prove visible assets within ${Math.round(timeoutMs / 1000)} seconds.`);
}

async function previewExecutable() {
  const entries = await readdir(outDirectory, { withFileTypes: true });
  const platformToken = process.platform === 'win32' ? 'win32' : 'darwin';
  const packageDirectory = entries.find((entry) => entry.isDirectory() && entry.name.endsWith(`-${platformToken}-${process.arch}`));
  if (!packageDirectory) throw new Error(`Cannot find packaged preview for ${platformToken}-${process.arch} in ${outDirectory}`);
  const packagePath = path.join(outDirectory, packageDirectory.name);
  const executable = process.platform === 'win32'
    ? path.join(packagePath, `${spec.app.name}.exe`)
    : path.join(packagePath, `${spec.app.name}.app`, 'Contents', 'MacOS', spec.app.name);
  await access(executable);
  return executable;
}

async function terminateChild() {
  if (!child?.pid) return;
  if (process.platform === 'win32') {
    const killer = spawn('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' });
    await new Promise((resolve) => killer.once('close', resolve));
  } else child.kill('SIGTERM');
}

try {
  await mkdir(buildDirectory, { recursive: true });
  await rm(readyFile, { force: true });
  await rm(failureFile, { force: true });
  await rm(previewBase, { recursive: true, force: true });
  await mkdir(outDirectory, { recursive: true });
  await status('preflight');
  await run(process.execPath, [preflight]);
  await status('check');
  await run(process.execPath, [npmCli, 'run', 'check']);
  await status('package-preview');
  const platform = process.platform === 'win32' ? 'win32' : 'darwin';
  await run(process.execPath, [forgeCli, 'package', `--platform=${platform}`, `--arch=${process.arch}`], { PET_BUILD_MODE: 'none', PET_BUILD_OUT: outDirectory });
  const executable = await previewExecutable();
  await status('launch-preview', { executable });
  child = spawn(executable, [], { cwd: root, stdio: 'inherit', shell: false, windowsHide: false, env: { ...process.env, PET_PREVIEW_MODE: '1' } });
  const childExit = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => resolve(code ?? 1));
  });
  const first = await Promise.race([
    waitForRuntimeReady().then((report) => ({ kind: 'ready', report })),
    childExit.then((code) => ({ kind: 'exit', code })),
  ]);
  if (first.kind === 'exit') throw new Error(`Electron exited before runtime assets became visible (code ${first.code}).`);
  await status('ready', first.report);
  console.log(`DEV_PREVIEW_READY assets=${first.report.assetCount} image=${first.report.naturalWidth}x${first.report.naturalHeight} windows=${first.report.windowCount} state=${first.report.stateId}`);
  process.exitCode = await childExit;
} catch (error) {
  await status('failed', { error: error instanceof Error ? error.message : String(error) });
  await terminateChild();
  throw error;
} finally {
  await rm(previewBase, { recursive: true, force: true });
  await activityLock.release();
}
