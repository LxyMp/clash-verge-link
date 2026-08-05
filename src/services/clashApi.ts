import type {
  ProxyResponse,
  ClashConfig,
  DelayResult,
  HealthCheckResult,
} from '../types';

/** 默认请求超时(ms)：防止针对本地 API 的请求无限悬挂 */
const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Clash Verge Rev RESTful API 客户端
 *
 * 封装对 CVR 外部控制器（external-controller）的全部 HTTP 交互，
 * 支持 http / https 双协议，自动注入 Bearer 鉴权。
 */
export class ClashApi {
  private baseUrl = '';
  private secret = '';

  /** 设置 API 连接参数 */
  setConfig(baseUrl: string, secret: string): void {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.secret = secret;
  }

  // ---------- 内部工具 ----------

  /** 构造请求头（自动注入 Authorization） */
  private headers(extra?: HeadersInit): HeadersInit {
    const h: Record<string, string> = { Accept: 'application/json' };
    if (this.secret) {
      h['Authorization'] = `Bearer ${this.secret}`;
    }
    return { ...h, ...(extra as Record<string, string> | undefined) };
  }

  /**
   * 通用请求方法
   *
   * 默认带超时（timeoutMs），调用方传入的 signal 与超时信号通过 AbortSignal.any 合并：
   * 任一触发都会中止请求。timeoutMs 传 0 表示不设超时。
   */
  private async request<T>(
    path: string,
    options?: RequestInit,
    signal?: AbortSignal,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    let fetchSignal = signal;
    if (timeoutMs > 0) {
      const timeoutSignal = AbortSignal.timeout(timeoutMs);
      fetchSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
    }

    const res = await fetch(url, {
      ...options,
      headers: {
        ...this.headers(),
        ...(options?.headers as Record<string, string> | undefined),
      },
      signal: fetchSignal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const err = new Error(`[${res.status}] ${res.statusText}${body ? ` — ${body}` : ''}`);
      console.error(`[ClashApi] ${options?.method ?? 'GET'} ${url}`, err.message);
      throw err;
    }

    console.debug(`[ClashApi] ${options?.method ?? 'GET'} ${url} → ${res.status}`);

    // 204 No Content
    if (res.status === 204) return undefined as T;

    return res.json() as Promise<T>;
  }

  // ---------- 公开 API ----------

  /**
   * 获取全部代理节点与策略组
   * GET /proxies
   */
  async getProxies(signal?: AbortSignal): Promise<ProxyResponse> {
    return this.request<ProxyResponse>('/proxies', undefined, signal);
  }

  /**
   * 读取核心配置
   * GET /configs
   */
  async getConfigs(signal?: AbortSignal): Promise<ClashConfig> {
    return this.request<ClashConfig>('/configs', undefined, signal);
  }

  /**
   * 修改运行模式或其他配置项
   * PATCH /configs
   */
  async updateConfig(partial: Partial<ClashConfig>, signal?: AbortSignal): Promise<void> {
    return this.request<void>(
      '/configs',
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(partial),
      },
      signal,
    );
  }

  /**
   * 切换策略组选中的节点
   * PUT /proxies/{group}
   */
  async switchProxy(groupName: string, nodeName: string, signal?: AbortSignal): Promise<void> {
    const encoded = encodeURIComponent(groupName);
    return this.request<void>(
      `/proxies/${encoded}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nodeName }),
      },
      signal,
    );
  }

  /**
   * 单节点延迟测试
   * GET /proxies/{name}/delay?timeout=5000&url=...
   */
  async testDelay(
    nodeName: string,
    timeout = 5000,
    url = 'http://www.gstatic.com/generate_204',
    signal?: AbortSignal,
  ): Promise<DelayResult> {
    const encoded = encodeURIComponent(nodeName);
    const params = new URLSearchParams({ timeout: String(timeout), url });
    // Clash 服务端按 timeout 参数返回结果，客户端超时留一点缓冲，
    // 避免默认 10s 超时截断用户配置的长测速（最大 30s）。
    return this.request<DelayResult>(
      `/proxies/${encoded}/delay?${params}`,
      undefined,
      signal,
      timeout + 2000,
    );
  }

  /**
   * 健康检查（检测 CVR 是否存活）
   * GET /version
   */
  async healthCheck(signal?: AbortSignal): Promise<HealthCheckResult> {
    return this.request<HealthCheckResult>('/version', undefined, signal);
  }

}

/** 单例导出 */
export const clashApi = new ClashApi();
