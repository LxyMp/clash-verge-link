import type { PluginSettings } from '../types';
import { normalizeSettings } from './settingsRules';

/** 存储 key（顶层命名空间） */
const STORE_KEY = 'settings';

/**
 * 读取用户持久化设置
 * 若存储为空，返回默认值
 */
export async function getSettings(): Promise<PluginSettings> {
  const raw = await browser.storage.local.get(STORE_KEY);
  const stored = raw[STORE_KEY] as Partial<PluginSettings> | undefined;
  return normalizeSettings(stored);
}

/**
 * 部分更新设置（浅合并）
 */
export async function saveSettings(patch: Partial<PluginSettings>): Promise<void> {
  const current = await getSettings();
  const merged = normalizeSettings({ ...current, ...patch });
  await browser.storage.local.set({ [STORE_KEY]: merged });
}

/**
 * 监听存储变更（多上下文同步）
 * 可用于 Background ↔ Popup 实时同步
 */
export function onSettingsChanged(cb: (settings: PluginSettings) => void): () => void {
  const listener = (changes: Record<string, browser.storage.StorageChange>, areaName: string) => {
    if (areaName !== 'local') return;
    const change = changes[STORE_KEY];
    if (change?.newValue) {
      cb(change.newValue as PluginSettings);
    }
  };
  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
}
