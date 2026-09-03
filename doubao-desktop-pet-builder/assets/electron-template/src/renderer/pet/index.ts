import './index.css';
import specData from '../../../pet-spec.json';
import type { PetSpec, PetStateSpec, RuntimeFailureReport, StateActivity } from '../../shared/contracts';
import { exceedsDragThreshold } from '../../main/drag';
import { StateController, TimerRegistry } from '../../shared/state-machine';

const spec = specData as PetSpec;
function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing required element: ${selector}`);
  return element;
}

const pet = requiredElement<HTMLElement>('#pet');
const image = requiredElement<HTMLImageElement>('#pet-image');
const motionLayer = requiredElement<HTMLElement>('#motion-layer');
const bubble = requiredElement<HTMLElement>('#bubble');
const assetError = requiredElement<HTMLElement>('#asset-error');
const images = require.context('../../assets/pet', true, /\.png$/i);
const urls = new Map(images.keys().map((key) => [key.replace(/^\.\//, ''), images(key)]));
const timers = new TimerRegistry();
const triggerStates = new Map(spec.states.flatMap((state) => state.triggers.map((trigger) => [trigger, state] as const)));
let currentFrame = '';
let runtimeReadyReported = false;

function showFatalAssetError(report: RuntimeFailureReport): void {
  assetError.hidden = false;
  assetError.textContent = `素材加载失败：${report.frame ?? report.message}`;
  pet.dataset.runtime = 'failed';
  void window.petAPI.runtime.fail(report).catch((error) => console.error('runtime failure report rejected', error));
}

function setTheme(): void {
  const root = document.documentElement.style;
  const theme = spec.experience.theme;
  root.setProperty('--primary', theme.primary);
  root.setProperty('--surface', theme.surface);
  root.setProperty('--text', theme.text);
  root.setProperty('--radius', `${theme.cornerRadius}px`);
  root.setProperty('--breath-x', String(1 - spec.motion.breathing.scaleX));
  root.setProperty('--breath-y', String(1 + spec.motion.breathing.scaleY));
  root.setProperty('--breath-period', `${spec.motion.breathing.periodMs}ms`);
  root.setProperty('--squash-x', String(1 + spec.motion.squashStretch.intensity));
  root.setProperty('--squash-y', String(1 - spec.motion.squashStretch.intensity));
  root.setProperty('--squash-duration', `${spec.motion.squashStretch.durationMs}ms`);
  pet.dataset.breathing = spec.motion.breathing.enabled ? 'on' : 'off';
  pet.dataset.filePocket = spec.features.filePocket ? 'on' : 'off';
  pet.title = `拖动${spec.character.displayName}，右键互动`;
  image.alt = spec.character.displayName;
}

function showState(state: PetStateSpec): void {
  timers.clear('frames');
  let index = 0;
  const render = () => {
    const frame = state.frames[index];
    const url = frame ? urls.get(frame) : undefined;
    if (!frame || !url) {
      const message = `Missing bundled frame: ${frame ?? '<undefined>'}`;
      showFatalAssetError({ stage: 'asset-map', message, frame });
      throw new Error(message);
    }
    currentFrame = frame;
    image.src = url;
    image.dataset.frame = frame;
    image.dataset.state = state.id;
    pet.dataset.state = state.id;
    index += 1;
    if (index >= state.frames.length) {
      if (!state.loop) return;
      index = 0;
    }
    timers.set('frames', render, state.frameDurationMs);
  };
  render();
}

function defaultDuration(state: PetStateSpec): number {
  return Math.max(260, state.frames.length * state.frameDurationMs + 100);
}

function showBubble(text: string, durationMs = 1800): void {
  bubble.textContent = text;
  bubble.classList.add('show');
  timers.set('bubble', () => bubble.classList.remove('show'), durationMs);
}

function pop(): void {
  if (!spec.motion.squashStretch.enabled) return;
  motionLayer.classList.remove('pop');
  void motionLayer.offsetWidth;
  motionLayer.classList.add('pop');
  timers.set('pop', () => motionLayer.classList.remove('pop'), spec.motion.squashStretch.durationMs);
}

const controller = new StateController(spec.states, showState);
const initial = triggerStates.get('app:start') ?? spec.states.find((state) => state.id === 'idle') ?? spec.states[0]!;

image.addEventListener('load', () => {
  if (runtimeReadyReported || image.naturalWidth < 1 || image.naturalHeight < 1) return;
  runtimeReadyReported = true;
  pet.dataset.runtime = 'ready';
  void window.petAPI.runtime.ready({
    stateId: image.dataset.state ?? initial.id,
    frame: currentFrame,
    assetCount: urls.size,
    naturalWidth: image.naturalWidth,
    naturalHeight: image.naturalHeight,
  }).catch((error) => {
    runtimeReadyReported = false;
    showFatalAssetError({ stage: 'renderer', message: error instanceof Error ? error.message : String(error), frame: currentFrame });
  });
});
image.addEventListener('error', () => showFatalAssetError({ stage: 'image-load', message: `Image element failed to load ${currentFrame}`, frame: currentFrame }));
showState(initial);

function playTrigger(trigger: string, durationMs?: number, feedback?: string): boolean {
  const state = triggerStates.get(trigger);
  if (!state) return false;
  const accepted = controller.request(state.id, durationMs ?? (state.loop ? undefined : defaultDuration(state)));
  if (accepted && feedback) showBubble(feedback, durationMs);
  return accepted;
}

function playActivity(activity: StateActivity): void {
  const state = activity.stateId ? spec.states.find((item) => item.id === activity.stateId) : undefined;
  if (state) controller.request(state.id, activity.durationMs ?? (state.loop ? undefined : defaultDuration(state)));
  if (activity.feedback) showBubble(activity.feedback, activity.durationMs);
  if (activity.kind === 'interaction' || activity.kind === 'notify' || activity.kind === 'success') pop();
}

function scheduleBlink(): void {
  timers.set('blink', () => {
    playTrigger('ambient:blink');
    scheduleBlink();
  }, 3600 + Math.round(Math.random() * 3200));
}

function scheduleRandomIdle(): void {
  const range = spec.motion.idleIntervalMs.max - spec.motion.idleIntervalMs.min;
  timers.set('idle-random', () => {
    playTrigger('ambient:random');
    scheduleRandomIdle();
  }, spec.motion.idleIntervalMs.min + Math.round(Math.random() * range));
}

setTheme();
scheduleBlink();
scheduleRandomIdle();

let pointerStart: { x: number; y: number } | undefined;
let dragging = false;

pet.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  pointerStart = { x: event.clientX, y: event.clientY };
  dragging = false;
  pet.setPointerCapture(event.pointerId);
  void window.petAPI.window.beginDrag();
});

pet.addEventListener('pointermove', (event) => {
  if (!pointerStart || !pet.hasPointerCapture(event.pointerId)) return;
  if (!dragging && exceedsDragThreshold(pointerStart, { x: event.clientX, y: event.clientY })) {
    dragging = true;
    pet.classList.add('dragging');
    playTrigger('window:drag');
  }
  if (dragging) void window.petAPI.window.updateDrag();
});

async function finishPointer(event: PointerEvent): Promise<void> {
  if (!pointerStart) return;
  if (pet.hasPointerCapture(event.pointerId)) pet.releasePointerCapture(event.pointerId);
  await window.petAPI.window.endDrag();
  pet.classList.remove('dragging');
  if (dragging) {
    const dragState = triggerStates.get('window:drag');
    if (dragState) controller.release(dragState.id);
  } else {
    playTrigger('pointer:tap');
    pop();
  }
  pointerStart = undefined;
  dragging = false;
}

pet.addEventListener('pointerup', (event) => void finishPointer(event));
pet.addEventListener('pointercancel', (event) => void finishPointer(event));
pet.addEventListener('contextmenu', (event) => { event.preventDefault(); void window.petAPI.window.showContextMenu(); });

if (spec.features.filePocket) {
  pet.addEventListener('dragover', (event) => { event.preventDefault(); pet.classList.add('drop-ready'); playTrigger('file:drop'); });
  pet.addEventListener('dragleave', () => pet.classList.remove('drop-ready'));
  pet.addEventListener('drop', async (event) => {
    event.preventDefault();
    pet.classList.remove('drop-ready');
    const paths = [...event.dataTransfer!.files].map((file) => window.petAPI.files.getPathForFile(file)).filter(Boolean);
    try {
      const result = await window.petAPI.files.put(paths);
      playTrigger(result.failed.length ? 'file:drop-fail' : 'file:drop-success');
      showBubble(result.failed.length ? '有文件没有放进去' : '我替你收好啦');
      pop();
    } catch {
      playTrigger('file:drop-fail');
      showBubble('这次没有收好，再试一次吧');
    }
  });
}

const unsubscribeActivity = window.petAPI.events.onStateActivity(playActivity);
window.addEventListener('beforeunload', () => {
  unsubscribeActivity();
  controller.dispose();
  timers.clearAll();
});
