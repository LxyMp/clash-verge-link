import { parseBypassRules, type BypassRule } from '../services/bypassRules';

export interface RuntimeResponse {
  success?: boolean;
  error?: string;
}

/** Firefox browser.proxy.settings 取值结构（仅关注本扩展写入的字段） */
export interface FirefoxProxyValue {
  proxyType?: string;
  http?: string;
  httpProxyAll?: boolean;
  passthrough?: string;
}

/** Chrome chrome.proxy.settings 取值结构（仅关注本扩展写入的字段） */
export interface ChromeProxyValue {
  mode?: string;
  rules?: {
    singleProxy?: {
      scheme?: string;
      host?: string;
      port?: number;
    };
    bypassList?: string[];
  };
}

const EXPECTED_BYPASS = ['localhost', '127.0.0.1', '[::1]', '<local>'];
const EXPECTED_BYPASS_SET = new Set(EXPECTED_BYPASS);

export function isSuccessfulResponse(value: unknown): value is RuntimeResponse & { success: true } {
  return typeof value === 'object' && value !== null && (value as RuntimeResponse).success === true;
}

/** 生成 Firefox 手动代理配置，全部流量走 Clash 混合端口，本地地址直连 */
export function buildFirefoxProxyConfig(host: string, port: number): FirefoxProxyValue {
  return {
    proxyType: 'manual',
    http: `http://${host}:${port}`,
    httpProxyAll: true,
    passthrough: EXPECTED_BYPASS.join(', '),
  };
}

function matchesEndpoint(endpoint: string | undefined, expectedPort: number): boolean {
  if (!endpoint) return false;

  try {
    const url = new URL(endpoint.includes('://') ? endpoint : `http://${endpoint}`);
    return url.hostname === '127.0.0.1' && Number(url.port) === expectedPort;
  } catch {
    return false;
  }
}

function matchesPassthrough(value: string | undefined): boolean {
  if (!value) return false;
  const entries = value
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return (
    entries.length === EXPECTED_BYPASS_SET.size &&
    entries.every((entry) => EXPECTED_BYPASS_SET.has(entry))
  );
}

/** 判断 Firefox 当前代理配置是否由本扩展写入（且仍指向当前端口） */
export function isOwnedFirefoxProxyConfig(
  value: FirefoxProxyValue,
  expectedPort: number,
  levelOfControl: string | undefined,
): boolean {
  return (
    levelOfControl === 'controlled_by_this_extension' &&
    value.proxyType === 'manual' &&
    value.httpProxyAll === true &&
    matchesEndpoint(value.http, expectedPort) &&
    matchesPassthrough(value.passthrough)
  );
}

/**
 * Chrome bypassList 正则条目形式为 /pattern/。
 * 包装成 .*(?:pattern).* 后，无论 Chromium 对正则条目采用全匹配
 * 还是部分匹配，语义都等价于子串匹配，与 Firefox 侧 RegExp.test 一致；
 * 用户规则内部的 ^ $ 锚点在两种语义下仍然生效。
 */
export function wrapChromeBypassRule(source: string): string {
  return `/.*(?:${source}).*/`;
}

/** 把解析后的规则映射为 Chrome 原生 bypass 条目（域名/通配符/正则） */
function chromeBypassEntries(rules: BypassRule[]): string[] {
  const entries: string[] = [];
  for (const rule of rules) {
    if (rule.kind === 'domain') {
      // 同时写入裸域名与通配条目，保证在任何匹配语义下都覆盖"自身 + 子域名"
      entries.push(rule.value, `*.${rule.value}`);
    } else if (rule.kind === 'wildcard') {
      entries.push(`*.${rule.value}`);
    } else {
      entries.push(wrapChromeBypassRule(rule.value));
    }
  }
  return entries;
}

/** 生成 Chrome fixed_servers 代理配置，HTTP(S) 流量统一走 Clash 混合端口，本地地址与命中规则的 URL 直连 */
export function buildChromeProxyConfig(
  host: string,
  port: number,
  bypassRules: string[] = [],
): ChromeProxyValue {
  return {
    mode: 'fixed_servers',
    rules: {
      singleProxy: { scheme: 'http', host, port },
      bypassList: [...EXPECTED_BYPASS, ...chromeBypassEntries(parseBypassRules(bypassRules))],
    },
  };
}

function matchesBypassList(list: string[] | undefined): boolean {
  if (!list) return false;
  // 归属判断只需确认四个本机直连条目存在；其余条目是用户规则（域名/通配/正则），形态不定
  const entries = new Set(list.map((entry) => entry.trim().toLowerCase()));
  return EXPECTED_BYPASS.every((expected) => entries.has(expected));
}

/** 判断 Chrome 当前代理配置是否由本扩展写入（且仍指向当前端口） */
export function isOwnedChromeProxyConfig(
  value: ChromeProxyValue,
  expectedPort: number,
  levelOfControl: string | undefined,
): boolean {
  const proxy = value?.rules?.singleProxy;
  return (
    levelOfControl === 'controlled_by_this_extension' &&
    value?.mode === 'fixed_servers' &&
    proxy?.host === '127.0.0.1' &&
    proxy?.port === expectedPort &&
    matchesBypassList(value?.rules?.bypassList)
  );
}
