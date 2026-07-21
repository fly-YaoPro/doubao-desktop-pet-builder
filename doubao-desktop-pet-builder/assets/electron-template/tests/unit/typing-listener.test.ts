import assert from 'node:assert/strict';
import test from 'node:test';
import { TypingListener } from '../../src/main/typing-listener';

test('typing listener is off by default and needs no native dependency', () => {
  const listener = new TypingListener();
  assert.deepEqual(listener.start(false, () => undefined), { enabled: false, reason: 'disabled-by-user' });
  assert.doesNotThrow(() => listener.stop());
});
