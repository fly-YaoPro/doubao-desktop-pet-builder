import assert from 'node:assert/strict';
import path from 'node:path';
import { _electron as electron } from 'playwright';

async function main(): Promise<void> {
  const root = path.resolve(__dirname, '..', '..');
  const mainEntry = path.join(root, '.webpack', process.arch, 'main', 'index.js');
  const app = await electron.launch({ args: [mainEntry], cwd: root, timeout: 60_000 });
  const errors: string[] = [];
  app.on('window', (page) => {
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('pageerror', (error) => errors.push(error.message));
  });
  try {
    const petPage = await app.firstWindow();
    await petPage.waitForSelector('#pet-image');
    const windowCount = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);
    assert.equal(windowCount, 3, 'pet, reminder and dashboard must be independent windows');
    await petPage.click('#pet', { button: 'right' });
    const dashboardVisible = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().some((window) => window.getTitle().includes('面板') && window.isVisible()));
    assert.equal(dashboardVisible, true);
    await petPage.screenshot({ path: path.resolve('qa', 'e2e-pet.png'), omitBackground: true });
    assert.deepEqual(errors, []);
  } finally {
    await app.close();
  }
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
