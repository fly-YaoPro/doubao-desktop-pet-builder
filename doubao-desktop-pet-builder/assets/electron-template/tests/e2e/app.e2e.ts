import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir, rm } from 'node:fs/promises';
import { _electron as electron, type ElectronApplication, type Page } from 'playwright';
import specData from '../../pet-spec.json';
import type { PetSpec } from '../../src/shared/contracts';

const spec = specData as PetSpec;

async function findWindow(app: ElectronApplication, fragment: string): Promise<Page> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const page = app.windows().find((item) => item.url().includes(fragment));
    if (page) return page;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Missing Electron window: ${fragment}`);
}

async function main(): Promise<void> {
  const root = path.resolve(__dirname, '..', '..');
  const mainEntry = path.join(root, '.webpack', process.arch, 'main', 'index.js');
  const e2eUserData = path.resolve(root, 'qa', 'e2e-user-data');
  await rm(e2eUserData, { recursive: true, force: true });
  await mkdir(path.resolve(root, 'qa'), { recursive: true });
  const app = await electron.launch({
    args: [mainEntry],
    cwd: root,
    env: { ...process.env, PET_E2E_USER_DATA: e2eUserData },
    timeout: 60_000,
  });
  const errors: string[] = [];
  app.on('window', (page) => {
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('pageerror', (error) => errors.push(error.message));
  });
  try {
    await app.firstWindow();
    const petPage = await findWindow(app, 'pet_window');
    await petPage.waitForFunction(() => {
      const image = document.querySelector<HTMLImageElement>('#pet-image');
      if (!image || !image.complete || image.naturalWidth < 1 || image.naturalHeight < 1 || !image.src) return false;
      const bounds = image.getBoundingClientRect();
      return bounds.width >= 24 && bounds.height >= 24 && getComputedStyle(image).visibility !== 'hidden';
    });
    assert.equal(await petPage.locator('#asset-error').isHidden(), true, 'runtime asset error must stay hidden');
    const imageEvidence = await petPage.locator('#pet-image').evaluate((image: HTMLImageElement) => ({
      state: image.dataset.state,
      frame: image.dataset.frame,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
      src: image.src,
    }));
    const initial = spec.states.find((state) => state.triggers.includes('app:start')) ?? spec.states.find((state) => state.id === 'idle') ?? spec.states[0]!;
    assert.equal(imageEvidence.state, initial.id);
    assert.ok(initial.frames.includes(imageEvidence.frame ?? ''), 'initial frame must come from the current spec');
    assert.equal(imageEvidence.naturalWidth, 512);
    assert.equal(imageEvidence.naturalHeight, 512);
    const expectedPetSize = Math.round(spec.experience.petSizing.baseWindowPx * spec.experience.petSizing.defaultScale);
    const petBounds = await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows().find((item) => item.webContents.getURL().includes('pet_window'));
      return window?.getBounds();
    });
    assert.ok(Math.abs((petBounds?.width ?? 0) - expectedPetSize) <= 1, 'default pet width must stay compact (allow 1 DIP rounding)');
    assert.ok(Math.abs((petBounds?.height ?? 0) - expectedPetSize) <= 1, 'default pet height must stay compact (allow 1 DIP rounding)');
    const windowCount = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);
    assert.equal(windowCount, 3, 'pet, reminder and dashboard must be independent windows');

    const expectedInteraction = spec.experience.interactions[0];
    assert.ok(expectedInteraction, 'current spec must contain an interaction');
    const interaction = await petPage.evaluate((id) => window.petAPI.interactions.trigger(id), expectedInteraction.id);
    assert.equal(interaction.interaction.id, expectedInteraction.id);
    await petPage.waitForFunction((stateId) => document.querySelector<HTMLImageElement>('#pet-image')?.dataset.state === stateId, expectedInteraction.stateId);
    assert.ok(await petPage.locator('#bubble').textContent(), 'interaction feedback bubble must be visible');

    await petPage.evaluate(() => window.petAPI.window.showDashboard());
    const dashboard = await findWindow(app, 'dashboard_window');
    await dashboard.waitForSelector('#character-name');
    assert.equal(await dashboard.locator('#character-name').textContent(), spec.character.displayName);
    assert.equal(await dashboard.locator('.interaction-button').count(), spec.experience.interactions.length);
    assert.deepEqual(
      await dashboard.locator('.interaction-button').allTextContents(),
      spec.experience.interactions.map((item) => `${item.emoji} ${item.label}`),
      'interaction buttons must keep semantic emoji labels',
    );
    const dashboardRoot = await dashboard.evaluate(() => ({
      widthFits: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      heightFits: document.documentElement.scrollHeight <= document.documentElement.clientHeight,
      overflow: getComputedStyle(document.documentElement).overflow,
    }));
    assert.deepEqual(dashboardRoot, { widthFits: true, heightFits: true, overflow: 'hidden' }, 'dashboard must not expose a native page scrollbar');
    await dashboard.waitForFunction(() => {
      const image = document.querySelector<HTMLImageElement>('#character-avatar');
      return Boolean(image?.complete && image.naturalWidth > 0 && image.src);
    });
    assert.ok(Number(await dashboard.locator('#interaction-value').textContent()) >= 1);
    await dashboard.screenshot({ path: path.resolve(root, 'qa', 'e2e-dashboard.png'), omitBackground: true });

    await petPage.evaluate(() => window.petAPI.window.showReminder());
    const reminder = await findWindow(app, 'reminder_window');
    await reminder.waitForSelector('#compose-view:not([hidden])');
    assert.equal(await reminder.locator('[data-minutes]').count(), 6);
    const reminderRoot = await reminder.evaluate(() => ({
      widthFits: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      heightFits: document.documentElement.scrollHeight <= document.documentElement.clientHeight,
      overflow: getComputedStyle(document.documentElement).overflow,
    }));
    assert.deepEqual(reminderRoot, { widthFits: true, heightFits: true, overflow: 'hidden' }, 'reminder must not expose a native page scrollbar');
    await reminder.screenshot({ path: path.resolve(root, 'qa', 'e2e-reminder.png'), omitBackground: true });
    await petPage.screenshot({ path: path.resolve(root, 'qa', 'e2e-pet.png'), omitBackground: true });
    assert.deepEqual(errors, []);
  } finally {
    await app.close();
  }
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
