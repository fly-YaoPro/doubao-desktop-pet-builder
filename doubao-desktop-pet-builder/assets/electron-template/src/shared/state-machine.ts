import type { PetStateSpec } from './contracts';

export class TimerRegistry {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

  set(name: string, callback: () => void, delayMs: number): void {
    this.clear(name);
    this.timers.set(name, setTimeout(() => {
      this.timers.delete(name);
      callback();
    }, delayMs));
  }

  clear(name: string): void {
    const timer = this.timers.get(name);
    if (timer) clearTimeout(timer);
    this.timers.delete(name);
  }

  clearAll(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }

  get size(): number { return this.timers.size; }
}

export class StateController {
  private readonly states: Map<string, PetStateSpec>;
  private readonly timers = new TimerRegistry();
  private readonly resumeStack: Array<{ id: string; remainingMs?: number }> = [];
  private cooldownUntil = new Map<string, number>();
  private currentDeadline?: number;
  currentId = 'idle';

  constructor(specs: PetStateSpec[], private readonly onChange: (state: PetStateSpec) => void) {
    this.states = new Map(specs.map((state) => [state.id, state]));
    if (!this.states.has('idle')) throw new Error('State machine requires idle');
  }

  request(id: string, durationMs?: number): boolean {
    const next = this.require(id);
    const now = Date.now();
    if ((this.cooldownUntil.get(id) ?? 0) > now) return false;
    const current = this.require(this.currentId);
    if (current.interrupt === 'block' && next.priority <= current.priority) return false;
    if (next.priority < current.priority) return false;

    if (id !== this.currentId) {
      const remainingMs = this.currentDeadline ? Math.max(0, this.currentDeadline - now) : undefined;
      this.resumeStack.push({ id: this.currentId, remainingMs });
    }
    this.currentId = id;
    this.cooldownUntil.set(id, now + next.cooldownMs);
    this.onChange(next);

    if (durationMs && durationMs > 0) {
      this.currentDeadline = now + durationMs;
      this.timers.set('temporary-state', () => this.finish(id), durationMs);
    } else {
      this.currentDeadline = undefined;
      this.timers.clear('temporary-state');
    }
    return true;
  }

  release(id: string): void {
    if (this.currentId === id) this.finish(id);
  }

  dispose(): void { this.timers.clearAll(); }
  get timerCount(): number { return this.timers.size; }

  private finish(id: string): void {
    if (this.currentId !== id) return;
    const completed = this.require(id);
    const resumable = completed.interrupt === 'resume' ? this.resumeStack.pop() : undefined;
    if (!resumable) this.resumeStack.length = 0;
    const target = resumable && this.states.has(resumable.id) ? resumable.id : 'idle';
    this.currentId = target;
    this.currentDeadline = resumable?.remainingMs ? Date.now() + resumable.remainingMs : undefined;
    this.onChange(this.require(target));
    if (resumable?.remainingMs && resumable.remainingMs > 0) {
      this.timers.set('temporary-state', () => this.finish(target), resumable.remainingMs);
    } else {
      this.timers.clear('temporary-state');
    }
  }

  private require(id: string): PetStateSpec {
    const state = this.states.get(id);
    if (!state) throw new Error(`Unknown pet state: ${id}`);
    return state;
  }
}
