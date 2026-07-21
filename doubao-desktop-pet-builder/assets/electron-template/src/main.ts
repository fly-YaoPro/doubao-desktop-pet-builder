import { app, BrowserWindow, ipcMain, Menu, nativeImage, screen, shell, Tray, type IpcMainInvokeEvent } from 'electron';
import { copyFile, lstat, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import specData from '../pet-spec.json';
import type { PetSpec, Reminder, Settings, TypingStatus } from './shared/contracts';
import { assertReminderInput, assertSettingsPatch, assertStringArray } from './shared/contracts';
import { draggedBounds, snapBounds, type Point, type Rect } from './main/drag';
import { JsonLogger } from './main/logger';
import { atomicWriteJson, readJson, uniqueDestination } from './main/persistence';
import { TypingListener } from './main/typing-listener';

const spec = specData as PetSpec;
type Role = 'pet' | 'reminder' | 'dashboard';

let petWindow: BrowserWindow | undefined;
let reminderWindow: BrowserWindow | undefined;
let dashboardWindow: BrowserWindow | undefined;
let tray: Tray | undefined;
let logger: JsonLogger | undefined;
let settings: Settings;
let reminders: Reminder[] = [];
let typingStatus: TypingStatus = { enabled: false, reason: 'not-started' };
let isQuitting = false;
let dragSession: { bounds: Rect; cursor: Point } | undefined;
const roles = new Map<number, Role>();
const reminderTimers = new Map<string, ReturnType<typeof setTimeout>>();
const typingListener = new TypingListener();

const defaultSettings: Settings = {
  edgeSnap: spec.features.edgeSnap,
  alwaysOnTop: true,
  typingReaction: spec.features.typingReaction,
};

function userFile(name: string): string { return path.join(app.getPath('userData'), name); }
function filePocket(): string { return path.join(app.getPath('documents'), spec.app.name); }

function assertSender(event: IpcMainInvokeEvent, allowed: Role[]): Role {
  const role = roles.get(event.sender.id);
  if (!role || !allowed.includes(role) || event.senderFrame !== event.sender.mainFrame) throw new Error('Unauthorized IPC sender');
  return role;
}

function registerWindow(window: BrowserWindow, role: Role): BrowserWindow {
  const webContentsId = window.webContents.id;
  roles.set(webContentsId, role);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  window.on('closed', () => roles.delete(webContentsId));
  return window;
}

function secureWindow(options: Electron.BrowserWindowConstructorOptions, role: Role, preload: string): BrowserWindow {
  return registerWindow(new BrowserWindow({
    ...options,
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: !app.isPackaged,
    },
  }), role);
}

function createWindows(): void {
  petWindow = secureWindow({
    width: 220,
    height: 220,
    transparent: true,
    frame: false,
    resizable: false,
    show: false,
    alwaysOnTop: settings.alwaysOnTop,
    skipTaskbar: true,
    hasShadow: false,
  }, 'pet', PET_WINDOW_PRELOAD_WEBPACK_ENTRY);
  void petWindow.loadURL(PET_WINDOW_WEBPACK_ENTRY);
  petWindow.once('ready-to-show', () => petWindow?.show());

  reminderWindow = secureWindow({
    width: 380,
    height: 210,
    frame: true,
    show: false,
    resizable: false,
    alwaysOnTop: true,
    title: `${spec.app.name} 提醒`,
  }, 'reminder', REMINDER_WINDOW_PRELOAD_WEBPACK_ENTRY);
  void reminderWindow.loadURL(REMINDER_WINDOW_WEBPACK_ENTRY);
  reminderWindow.on('close', (event) => {
    if (!isQuitting) { event.preventDefault(); reminderWindow?.hide(); }
  });

  dashboardWindow = secureWindow({
    width: 520,
    height: 640,
    minWidth: 440,
    minHeight: 520,
    show: false,
    title: `${spec.app.name} 面板`,
  }, 'dashboard', DASHBOARD_WINDOW_PRELOAD_WEBPACK_ENTRY);
  void dashboardWindow.loadURL(DASHBOARD_WINDOW_WEBPACK_ENTRY);
  dashboardWindow.on('close', (event) => {
    if (!isQuitting) { event.preventDefault(); dashboardWindow?.hide(); }
  });
}

