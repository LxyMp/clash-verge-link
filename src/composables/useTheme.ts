import { watchEffect, type Ref } from 'vue';

const THEME_QUERY = '(prefers-color-scheme: dark)';

/**
 * 主题应用 composable。
 *
 * 将主题写入 <html data-theme>：
 * - 'dark' / 'light' 直接使用；
 * - 'system' 解析当前系统深浅色偏好，并监听系统偏好变化实时切换。
 *
 * theme ref 变化（如设置页保存后）时也会重新应用。
 * 返回取消监听与停止 effect 的函数，组件卸载时调用。
 */
export function useTheme(theme: Ref<string>): () => void {
  const mql = window.matchMedia(THEME_QUERY);
  const apply = (): void => {
    const resolved = theme.value === 'system' ? (mql.matches ? 'dark' : 'light') : theme.value;
    document.documentElement.setAttribute('data-theme', resolved);
  };
  const stopEffect = watchEffect(apply);
  mql.addEventListener('change', apply);
  return () => {
    stopEffect();
    mql.removeEventListener('change', apply);
  };
}
