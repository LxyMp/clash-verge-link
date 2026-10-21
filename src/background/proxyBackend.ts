import { isChromium } from '../compat/platform';
import {
  buildChromeProxyConfig,
  buildFirefoxProxyConfig,
  compileBypassRules,
  isOwnedChromeProxyConfig,
  isOwnedFirefoxProxyConfig,
  shouldBypassUrl,
  type ChromeProxyValue,
  type FirefoxProxyValue,
} from './proxyState';

export type ProxyTarget = 'firefox' | 'chrome';

export interface ProxyBackend {
  readonly target: ProxyTarget;
  setProxy(host: string, port: number, bypassRules: string[]): Promise<void>;
  clearProxy(): Promise<void>;
  /** 当前浏览器代理是否由本扩展写入且仍指向 port（归属固定校验 127.0.0.1） */
  isProxyOwned(port: number): Promise<boolean>;
}

/** chrome.proxy 的最小结构类型（未引入 @types/chrome，按需声明） */
interface ChromeApi {
  readonly runtime: { readonly lastError?: { message?: string } };
  readonly proxy: {
    readonly settings: {
      set(details: { value: ChromeProxyValue; scope: 'regular' }, callback: () => void): void;
      clear(details: { scope: 'regular' }, callback: () => void): void;
      get(
        details: Record<string, never>,
        callback: (result: { value: ChromeProxyValue; levelOfControl?: string }) => void,
      ): void;
    };
    readonly onProxyError?: { addListener(callback: (error: Error) => void): void };
  };
}

/** browser.proxy.onRequest 的最小结构类型（类型库未建模监听器返回值） */
type FirefoxProxyResult = { type: 'direct' } | { type: 'http'; host: string; port: number };
type FirefoxBypassListener = (details: { url: string }) => FirefoxProxyResult;
interface FirefoxOnRequestApi {
  addListener(callback: FirefoxBypassListener, filter: { urls: string[] }): void;
  removeListener(callback: FirefoxBypassListener): void;
}

const chromeApi = (globalThis as { chrome?: ChromeApi }).chrome;

/** chrome.proxy.settings 是回调风格 API；统一包装为 Promise 并透出 lastError */
function callChrome<T>(invoke: (callback: (result: T) => void) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    invoke((result) => {
      const error = chromeApi?.runtime.lastError;
      if (error) reject(new Error(error.message ?? 'Chrome proxy API failed'));
      else resolve(result);
    });
  });
}

// ---------- Firefox ----------

let bypassListener: FirefoxBypassListener | null = null;

function firefoxOnRequest(): FirefoxOnRequestApi {
  return (browser.proxy as unknown as { onRequest: FirefoxOnRequestApi }).onRequest;
}

function unregisterBypassListener(): void {
  if (bypassListener) {
    firefoxOnRequest().removeListener(bypassListener);
    bypassListener = null;
  }
}

/**
 * Firefox 无 bypassList 正则能力，改用 proxy.onRequest 逐请求拦截：
 * 命中规则的 URL 返回 direct，其余显式返回代理。
 * proxy.settings 仍然同步写入，状态判断与端口变更逻辑保持不变。
 */
function registerBypassListener(host: string, port: number, rules: string[]): void {
  unregisterBypassListener();
  const regexes = compileBypassRules(rules);
  if (regexes.length === 0) return;

  const listener: FirefoxBypassListener = (details) => {
    if (shouldBypassUrl(details.url, regexes)) return { type: 'direct' };
    return { type: 'http', host, port };
  };
  firefoxOnRequest().addListener(listener, { urls: ['<all_urls>'] });
  bypassListener = listener;
}

function setProxyFirefox(host: string, port: number, bypassRules: string[]): Promise<void> {
  const config = buildFirefoxProxyConfig(host, port);
  return browser.proxy.settings
    .set({
      value: config as browser.proxy.ProxyConfig,
      scope: 'regular',
    })
    .then(() => registerBypassListener(host, port, bypassRules));
}

function clearProxyFirefox(): Promise<void> {
  unregisterBypassListener();
  return browser.proxy.settings.clear({ scope: 'regular' });
}

function isProxyOwnedFirefox(port: number): Promise<boolean> {
  return browser.proxy.settings.get({}).then((result) =>
    isOwnedFirefoxProxyConfig(result.value as FirefoxProxyValue, port, result.levelOfControl),
  );
}

// ---------- Backend ----------

export function createProxyBackend(): ProxyBackend {
  if (isChromium) {
    chromeApi?.proxy.onProxyError?.addListener((error) => {
      console.error('[ClashVergeLink] chrome proxy error:', error.message);
    });
    return {
      target: 'chrome',
      setProxy: (host, port, bypassRules) =>
        callChrome<void>((callback) =>
          chromeApi!.proxy.settings.set(
            { value: buildChromeProxyConfig(host, port, bypassRules), scope: 'regular' },
            callback,
          ),
        ),
      clearProxy: () =>
        callChrome<void>((callback) =>
          chromeApi!.proxy.settings.clear({ scope: 'regular' }, callback),
        ),
      isProxyOwned: (port) =>
        callChrome<{ value: ChromeProxyValue; levelOfControl?: string }>((callback) =>
          chromeApi!.proxy.settings.get({}, callback),
        ).then((result) => isOwnedChromeProxyConfig(result.value, port, result.levelOfControl)),
    };
  }

  (browser.proxy as unknown as { onError: { addListener(callback: (error: Error) => void): void } })
    .onError.addListener((error) => {
      console.error('[ClashVergeLink] firefox proxy error:', error.message);
    });
  return {
    target: 'firefox',
    setProxy: setProxyFirefox,
    clearProxy: clearProxyFirefox,
    isProxyOwned: isProxyOwnedFirefox,
  };
}
