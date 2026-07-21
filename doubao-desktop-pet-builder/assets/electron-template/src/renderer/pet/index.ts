import './index.css';
import specData from '../../../pet-spec.json';
import type { PetSpec, PetStateSpec } from '../../shared/contracts';
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

const images = require.context('../../assets/pet', false, /\.png$/i);
const urls = new Map(images.keys().map((key) => [key.replace(/^\.\//, ''), images(key)]));
const timers = new TimerRegistry();

function showState(state: PetStateSpec): void {
  timers.clear('frames');
  let index = 0;
  const render = () => {
    const frame = state.frames[index];
    const url = frame ? urls.get(frame) : undefined;
    if (!url) throw new Error(`Missing bundled frame: ${frame ?? '<undefined>'}`);
    image.src = url;
    image.dataset.state = state.id;
    index += 1;
    if (index >= state.frames.length) {
      if (!state.loop) return;
      index = 0;
    }
    timers.set('frames', render, state.frameDurationMs);
  };
  render();
}

const controller = new StateController(spec.states, showState);
showState(spec.states.find((state) => state.id === 'idle') ?? spec.states[0]!);

function scheduleBlink(): void {
  timers.set('blink', () => {
    controller.request('blink', 260);
    scheduleBlink();
  }, 3500 + Math.round(Math.random() * 3500));
}
scheduleBlink();

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
    controller.request('grab');
  }
  if (dragging) void window.petAPI.window.updateDrag();
});

async function finishPointer(event: PointerEvent): Promise<void> {
  if (!pointerStart) return;
  if (pet.hasPointerCapture(event.pointerId)) pet.releasePointerCapture(event.pointerId);
  await window.petAPI.window.endDrag();
  pet.classList.remove('dragging');
  if (dragging) controller.release('grab');
  else controller.request('happy', 900);
  pointerStart = undefined;
  dragging = false;
}
pet.addEventListener('pointerup', (event) => void finishPointer(event));
pet.addEventListener('pointercancel', (event) => void finishPointer(event));
pet.addEventListener('contextmenu', (event) => { event.preventDefault(); void window.petAPI.window.showDashboard(); });

pet.addEventListener('dragover', (event) => { event.preventDefault(); pet.classList.add('drop-ready'); });
pet.addEventListener('dragleave', () => pet.classList.remove('drop-ready'));
pet.addEventListener('drop', async (event) => {
  event.preventDefault();
  pet.classList.remove('drop-ready');
  controller.request('grab');
  const paths = [...event.dataTransfer!.files].map((file) => window.petAPI.files.getPathForFile(file)).filter(Boolean);
  try {
    const result = await window.petAPI.files.put(paths);
    controller.release('grab');
    controller.request(result.failed.length ? 'fail' : 'success', 1200);
  } catch {
    controller.release('grab');
    controller.request('fail', 1200);
  }
});

const unsubscribeActivity = window.petAPI.events.onStateActivity(({ kind }) => {
  if (kind === 'typing') controller.request('typing', 500);
  if (kind === 'notify') controller.request('notify', 1400);
});
window.addEventListener('beforeunload', () => { unsubscribeActivity(); controller.dispose(); timers.clearAll(); });
