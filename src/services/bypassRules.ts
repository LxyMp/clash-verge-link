/**
 * 直连规则解析与匹配（Clash 风格域名语法 + 可选正则）。
 *
 * 一行一条规则，三种形式：
 * - `example.com`   域名规则：匹配 example.com 及其所有子域名
 * - `*.example.com` 通配规则：仅匹配子域名，不含 example.com 本身
 * - `/正则/`        正则规则：用斜杠包裹，按完整 URL 子串匹配
 *
 * 纯逻辑模块，供设置校验与后台代理层共同使用。
 */

export type BypassRule =
  | { kind: 'domain'; value: string }
  | { kind: 'wildcard'; value: string }
  | { kind: 'regex'; value: string };

/** 合法域名：点分标签，至少两级，每级字母/数字/连字符 */
const DOMAIN_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i;

/** 解析单条规则，无法识别或非法时返回 null */
export function parseBypassRule(line: string): BypassRule | null {
  const rule = line.trim();
  if (!rule) return null;

  if (rule.length >= 2 && rule.startsWith('/') && rule.endsWith('/')) {
    const source = rule.slice(1, -1);
    if (!source) return null;
    try {
      new RegExp(source);
    } catch {
      return null;
    }
    return { kind: 'regex', value: source };
  }

  if (rule.startsWith('*.')) {
    const domain = rule.slice(2).toLowerCase();
    return DOMAIN_PATTERN.test(domain) ? { kind: 'wildcard', value: domain } : null;
  }

  const domain = rule.toLowerCase();
  return DOMAIN_PATTERN.test(domain) ? { kind: 'domain', value: domain } : null;
}

/** 批量解析，跳过非法行（输入层已校验，此处兜底） */
export function parseBypassRules(lines: string[]): BypassRule[] {
  return lines
    .map((line) => parseBypassRule(line))
    .filter((rule): rule is BypassRule => rule !== null);
}

function extractHost(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^\[|\]$/g, '').toLowerCase();
  } catch {
    return null;
  }
}

/** 本机与无点主机名（对应 Chromium <local> 语义）始终直连 */
function isLocalHost(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || !host.includes('.');
}

/** 编译规则为 URL 匹配器；命中返回 true 表示该 URL 应直连 */
export function compileBypass(rules: BypassRule[]): (url: string) => boolean {
  const regexes: RegExp[] = [];
  for (const rule of rules) {
    if (rule.kind !== 'regex') continue;
    try {
      regexes.push(new RegExp(rule.value));
    } catch {
      // 跳过无法编译的正则
    }
  }

  return (url: string): boolean => {
    const host = extractHost(url);
    if (host) {
      if (isLocalHost(host)) return true;
      for (const rule of rules) {
        if (rule.kind === 'domain' && (host === rule.value || host.endsWith(`.${rule.value}`))) {
          return true;
        }
        if (rule.kind === 'wildcard' && host.endsWith(`.${rule.value}`)) {
          return true;
        }
      }
    }
    return regexes.some((re) => re.test(url));
  };
}
