import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { _electron as electron } from 'playwright';

async function main(): Promise<void> {
  const root = path.resolve(__dirname, '..', '..');
  const durationMinutes = Number(process.env.PET_SOAK_MINUTES ?? 60);
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) throw new Error('PET_SOAK_MINUTES must be positive');
  const durationMs = durationMinutes * 60_000;
  const intervalMs = Math.min(30_000, Math.max(1000, durationMs / 120));
  const mainEntry = path.join(root, '.webpack', process.arch, 'main', 'index.js');
  const app = await electron.launch({ args: [mainEntry], cwd: root, timeout: 60_000 });
  const errors: string[] = [];
  const samples: Array<{ elapsedMs: number; windows: number; workingSetKb: number }> = [];
  app.on('window', (page) => {
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  });
  const started = Date.now();
  try {
    await app.firstWindow();
    while (Date.now() - started < durationMs) {
      const sample = await app.evaluate(({ app, BrowserWindow }) => ({
        windows: BrowserWindow.getAllWindows().length,
        workingSetKb: app.getAppMetrics().reduce((sum, metric) => sum + metric.memory.workingSetSize, 0),
      }));
      samples.push({ elapsedMs: Date.now() - started, ...sample });
      assert.equal(sample.windows, 3, 'window count changed during soak');
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    assert.deepEqual(errors, []);
    const first = samples[0]?.workingSetKb ?? 0;
    const last = samples.at(-1)?.workingSetKb ?? 0;
    assert.ok(last - first < Math.max(131_072, first * 0.5), `working set grew from ${first}KB to ${last}KB`);
  } finally {
    await app.close();
    await mkdir(path.join(root, 'qa'), { recursive: true });
    await writeFile(path.join(root, 'qa', 'soak-report.json'), `${JSON.stringify({ platform: process.platform, arch: process.arch, durationMinutes, errors, samples }, null, 2)}\n`, 'utf8');
  }
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
