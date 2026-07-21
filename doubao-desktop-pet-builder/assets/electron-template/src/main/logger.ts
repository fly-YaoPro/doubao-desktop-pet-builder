import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

export class JsonLogger {
  constructor(private readonly file: string) {}

  async write(level: 'info' | 'warn' | 'error', event: string, details: Record<string, unknown> = {}): Promise<void> {
    await mkdir(path.dirname(this.file), { recursive: true });
    const line = JSON.stringify({ timestamp: new Date().toISOString(), level, event, ...details });
    await appendFile(this.file, `${line}\n`, 'utf8');
  }
}
