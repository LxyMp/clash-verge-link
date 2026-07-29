import { ref, computed } from 'vue';

const messages = ref<Record<string, string>>({});
let currentLang = '';

/** 加载 locale JSON，lang 为空时清除自定义，回退到 browser.i18n */
async function loadLocale(lang: string): Promise<void> {
  if (!lang) {
    messages.value = {};
    currentLang = '';
    return;
  }
  if (lang === currentLang) return;
  try {
    const url = browser.runtime.getURL(`_locales/${lang}/messages.json`);
    const res = await fetch(url);
    const data = await res.json();
    const map: Record<string, string> = {};
    for (const [k, v] of Object.entries(data)) {
      map[k] = (v as { message: string }).message;
    }
    messages.value = map;
    currentLang = lang;
  } catch {
    messages.value = {};
    currentLang = '';
  }
}

/** 获取当前语言 */
export function getCurrentLang(): string {
  return currentLang;
}
export { loadLocale };

/**
 * 本地化 composable — 运行时语言切换
 */
export function useI18n() {
  function t(key: string, subs?: Record<string, string | number>): string {
    let msg = messages.value[key];
    if (msg) {
      // 已加载自定义 locale，手动替换 $key$ 占位符
      if (subs) {
        for (const [k, v] of Object.entries(subs)) {
          const sv = v == null ? '' : String(v);
          msg = msg.replace(`$${k}$`, sv);
        }
      }
      return msg;
    }
    // 回退到 browser.i18n.getMessage，由 Firefox 按 placeholders 定义替换 $1/$2。
    try {
      if (subs) {
        // 按定义顺序传入 substitutions（$1, $2, ...）
        const arr = Object.values(subs).map((v) => (v == null ? '' : String(v)));
        const result = browser.i18n.getMessage(key, arr);
        if (result) return result;
      } else {
        const result = browser.i18n.getMessage(key);
        if (result) return result;
      }
    } catch {
      /* fallthrough */
    }
    return key;
  }
  return { t, currentLang: computed(() => currentLang) };
}
