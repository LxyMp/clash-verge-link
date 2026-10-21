import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildChromeProxyConfig,
  buildFirefoxProxyConfig,
  compileBypassRules,
  isOwnedChromeProxyConfig,
  isOwnedFirefoxProxyConfig,
  isSuccessfulResponse,
  shouldBypassUrl,
  wrapChromeBypassRule,
} from '../src/background/proxyState.ts';
import { runBatched } from '../src/services/runBatched.ts';

test('isSuccessfulResponse only accepts explicit success', () => {
  assert.equal(isSuccessfulResponse({ success: true }), true);
  assert.equal(isSuccessfulResponse({ success: false, error: 'denied' }), false);
  assert.equal(isSuccessfulResponse(undefined), false);
});

test('isOwnedFirefoxProxyConfig verifies host and current port', () => {
  const ownedConfig = {
    proxyType: 'manual',
    http: 'http://127.0.0.1:7899',
    httpProxyAll: true,
    passthrough: 'localhost, 127.0.0.1, [::1], <local>',
  };
  assert.equal(
    isOwnedFirefoxProxyConfig(ownedConfig, 7899, 'controlled_by_this_extension'),
    true,
  );
  assert.equal(
    isOwnedFirefoxProxyConfig(
      { ...ownedConfig, http: '127.0.0.1:8888' },
      7899,
      'controlled_by_this_extension',
    ),
    false,
  );
  assert.equal(
    isOwnedFirefoxProxyConfig(
      { ...ownedConfig, proxyType: 'system' },
      7899,
      'controlled_by_this_extension',
    ),
    false,
  );
  assert.equal(
    isOwnedFirefoxProxyConfig(ownedConfig, 7899, 'controlled_by_other_extensions'),
    false,
  );
  assert.equal(
    isOwnedFirefoxProxyConfig(
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

test('isOwnedFirefoxProxyConfig rejects wrong ports, hosts, and malformed endpoints', () => {
  const base = {
    proxyType: 'manual',
    http: 'http://127.0.0.1:7899',
    httpProxyAll: true,
    passthrough: 'localhost, 127.0.0.1, [::1], <local>',
  };
  const controlled = 'controlled_by_this_extension' as const;
  assert.equal(isOwnedFirefoxProxyConfig({ ...base, http: 'http://127.0.0.1:0' }, 7899, controlled), false);
  assert.equal(isOwnedFirefoxProxyConfig({ ...base, http: 'http://127.0.0.1' }, 7899, controlled), false);
  assert.equal(
    isOwnedFirefoxProxyConfig({ ...base, http: 'http://localhost:7899' }, 7899, controlled),
    false,
  );
  assert.equal(isOwnedFirefoxProxyConfig({ ...base, http: 'not a url' }, 7899, controlled), false);
  assert.equal(isOwnedFirefoxProxyConfig({ ...base, http: undefined }, 7899, controlled), false);
});

test('isOwnedFirefoxProxyConfig matches passthrough as a set', () => {
  const base = { proxyType: 'manual', http: 'http://127.0.0.1:7899', httpProxyAll: true };
  const controlled = 'controlled_by_this_extension' as const;
  assert.equal(
    isOwnedFirefoxProxyConfig(
      { ...base, passthrough: '<local>, [::1], 127.0.0.1, localhost' },
      7899,
      controlled,
    ),
    true,
  );
  assert.equal(isOwnedFirefoxProxyConfig({ ...base, passthrough: undefined }, 7899, controlled), false);
});

test('isOwnedFirefoxProxyConfig requires this-extension control', () => {
  const ownedConfig = {
    proxyType: 'manual',
    http: 'http://127.0.0.1:7899',
    httpProxyAll: true,
    passthrough: 'localhost, 127.0.0.1, [::1], <local>',
  };
  assert.equal(isOwnedFirefoxProxyConfig(ownedConfig, 7899, undefined), false);
});

test('built proxy configs are recognized as owned on both platforms', () => {
  const controlled = 'controlled_by_this_extension' as const;
  const firefoxConfig = buildFirefoxProxyConfig('127.0.0.1', 7899);
  assert.equal(isOwnedFirefoxProxyConfig(firefoxConfig, 7899, controlled), true);
  assert.equal(isOwnedFirefoxProxyConfig(firefoxConfig, 7897, controlled), false);

  const chromeConfig = buildChromeProxyConfig('127.0.0.1', 7899);
  assert.equal(isOwnedChromeProxyConfig(chromeConfig, 7899, controlled), true);
  assert.equal(isOwnedChromeProxyConfig(chromeConfig, 7897, controlled), false);
});

test('isOwnedChromeProxyConfig verifies mode, endpoint and bypass list', () => {
  const controlled = 'controlled_by_this_extension' as const;
  const base = buildChromeProxyConfig('127.0.0.1', 7899);

  assert.equal(isOwnedChromeProxyConfig({ ...base, mode: 'system' }, 7899, controlled), false);
  assert.equal(
    isOwnedChromeProxyConfig(
      { ...base, rules: { singleProxy: { scheme: 'http', host: 'localhost', port: 7899 } } },
      7899,
      controlled,
    ),
    false,
  );
  assert.equal(
    isOwnedChromeProxyConfig(
      { ...base, rules: { ...base.rules, bypassList: ['localhost'] } },
      7899,
      controlled,
    ),
    false,
  );
  assert.equal(
    isOwnedChromeProxyConfig(
      { ...base, rules: { ...base.rules, bypassList: undefined } },
      7899,
      controlled,
    ),
    false,
  );
  assert.equal(isOwnedChromeProxyConfig(base, 7899, 'controlled_by_other_extensions'), false);
  assert.equal(isOwnedChromeProxyConfig(base, 7899, undefined), false);
});

test('chrome config embeds bypass rules as slash-wrapped regex entries', () => {
  const rules = ['example\\.com', '^https://internal\\.'];
  const config = buildChromeProxyConfig('127.0.0.1', 7899, rules);
  const bypass = config.rules?.bypassList ?? [];
  assert.equal(bypass.length, 4 + rules.length);
  assert.deepEqual(bypass.slice(0, 4), ['localhost', '127.0.0.1', '[::1]', '<local>']);
  assert.deepEqual(bypass.slice(4), ['/.*(?:example\\.com).*/', '/.*(?:^https://internal\\.).*/']);

  // 带规则的配置仍被识别为本扩展写入
  assert.equal(isOwnedChromeProxyConfig(config, 7899, 'controlled_by_this_extension'), true);
  // 非本扩展写入的普通条目（如手写通配符）不认定为归属配置
  assert.equal(
    isOwnedChromeProxyConfig(
      {
        ...config,
        rules: {
          ...config.rules,
          bypassList: [...(config.rules?.bypassList ?? []), '*.foo.com'],
        },
      },
      7899,
      'controlled_by_this_extension',
    ),
    false,
  );
});

test('wrapChromeBypassRule keeps substring semantics', () => {
  assert.equal(wrapChromeBypassRule('example\\.com'), '/.*(?:example\\.com).*/');
  // 包装后的条目自身是合法正则，且能匹配包含目标子串的 URL
  const wrapped = new RegExp(wrapChromeBypassRule('example\\.com').slice(1, -1));
  assert.equal(wrapped.test('https://www.example.com/path'), true);
  assert.equal(wrapped.test('https://other.org/path'), false);
});

test('compileBypassRules skips invalid rules', () => {
  const compiled = compileBypassRules(['a\\.b', '[invalid', 'c']);
  assert.equal(compiled.length, 2);
});

test('shouldBypassUrl directs local and dotless hosts, then applies rules', () => {
  const rules = compileBypassRules(['example\\.com', '\\.cn$']);
  assert.equal(shouldBypassUrl('http://localhost:9097/version', rules), true);
  assert.equal(shouldBypassUrl('http://127.0.0.1:7899', rules), true);
  assert.equal(shouldBypassUrl('http://[::1]:8080/x', rules), true);
  assert.equal(shouldBypassUrl('http://intranet/share', rules), true);
  assert.equal(shouldBypassUrl('https://www.example.com/a', rules), true);
  assert.equal(shouldBypassUrl('https://news.cn', rules), true);
  assert.equal(shouldBypassUrl('https://www.google.com/search', rules), false);
});
