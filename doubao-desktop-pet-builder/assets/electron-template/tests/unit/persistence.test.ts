import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { atomicWriteJson, readJson, uniqueDestination } from '../../src/main/persistence';

test('settings use atomic JSON persistence', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'pet-persistence-'));
  try {
    const file = path.join(directory, 'settings.json');
    await atomicWriteJson(file, { edgeSnap: true });
    await atomicWriteJson(file, { edgeSnap: false });
    assert.deepEqual(await readJson(file, {}), { edgeSnap: false });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('duplicate files receive a numeric suffix', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'pet-pocket-'));
  try {
    await writeFile(path.join(directory, 'note.txt'), 'one');
    assert.equal(path.basename(await uniqueDestination(directory, 'note.txt')), 'note (1).txt');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
