import assert from 'node:assert/strict';
import test from 'node:test';
import type { PetStateSpec } from '../../src/shared/contracts';
import { StateController, TimerRegistry } from '../../src/shared/state-machine';

const state = (id: string, priority: number, interrupt: PetStateSpec['interrupt'] = 'resume'): PetStateSpec => ({
  id, triggers: [`test:${id}`], frames: [`${id}.png`], frameDurationMs: 100, loop: true, priority, interrupt, cooldownMs: 0, direction: 'neutral', anchor: { x: 0.5, y: 0.95 }, mirrorSafe: true,
});

test('higher priority preempts and release resumes previous state', () => {
  const changes: string[] = [];
  const controller = new StateController([state('idle', 10), state('typing', 30), state('grab', 100)], (next) => changes.push(next.id));
  assert.equal(controller.request('typing'), true);
  assert.equal(controller.request('idle'), false);
  assert.equal(controller.request('grab'), true);
  controller.release('grab');
  assert.equal(controller.currentId, 'typing');
  assert.deepEqual(changes, ['typing', 'grab', 'typing']);
  controller.dispose();
});

test('timer registry replaces named timers and cleans up', () => {
  const timers = new TimerRegistry();
  timers.set('one', () => undefined, 10_000);
  timers.set('one', () => undefined, 10_000);
  assert.equal(timers.size, 1);
  timers.clearAll();
  assert.equal(timers.size, 0);
});

test('temporary preemption resumes the remaining activity then returns idle', async () => {
  const controller = new StateController([state('idle', 10), state('typing', 30), state('happy', 55)], () => undefined);
  controller.request('typing', 80);
  await new Promise((resolve) => setTimeout(resolve, 15));
  controller.request('happy', 20);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(controller.currentId, 'typing');
  await new Promise((resolve) => setTimeout(resolve, 75));
  assert.equal(controller.currentId, 'idle');
  controller.dispose();
});
