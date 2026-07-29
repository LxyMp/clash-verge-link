import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeSettings,
  resolveLocaleDirectory,
  validateSettingsInput,
} from '../src/services/settingsRules.ts';
import type { PluginSettings } from '../src/types/index.ts';

test('normalizeSettings clamps unsafe numeric values', () => {
  const legacySettings = {
    testConcurrency: 0,
    testTimeout: 10,
    showLogs: true,
    logPollInterval: 1,
    logLimit: 999,
  } as Partial<PluginSettings>;
  const settings = normalizeSettings(legacySettings);

  assert.equal(settings.testConcurrency, 1);
  assert.equal(settings.testTimeout, 1000);
  assert.equal('showLogs' in settings, false);
  assert.equal('logPollInterval' in settings, false);
  assert.equal('logLimit' in settings, false);
});

test('validateSettingsInput rejects non-local API hosts', () => {
  assert.equal(
    validateSettingsInput({
      apiProtocol: 'http',
      apiHost: '192.168.1.10',
      apiPort: 9097,
      apiSecret: 'secret',
      mixedPort: 7899,
      testConcurrency: 5,
      testUrl: 'https://www.gstatic.com/generate_204',
      testTimeout: 5000,
    }),
    'apiHostLocal',
  );
});

test('validateSettingsInput allows an empty API secret', () => {
  assert.equal(
    validateSettingsInput({
      apiProtocol: 'http',
      apiHost: '127.0.0.1',
      apiPort: 9097,
      apiSecret: '',
      mixedPort: 7899,
      testConcurrency: 5,
      testUrl: 'https://www.gstatic.com/generate_204',
      testTimeout: 5000,
    }),
    null,
  );
});

test('resolveLocaleDirectory maps stored language codes and automatic mode', () => {
  assert.equal(resolveLocaleDirectory('zh-CN', 'en-US'), 'zh_CN');
  assert.equal(resolveLocaleDirectory('en', 'zh-CN'), 'en');
  assert.equal(resolveLocaleDirectory('', 'zh-CN'), 'zh_CN');
});
