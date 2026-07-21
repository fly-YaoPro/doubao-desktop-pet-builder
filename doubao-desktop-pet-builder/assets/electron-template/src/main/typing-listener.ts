import type { TypingStatus } from '../shared/contracts';

type Hook = { on(event: 'keydown', listener: () => void): void; start(): void; stop(): void };

export class TypingListener {
  private hook?: Hook;

  start(enabled: boolean, pulse: () => void): TypingStatus {
    if (!enabled) return { enabled: false, reason: 'disabled-by-user' };
    if (!['win32', 'darwin'].includes(process.platform)) return { enabled: false, reason: 'unsupported-platform' };
    try {
      const nativeRequire = typeof __non_webpack_require__ === 'function' ? __non_webpack_require__ : require;
      const loaded = nativeRequire('uiohook-napi') as { uIOhook?: Hook } & Hook;
      this.hook = loaded.uIOhook ?? loaded;
      this.hook.on('keydown', () => pulse());
      this.hook.start();
      return { enabled: true, reason: 'active-no-key-content-recorded' };
    } catch (error) {
      this.hook = undefined;
      return { enabled: false, reason: `unavailable:${error instanceof Error ? error.message : String(error)}` };
    }
  }

  stop(): void {
    try { this.hook?.stop(); } finally { this.hook = undefined; }
  }
}
