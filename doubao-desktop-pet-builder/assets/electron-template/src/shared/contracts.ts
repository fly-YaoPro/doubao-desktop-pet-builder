export type InterruptPolicy = 'resume' | 'restart' | 'discard' | 'block';
export type Direction = 'neutral' | 'left' | 'right';
export type PetScale = 0.65 | 0.8 | 1 | 1.2;

export interface PetStateSpec {
  id: string;
  triggers: string[];
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

export interface InteractionSpec {
  id: string;
  emoji: string;
  label: string;
  stateId: string;
  durationMs: number;
  affectionGain: number;
  feedback: string[];
}

export interface PetSpec {
  schemaVersion: 4;
  app: { name: string; appId: string; version: string; language: string };
  targets: {
    windows: { enabled: boolean; arch: 'x64' };
    macos: { enabled: boolean; arch: 'current' | 'arm64' | 'x64' };
  };
  character: {
    inputType: 'single-image' | 'action-pack' | 'text' | 'existing-project';
    coreAsset: string;
    displayName: string;
    archetype: 'cat' | 'dog' | 'rabbit' | 'bird' | 'reptile' | 'fish' | 'fantasy' | 'person' | 'robot' | 'object' | 'custom';
    personality: string[];
    preserveTraits: string[];
    style: 'preserve' | 'balanced-cartoon' | 'key-elements' | 'custom';
    mirrorSafe: boolean;
  };
  assetPipeline: {
    backgroundMode: 'adaptive-flood';
    generationBackground: 'transparent-grid' | 'solid-chroma';
    backgroundTolerance: number;
    edgeFeather: number;
    safeMargin: number;
    targetOccupancy: number;
  };
  experience: {
    theme: { primary: string; accent: string; background: string; surface: string; text: string; muted: string; cornerRadius: number };
    petSizing: { baseWindowPx: number; defaultScale: PetScale };
    interactions: InteractionSpec[];
  };
  motion: {
    breathing: { enabled: boolean; periodMs: number; scaleX: number; scaleY: number };
    squashStretch: { enabled: boolean; durationMs: number; intensity: number };
    idleIntervalMs: { min: number; max: number };
  };
  features: {
    transparentWindow: true;
    drag: boolean;
    tray: boolean;
    edgeSnap: boolean;
    reminders: boolean;
    interactions: boolean;
    relationship: boolean;
    filePocket: boolean;
    dashboard: boolean;
    typingReaction: boolean;
    autonomousMovement: boolean;
  };
  states: PetStateSpec[];
  storage: { userData: 'app-user-data'; filePocket: 'documents-app-name' };
  build: {
    windows: { arch: 'x64'; installer: 'squirrel'; portable: 'zip' };
    macos: { arch: 'current' | 'arm64' | 'x64'; diskImage: 'dmg'; portable: 'zip' };
    timeoutMinutes: number;
    unsigned: true;
  };
}

export interface Settings {
  edgeSnap: boolean;
  alwaysOnTop: boolean;
  typingReaction: boolean;
  clickThrough: boolean;
  petScale: PetScale;
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

export interface PetStats {
  affection: number;
  mood: number;
  todayInteractions: number;
  companionMinutes: number;
  lastInteractionDate: string;
}

export interface StateActivity {
  kind: string;
  stateId?: string;
  durationMs?: number;
  feedback?: string;
}

export interface InteractionResult {
  interaction: InteractionSpec;
  feedback: string;
  stats: PetStats;
}

export interface PutFilesResult {
  copied: string[];
  failed: Array<{ source: string; reason: string }>;
}

export type TypingStatus = { enabled: boolean; reason: string };

export interface RuntimeReadyReport {
  stateId: string;
  frame: string;
  assetCount: number;
  naturalWidth: number;
  naturalHeight: number;
}

export interface RuntimeFailureReport {
  stage: 'asset-map' | 'image-load' | 'renderer';
  message: string;
  frame?: string;
}

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
  interactions: {
    list(): Promise<InteractionSpec[]>;
    trigger(id: string): Promise<InteractionResult>;
    stats(): Promise<PetStats>;
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
    showContextMenu(): Promise<void>;
    showReminder(): Promise<void>;
    showDashboard(): Promise<void>;
    hideReminder(): Promise<void>;
    hideDashboard(): Promise<void>;
    hidePet(): Promise<void>;
  };
  runtime: {
    ready(report: RuntimeReadyReport): Promise<void>;
    fail(report: RuntimeFailureReport): Promise<void>;
  };
  events: {
    onStateActivity(listener: (activity: StateActivity) => void): () => void;
    onReminder(listener: (reminder: Reminder) => void): () => void;
    onReminderCompose(listener: () => void): () => void;
    onStats(listener: (stats: PetStats) => void): () => void;
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
  const booleanKeys = new Set(['edgeSnap', 'alwaysOnTop', 'typingReaction', 'clickThrough']);
  for (const [key, item] of Object.entries(value)) {
    if (booleanKeys.has(key)) {
      if (typeof item !== 'boolean') throw new TypeError(`Invalid settings key: ${key}`);
      continue;
    }
    if (key === 'petScale' && [0.65, 0.8, 1, 1.2].includes(item as number)) continue;
    throw new TypeError(`Invalid settings key: ${key}`);
  }
}

export function assertInteractionId(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) throw new TypeError('Invalid interaction id');
}

export function assertStringArray(value: unknown): asserts value is string[] {
  if (!Array.isArray(value) || value.length > 100 || value.some((item) => typeof item !== 'string' || item.length < 1 || item.length > 32768)) {
    throw new TypeError('Expected up to 100 file paths');
  }
}

export function assertRuntimeReadyReport(value: unknown): asserts value is RuntimeReadyReport {
  if (!isPlainObject(value)) throw new TypeError('Runtime ready report must be an object');
  if (typeof value.stateId !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.stateId)) throw new TypeError('Invalid runtime stateId');
  if (typeof value.frame !== 'string' || value.frame.length < 1 || value.frame.length > 512) throw new TypeError('Invalid runtime frame');
  for (const key of ['assetCount', 'naturalWidth', 'naturalHeight'] as const) {
    const item = value[key];
    if (typeof item !== 'number' || !Number.isInteger(item) || item < 1 || item > 10000) throw new TypeError(`Invalid runtime ${key}`);
  }
}

export function assertRuntimeFailureReport(value: unknown): asserts value is RuntimeFailureReport {
  if (!isPlainObject(value) || !['asset-map', 'image-load', 'renderer'].includes(String(value.stage))) throw new TypeError('Invalid runtime failure stage');
  if (typeof value.message !== 'string' || value.message.length < 1 || value.message.length > 1000) throw new TypeError('Invalid runtime failure message');
  if (value.frame !== undefined && (typeof value.frame !== 'string' || value.frame.length > 512)) throw new TypeError('Invalid runtime failure frame');
}
