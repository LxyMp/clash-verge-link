import assert from 'node:assert/strict';
import test from 'node:test';

import { isOwnedProxyConfig, isSuccessfulResponse } from '../src/background/proxyState.ts';
import { runBatched } from '../src/services/runBatched.ts';

test('isSuccessfulResponse only accepts explicit success', () => {
  assert.equal(isSuccessfulResponse({ success: true }), true);
  assert.equal(isSuccessfulResponse({ success: false, error: 'denied' }), false);
  assert.equal(isSuccessfulResponse(undefined), false);
});

test('isOwnedProxyConfig verifies host and current port', () => {
  const ownedConfig = {
    proxyType: 'manual',
    http: 'http://127.0.0.1:7899',
    httpProxyAll: true,
    passthrough: 'localhost, 127.0.0.1, [::1], <local>',
  };
  assert.equal(
    isOwnedProxyConfig(ownedConfig, 7899, 'controlled_by_this_extension'),
    true,
  );
  assert.equal(
    isOwnedProxyConfig(
      { ...ownedConfig, http: '127.0.0.1:8888' },
      7899,
      'controlled_by_this_extension',
    ),
    false,
  );
  assert.equal(
    isOwnedProxyConfig(
      { ...ownedConfig, proxyType: 'system' },
      7899,
      'controlled_by_this_extension',
    ),
    false,
  );
  assert.equal(
    isOwnedProxyConfig(ownedConfig, 7899, 'controlled_by_other_extensions'),
    false,
  );
  assert.equal(
    isOwnedProxyConfig(
      { ...ownedConfig, passthrough: 'localhost' },
      7899,
      'controlled_by_this_extension',
    ),
    false,
  );
});

test('runBatched stops scheduling work after abort', async () => {
  const controller = new AbortController();
  const started: number[] = [];

  await runBatched([1, 2, 3, 4], 2, controller.signal, async (value) => {
    started.push(value);
    if (value === 1) controller.abort();
  });

  assert.deepEqual(started, [1, 2]);
});
