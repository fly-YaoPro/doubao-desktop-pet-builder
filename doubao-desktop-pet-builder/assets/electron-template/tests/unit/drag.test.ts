import assert from 'node:assert/strict';
import test from 'node:test';
import { draggedBounds, exceedsDragThreshold, snapBounds } from '../../src/main/drag';

test('click and drag are separated by a DIP threshold', () => {
  assert.equal(exceedsDragThreshold({ x: 10, y: 10 }, { x: 13, y: 13 }), false);
  assert.equal(exceedsDragThreshold({ x: 10, y: 10 }, { x: 17, y: 10 }), true);
});

test('drag uses absolute cursor delta and snaps inside the current display', () => {
  assert.deepEqual(draggedBounds({ x: 100, y: 100, width: 200, height: 200 }, { x: 150, y: 150 }, { x: 170, y: 180 }), { x: 120, y: 130, width: 200, height: 200 });
  assert.deepEqual(snapBounds({ x: 780, y: 300, width: 200, height: 200 }, { x: 0, y: 0, width: 1000, height: 700 }), { x: 800, y: 300, width: 200, height: 200 });
});
