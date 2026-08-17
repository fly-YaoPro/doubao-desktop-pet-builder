import { spawn } from 'node:child_process';
import { appendFile, copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import process from 'node:process';
import { acquireActivityLock } from './activity-lock.mjs';

const requestedMode = process.argv[2];
const mode = requestedMode === 'package-host' ? `package-${process.platform === 'win32' ? 'win' : 'mac'}` : requestedMode;
const modes = {
  'package-win': { platform: 'win32', arch: 'x64', make: false, makerMode: 'none', collectMode: 'package' },
  'installer-win': { platform: 'win32', arch: 'x64', make: true, makerMode: 'installer', collectMode: 'make' },
  'portable-win': { platform: 'win32', arch: 'x64', make: true, makerMode: 'portable', collectMode: 'make' },
  'package-mac': { platform: 'darwin', arch: process.arch, make: false, makerMode: 'none', collectMode: 'package' },
  'make-mac': { platform: 'darwin', arch: process.arch, make: true, makerMode: 'all', collectMode: 'make' },
  'portable-mac': { platform: 'darwin', arch: process.arch, make: true, makerMode: 'portable', collectMode: 'make' },
};
const selected = modes[mode];
if (!selected) throw new Error(`Unknown build mode: ${requestedMode}. Use package-win, installer-win, portable-win, package-mac, make-mac or portable-mac.`);
if (process.platform !== selected.platform) throw new Error(`${mode} must run on a real ${selected.platform} host; current host is ${process.platform}.`);

const root = process.cwd();
const buildDir = path.resolve(root, '.build');
const projectKey = createHash('sha256').update(root).digest('hex').slice(0, 12);
const asciiWindowsBase = [process.env.LOCALAPPDATA, process.env.TEMP, path.parse(root).root]
  .find((value) => value && /^[\x00-\x7F]+$/.test(value));
const externalBuildBase = process.platform === 'win32'
  ? path.join(asciiWindowsBase || path.parse(root).root, 'DoubaoPetBuilder', projectKey)
  : path.join(path.dirname(root), '.doubao-pet-build-temp', projectKey);
const tempDir = path.join(externalBuildBase, 'temp');
const outDir = path.join(externalBuildBase, 'out');
const statusFile = path.join(buildDir, 'status.json');
const logFile = path.join(buildDir, 'build.log');
const spec = JSON.parse(await readFile(path.join(root, 'pet-spec.json'), 'utf8'));
const timeoutMs = spec.build.timeoutMinutes * 60_000;
const startedAt = new Date().toISOString();
let activityLock;
let child;
let heartbeat;
let currentStage = 'starting';

async function status(stage = currentStage, extra = {}) {
  currentStage = stage;
  await writeFile(statusFile, `${JSON.stringify({ mode, stage: currentStage, pid: process.pid, startedAt, updatedAt: new Date().toISOString(), ...extra }, null, 2)}\n`, 'utf8');
}

async function log(chunk) {
  const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
  process.stdout.write(value);
  await appendFile(logFile, value);
}

async function run(command, args, stage, environment = {}) {
  await status(stage);
  await log(`\n[${new Date().toISOString()}] ${command} ${args.join(' ')}\n`);
  await new Promise((resolve, reject) => {
    child = spawn(command, args, { cwd: root, shell: false, windowsHide: true, env: { ...process.env, ...environment } });
    const timer = setTimeout(() => {
      const error = new Error(`${stage} exceeded the ${spec.build.timeoutMinutes}-minute limit. Full output: ${logFile}`);
      if (process.platform === 'win32' && child?.pid) {
        const killer = spawn('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' });
        killer.once('close', () => reject(error));
      } else {
        child?.kill('SIGTERM');
        reject(error);
      }
    }, timeoutMs);
    child.stdout?.on('data', (data) => { void log(data); });
    child.stderr?.on('data', (data) => { void log(data); });
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('exit', (code) => {
      clearTimeout(timer);
      child = undefined;
      code === 0 ? resolve() : reject(new Error(`${stage} exited with code ${code}. Full output: ${logFile}`));
    });
  });
}

await mkdir(buildDir, { recursive: true });
activityLock = await acquireActivityLock(buildDir, mode);

try {
  await rm(logFile, { force: true });
  await rm(externalBuildBase, { recursive: true, force: true });
  await mkdir(tempDir, { recursive: true });
  heartbeat = setInterval(() => { void status(); }, 15_000);
  const npmCli = process.env.npm_execpath || path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  const forgeCli = path.join(root, 'node_modules', '@electron-forge', 'cli', 'dist', 'electron-forge.js');
  await run(process.execPath, [path.join(root, 'tools', 'preflight.mjs')], 'preflight');
  await run(process.execPath, [npmCli, 'run', 'check'], 'check');
  await run(process.execPath, [npmCli, 'run', 'qa:experience'], 'qa-experience');
  await run(process.execPath, [npmCli, 'run', 'qa:assets'], 'qa-assets');
  await status('clean');
  await rm(path.join(root, '.webpack'), { recursive: true, force: true });
  await rm(path.join(root, 'out'), { recursive: true, force: true });
  const environment = { TEMP: tempDir, TMP: tempDir, PET_BUILD_MODE: selected.makerMode, PET_BUILD_OUT: outDir };
  await run(process.execPath, [forgeCli, 'package', `--platform=${selected.platform}`, `--arch=${selected.arch}`], 'package', environment);
  if (selected.make) {
    await run(process.execPath, [forgeCli, 'make', '--skip-package', `--platform=${selected.platform}`, `--arch=${selected.arch}`], 'make', environment);
  }
  await run(process.execPath, [path.join(root, 'tools', 'collect-release.mjs'), `--mode=${selected.collectMode}`, `--platform=${selected.platform}`, `--arch=${selected.arch}`, `--out=${outDir}`], 'collect-release');
  await copyFile(logFile, path.join(root, 'release', 'build.log'));
  await status('completed', { release: path.join(root, 'release') });
  await log(`\nBuild complete. Output: ${path.join(root, 'release')}\n`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  await status('failed', { error: message, logFile });
  await log(`\nBUILD FAILED: ${message}\n`);
  process.exitCode = 1;
} finally {
  if (heartbeat) clearInterval(heartbeat);
  await rm(externalBuildBase, { recursive: true, force: true });
  await activityLock?.release();
}