function createTray(): void {
  if (!spec.features.tray) return;
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="13" fill="#ff9f43"/><circle cx="11" cy="14" r="2"/><circle cx="21" cy="14" r="2"/><path d="M10 21 Q16 26 22 21" fill="none" stroke="#222" stroke-width="2"/></svg>';
  tray = new Tray(nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`));
  tray.setToolTip(spec.app.name);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示桌宠', click: () => petWindow?.show() },
    { label: '控制面板', click: () => { dashboardWindow?.show(); dashboardWindow?.focus(); } },
    { label: '文件口袋', click: () => void openPocket() },
    { type: 'separator' },
    { label: '退出', click: () => { isQuitting = true; app.quit(); } },
  ]));
  tray.on('click', () => petWindow?.isVisible() ? petWindow.hide() : petWindow?.show());
}

async function saveSettings(next: Settings): Promise<Settings> {
  settings = next;
  await atomicWriteJson(userFile('settings.json'), settings);
  petWindow?.setAlwaysOnTop(settings.alwaysOnTop);
  restartTypingListener();
  return settings;
}

function broadcastTypingStatus(): void {
  for (const window of [petWindow, reminderWindow, dashboardWindow]) {
    if (window && !window.isDestroyed()) window.webContents.send('typing:status', typingStatus);
  }
}

function restartTypingListener(): void {
  typingListener.stop();
  typingStatus = typingListener.start(settings.typingReaction, () => {
    petWindow?.webContents.send('state:activity', { kind: 'typing' });
  });
  broadcastTypingStatus();
  void logger?.write(typingStatus.enabled ? 'info' : 'warn', 'typing-listener-status', typingStatus);
}

function clearReminderTimer(id: string): void {
  const timer = reminderTimers.get(id);
  if (timer) clearTimeout(timer);
  reminderTimers.delete(id);
}

function scheduleReminder(reminder: Reminder): void {
  clearReminderTimer(reminder.id);
  const delay = Math.max(0, Date.parse(reminder.dueAt) - Date.now());
  if (delay > 2_147_000_000) return;
  reminderTimers.set(reminder.id, setTimeout(() => {
    reminderTimers.delete(reminder.id);
    reminderWindow?.show();
    reminderWindow?.focus();
    reminderWindow?.webContents.send('reminder:due', reminder);
    petWindow?.webContents.send('state:activity', { kind: 'notify' });
  }, delay));
}

async function persistReminders(): Promise<void> {
  await atomicWriteJson(userFile('reminders.json'), reminders);
}

async function openPocket(): Promise<void> {
  const directory = filePocket();
  await mkdir(directory, { recursive: true });
  const failure = await shell.openPath(directory);
  if (failure) throw new Error(failure);
}

function registerIpc(): void {
  ipcMain.handle('settings:get', (event) => { assertSender(event, ['pet', 'reminder', 'dashboard']); return settings; });
  ipcMain.handle('settings:update', async (event, patch: unknown) => {
    assertSender(event, ['dashboard']);
    assertSettingsPatch(patch);
    return saveSettings({ ...settings, ...patch });
  });
  ipcMain.handle('reminders:list', (event) => { assertSender(event, ['dashboard']); return reminders; });
  ipcMain.handle('reminders:save', async (event, input: unknown) => {
    assertSender(event, ['dashboard']);
    assertReminderInput(input);
    const reminder: Reminder = { id: randomUUID(), text: input.text.trim(), dueAt: new Date(input.dueAt).toISOString(), createdAt: new Date().toISOString() };
    reminders.push(reminder);
    await persistReminders();
    scheduleReminder(reminder);
    return reminder;
  });
  ipcMain.handle('reminders:remove', async (event, id: unknown) => {
    assertSender(event, ['dashboard']);
    if (typeof id !== 'string' || id.length > 100) throw new TypeError('Invalid reminder id');
    const oldLength = reminders.length;
    reminders = reminders.filter((item) => item.id !== id);
    clearReminderTimer(id);
    await persistReminders();
    return oldLength !== reminders.length;
  });
  ipcMain.handle('files:put', async (event, paths: unknown) => {
    assertSender(event, ['pet']);
    assertStringArray(paths);
    const destination = filePocket();
    await mkdir(destination, { recursive: true });
    const result = { copied: [] as string[], failed: [] as Array<{ source: string; reason: string }> };
    for (const source of paths) {
      try {
        if (!(await lstat(source)).isFile()) throw new Error('Only regular files are accepted');
        const target = await uniqueDestination(destination, path.basename(source));
        await copyFile(source, target);
        result.copied.push(target);
      } catch (error) {
        result.failed.push({ source, reason: error instanceof Error ? error.message : String(error) });
      }
    }
    return result;
  });
  ipcMain.handle('files:open-pocket', async (event) => { assertSender(event, ['pet', 'dashboard']); await openPocket(); });
  ipcMain.handle('window:drag-begin', (event) => {
    assertSender(event, ['pet']);
    if (!petWindow) return;
    dragSession = { bounds: petWindow.getBounds(), cursor: screen.getCursorScreenPoint() };
  });
  ipcMain.handle('window:drag-update', (event) => {
    assertSender(event, ['pet']);
    if (!petWindow || !dragSession) return;
    petWindow.setBounds(draggedBounds(dragSession.bounds, dragSession.cursor, screen.getCursorScreenPoint()), false);
  });
  ipcMain.handle('window:drag-end', (event) => {
    assertSender(event, ['pet']);
    if (!petWindow || !dragSession) return;
    dragSession = undefined;
    if (settings.edgeSnap) {
      const point = screen.getCursorScreenPoint();
      const workArea = screen.getDisplayNearestPoint(point).workArea;
      petWindow.setBounds(snapBounds(petWindow.getBounds(), workArea), true);
    }
  });
  ipcMain.handle('window:show-dashboard', (event) => { assertSender(event, ['pet']); dashboardWindow?.show(); dashboardWindow?.focus(); });
  ipcMain.handle('window:hide-pet', (event) => { assertSender(event, ['pet', 'dashboard']); petWindow?.hide(); });
}

async function initialize(): Promise<void> {
  logger = new JsonLogger(userFile('logs/app.jsonl'));
  settings = await readJson(userFile('settings.json'), defaultSettings);
  reminders = await readJson(userFile('reminders.json'), [] as Reminder[]);
  createWindows();
  createTray();
  registerIpc();
  reminders.forEach(scheduleReminder);
  restartTypingListener();
  await logger.write('info', 'app-ready', { platform: process.platform, arch: process.arch, version: spec.app.version });
}

app.whenReady().then(initialize).catch(async (error) => {
  console.error(error);
  await logger?.write('error', 'initialize-failed', { message: error instanceof Error ? error.message : String(error) });
  app.exit(1);
});

app.on('window-all-closed', () => { /* tray app stays alive */ });
app.on('before-quit', () => {
  isQuitting = true;
  typingListener.stop();
  for (const timer of reminderTimers.values()) clearTimeout(timer);
  reminderTimers.clear();
});
app.on('render-process-gone', (_event, webContents, details) => {
  void logger?.write('error', 'render-process-gone', { webContentsId: webContents.id, reason: details.reason, exitCode: details.exitCode });
  if (details.reason === 'crashed') app.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error(error);
  void logger?.write('error', 'uncaught-exception', { message: error.message, stack: error.stack }).finally(() => app.exit(1));
});
process.on('unhandledRejection', (reason) => {
  const error = reason instanceof Error ? reason : new Error(String(reason));
  console.error(error);
  void logger?.write('error', 'unhandled-rejection', { message: error.message, stack: error.stack }).finally(() => app.exit(1));
});
