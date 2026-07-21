export type InterruptPolicy = 'resume' | 'restart' | 'discard' | 'block';
export type Direction = 'neutral' | 'left' | 'right';

export interface PetStateSpec {
  id: string;
  frames: string[];
  frameDurationMs: number;
  loop: boolean;
  priority: number;
  interrupt: InterruptPolicy;
  cooldownMs: number;
  direction: Direction;
  anchor: { x: number; y: number };
  mirrorSafe: boolean;
}

export interface PetSpec {
  schemaVersion: 1;
  app: { name: string; appId: string; version: string; language: string };
  targets: {
    windows: { enabled: boolean; arch: 'x64' };
    macos: { enabled: boolean; arch: 'current' | 'arm64' | 'x64' };
  };
  character: {
    inputType: 'single-image' | 'action-pack' | 'text' | 'existing-project';
    coreAsset: string;
    preserveTraits: string[];
    style: 'preserve' | 'balanced-cartoon' | 'key-elements' | 'custom';
    mirrorSafe: boolean;
  };
  features: {
    transparentWindow: true;
    drag: boolean;
    tray: boolean;
    edgeSnap: boolean;
    reminders: boolean;
    filePocket: boolean;
    dashboard: boolean;
    typingReaction: boolean;
  };
  states: PetStateSpec[];
  storage: { userData: 'app-user-data'; filePocket: 'documents-app-name' };
  build: { makers: Array<'squirrel' | 'dmg' | 'zip'>; windowsArch: 'x64'; macosArch: 'current' | 'arm64' | 'x64'; unsigned: true };
}

export interface Settings {
  edgeSnap: boolean;
  alwaysOnTop: boolean;
  typingReaction: boolean;
}

export interface Reminder {
  id: string;
  text: string;
  dueAt: string;
  createdAt: string;
}

export interface ReminderInput {
  text: string;
  dueAt: string;
}

export interface PutFilesResult {
  copied: string[];
  failed: Array<{ source: string; reason: string }>;
}

export type TypingStatus = { enabled: boolean; reason: string };

export interface PetAPI {
  settings: {
    get(): Promise<Settings>;
    update(patch: Partial<Settings>): Promise<Settings>;
  };
  reminders: {
    list(): Promise<Reminder[]>;
    save(input: ReminderInput): Promise<Reminder>;
    remove(id: string): Promise<boolean>;
  };
  files: {
    getPathForFile(file: File): string;
    put(paths: string[]): Promise<PutFilesResult>;
    openPocket(): Promise<void>;
  };
  window: {
    beginDrag(): Promise<void>;
    updateDrag(): Promise<void>;
    endDrag(): Promise<void>;
    showDashboard(): Promise<void>;
    hidePet(): Promise<void>;
  };
  events: {
    onStateActivity(listener: (activity: { kind: string }) => void): () => void;
    onReminder(listener: (reminder: Reminder) => void): () => void;
    onTypingStatus(listener: (status: TypingStatus) => void): () => void;
  };
}

declare global {
  interface Window { petAPI: PetAPI }
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function assertReminderInput(value: unknown): asserts value is ReminderInput {
  if (!isPlainObject(value) || typeof value.text !== 'string' || value.text.trim().length < 1 || value.text.length > 200) {
    throw new TypeError('Reminder text must contain 1-200 characters');
  }
  if (typeof value.dueAt !== 'string' || !Number.isFinite(Date.parse(value.dueAt))) {
    throw new TypeError('Reminder dueAt must be an ISO date string');
  }
}

export function assertSettingsPatch(value: unknown): asserts value is Partial<Settings> {
  if (!isPlainObject(value)) throw new TypeError('Settings patch must be an object');
  const allowed = new Set(['edgeSnap', 'alwaysOnTop', 'typingReaction']);
  for (const [key, item] of Object.entries(value)) {
    if (!allowed.has(key) || typeof item !== 'boolean') throw new TypeError(`Invalid settings key: ${key}`);
  }
}

export function assertStringArray(value: unknown): asserts value is string[] {
  if (!Array.isArray(value) || value.length > 100 || value.some((item) => typeof item !== 'string' || item.length < 1 || item.length > 32768)) {
    throw new TypeError('Expected up to 100 file paths');
  }
}
