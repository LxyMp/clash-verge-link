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

  // 滑动窗口下 abort 同步发生在第二个工作槽拉取之前，因此只有第 1 项被调度
  assert.deepEqual(started, [1]);
});

test('runBatched bounds concurrency and processes every item', async () => {
  const controller = new AbortController();
  const started: number[] = [];
  let inFlight = 0;
  let maxInFlight = 0;

  await runBatched([1, 2, 3, 4, 5, 6], 3, controller.signal, async (value) => {
    started.push(value);
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 5));
    inFlight -= 1;
  });

  assert.deepEqual(started, [1, 2, 3, 4, 5, 6]);
  assert.ok(maxInFlight <= 3, `max in-flight ${maxInFlight} exceeded concurrency 3`);
});

test('runBatched handles empty items and aborted signal', async () => {
  const started: number[] = [];
  const aborted = new AbortController();
  aborted.abort();

  await runBatched([], 3, aborted.signal, async (value) => {
    started.push(value);
  });
  assert.deepEqual(started, []);

  await runBatched([1, 2], 2, aborted.signal, async (value) => {
    started.push(value);
  });
  assert.deepEqual(started, []);
});

test('isOwnedProxyConfig rejects wrong ports, hosts, and malformed endpoints', () => {
  const base = {
    proxyType: 'manual',
    http: 'http://127.0.0.1:7899',
    httpProxyAll: true,
    passthrough: 'localhost, 127.0.0.1, [::1], <local>',
  };
  const controlled = 'controlled_by_this_extension' as const;
  assert.equal(isOwnedProxyConfig({ ...base, http: 'http://127.0.0.1:0' }, 7899, controlled), false);
  assert.equal(isOwnedProxyConfig({ ...base, http: 'http://127.0.0.1' }, 7899, controlled), false);
  assert.equal(
    isOwnedProxyConfig({ ...base, http: 'http://localhost:7899' }, 7899, controlled),
    false,
  );
  assert.equal(isOwnedProxyConfig({ ...base, http: 'not a url' }, 7899, controlled), false);
  assert.equal(isOwnedProxyConfig({ ...base, http: undefined }, 7899, controlled), false);
});

test('isOwnedProxyConfig matches passthrough as a set', () => {
  const base = { proxyType: 'manual', http: 'http://127.0.0.1:7899', httpProxyAll: true };
  const controlled = 'controlled_by_this_extension' as const;
  assert.equal(
    isOwnedProxyConfig(
      { ...base, passthrough: '<local>, [::1], 127.0.0.1, localhost' },
      7899,
      controlled,
    ),
    true,
  );
  assert.equal(isOwnedProxyConfig({ ...base, passthrough: undefined }, 7899, controlled), false);
});

test('isOwnedProxyConfig requires this-extension control', () => {
  const ownedConfig = {
    proxyType: 'manual',
    http: 'http://127.0.0.1:7899',
    httpProxyAll: true,
    passthrough: 'localhost, 127.0.0.1, [::1], <local>',
  };
  assert.equal(isOwnedProxyConfig(ownedConfig, 7899, undefined), false);
});
