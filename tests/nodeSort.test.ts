import assert from 'node:assert/strict';
import test from 'node:test';

import { delaySortWeight } from '../src/services/nodeSort.ts';

test('delaySortWeight orders: measured < untested < failed', () => {
  const ok = delaySortWeight(120);
  const untested = delaySortWeight(undefined);
  const failed = delaySortWeight(-1);

  assert.ok(ok < untested, 'measured delay should sort before untested');
  assert.ok(untested < failed, 'failed nodes should sort last');
  assert.ok(failed > ok, 'failed nodes should sort after measured');
});

test('delaySortWeight keeps failed and untested distinct', () => {
  // 回归：Infinity + 1 === Infinity 会让两者权重相同，此处必须严格区分
  assert.notEqual(delaySortWeight(undefined), delaySortWeight(-1));
});

test('delaySortWeight sorts measured delays ascending', () => {
  const weights = [300, 100, 200].map(delaySortWeight);
  assert.deepEqual([...weights].sort((a, b) => a - b), [100, 200, 300]);
});
