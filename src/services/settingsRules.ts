import type { PluginSettings } from '../types';
import { parseBypassRule } from './bypassRules';

export type ApiProtocol = 'http' | 'https';
export type SettingsValidationError =
  | 'apiHostEmpty'
  | 'apiHostLocal'
  | 'apiPortRange'
  | 'mixedPortRange'
  | 'testConcurrencyRange'
  | 'testUrlInvalid'
  | 'testTimeoutRange'
  | 'bypassRuleInvalid';

export interface SettingsInput {
  apiProtocol: ApiProtocol;
  apiHost: string;
  apiPort: number;
  apiSecret: string;
  mixedPort: number;
  testConcurrency: number;
  testUrl: string;
  testTimeout: number;
  bypassRules?: string[];
}

export const DEFAULT_SETTINGS: PluginSettings = {
  apiBaseUrl: 'http://127.0.0.1:9097',
  apiSecret: '',
  proxyEnabled: false,
  mixedPort: 7899,
  testConcurrency: 5,
  testUrl: 'http://www.gstatic.com/generate_204',
  testTimeout: 5000,
  language: '',
  theme: 'system',
  bypassRules: [],
};

/** 直连规则归一化：仅保留非空字符串，去重，保持原顺序 */
export function normalizeBypassRules(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const rule = item.trim();
    if (!rule || seen.has(rule)) continue;
    seen.add(rule);
  }
  return [...seen];
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

export function normalizeSettings(stored: Partial<PluginSettings> = {}): PluginSettings {
  const settings = { ...DEFAULT_SETTINGS, ...stored };
  return {
    apiBaseUrl:
      typeof settings.apiBaseUrl === 'string' ? settings.apiBaseUrl : DEFAULT_SETTINGS.apiBaseUrl,
    apiSecret:
      typeof settings.apiSecret === 'string' ? settings.apiSecret : DEFAULT_SETTINGS.apiSecret,
    proxyEnabled: settings.proxyEnabled === true,
    mixedPort: clampNumber(settings.mixedPort, 1, 65535, DEFAULT_SETTINGS.mixedPort),
    testConcurrency: clampNumber(
      settings.testConcurrency,
      1,
      20,
      DEFAULT_SETTINGS.testConcurrency,
    ),
    testUrl: typeof settings.testUrl === 'string' ? settings.testUrl : DEFAULT_SETTINGS.testUrl,
    testTimeout: clampNumber(settings.testTimeout, 1000, 30000, DEFAULT_SETTINGS.testTimeout),
    language: settings.language === 'en' || settings.language === 'zh-CN' ? settings.language : '',
    theme:
      settings.theme === 'light' || settings.theme === 'dark' || settings.theme === 'system'
        ? settings.theme
        : 'system',
    bypassRules: normalizeBypassRules(settings.bypassRules),
  };
}

export function resolveLocaleDirectory(language: string, browserLanguage: string): 'zh_CN' | 'en' {
  const resolved = language || browserLanguage;
  return resolved.toLowerCase().startsWith('zh') ? 'zh_CN' : 'en';
}

export function isLocalApiHost(host: string): boolean {
  return host.trim().toLowerCase() === 'localhost' || host.trim() === '127.0.0.1';
}

function isPort(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 65535;
}

export function validateSettingsInput(input: SettingsInput): SettingsValidationError | null {
  if (!input.apiHost.trim()) return 'apiHostEmpty';
  if (!isLocalApiHost(input.apiHost)) return 'apiHostLocal';
  if (!isPort(input.apiPort)) return 'apiPortRange';
  if (!isPort(input.mixedPort)) return 'mixedPortRange';
  if (
    !Number.isInteger(input.testConcurrency) ||
    input.testConcurrency < 1 ||
    input.testConcurrency > 20
  )
    return 'testConcurrencyRange';
  try {
    const url = new URL(input.testUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'testUrlInvalid';
  } catch {
    return 'testUrlInvalid';
  }
  if (!Number.isInteger(input.testTimeout) || input.testTimeout < 1000 || input.testTimeout > 30000)
    return 'testTimeoutRange';
  for (const rule of input.bypassRules ?? []) {
    if (parseBypassRule(rule) === null) return 'bypassRuleInvalid';
  }
  return null;
}
