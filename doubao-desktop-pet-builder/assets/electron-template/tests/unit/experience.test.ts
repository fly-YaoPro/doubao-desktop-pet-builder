import assert from 'node:assert/strict';
import test from 'node:test';
import specData from '../../pet-spec.json';
import type { PetSpec } from '../../src/shared/contracts';
import { assertRuntimeFailureReport, assertRuntimeReadyReport } from '../../src/shared/contracts';

const spec = specData as PetSpec;

test('every interaction is wired to a reachable multi-frame state', () => {
  const states = new Map(spec.states.map((state) => [state.id, state]));
  for (const interaction of spec.experience.interactions) {
    const state = states.get(interaction.stateId);
    assert.ok(state, `missing state ${interaction.stateId}`);
    assert.ok(state.frames.length >= 5, `${state.id} needs at least five animation frames`);
    assert.ok(state.triggers.includes(`interaction:${interaction.id}`), `${interaction.id} has no trigger`);
    assert.ok(interaction.emoji.trim(), `${interaction.id} has no menu emoji`);
  }
});

test('base experience has breathing and enough visible animation', () => {
  assert.equal(spec.motion.breathing.enabled, true);
  assert.ok(spec.states.filter((state) => state.frames.length >= 2).length >= 4);
  assert.ok(spec.states.some((state) => state.id === 'idle'));
});

test('asset pipeline uses adaptive border-connected flood fill', () => {
  assert.equal(spec.schemaVersion, 4);
  assert.equal(spec.assetPipeline.backgroundMode, 'adaptive-flood');
  assert.ok(['transparent-grid', 'solid-chroma'].includes(spec.assetPipeline.generationBackground));
  assert.ok(spec.assetPipeline.backgroundTolerance >= 12 && spec.assetPipeline.backgroundTolerance <= 48);
  assert.equal('backgroundKey' in spec.assetPipeline, false);
});

test('frame and size defaults meet the visible experience baseline', () => {
  const state = (id: string) => spec.states.find((item) => item.id === id)!;
  assert.ok(state('idle').frames.length >= 4);
  assert.equal(state('blink').frames.length, 5);
  assert.ok(spec.experience.interactions.every((item) => state(item.stateId).frames.length >= 5));
  assert.ok(spec.experience.petSizing.baseWindowPx >= 180 && spec.experience.petSizing.baseWindowPx <= 260);
  assert.equal(spec.experience.petSizing.defaultScale, 0.8);
});

test('runtime readiness rejects blank images and malformed failure reports', () => {
  assert.doesNotThrow(() => assertRuntimeReadyReport({ stateId: 'idle', frame: 'idle-01.png', assetCount: 8, naturalWidth: 512, naturalHeight: 512 }));
  assert.throws(() => assertRuntimeReadyReport({ stateId: 'idle', frame: 'idle-01.png', assetCount: 8, naturalWidth: 0, naturalHeight: 512 }));
  assert.doesNotThrow(() => assertRuntimeFailureReport({ stage: 'image-load', message: 'missing frame', frame: 'idle-01.png' }));
  assert.throws(() => assertRuntimeFailureReport({ stage: 'guessing', message: '' }));
});
