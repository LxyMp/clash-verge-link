// ClashVergeLink 全局类型定义
// ================================

// ---------- CVR RESTful API 数据类型 ----------

/** 代理节点类型枚举 */
export type ProxyType =
  | 'Shadowsocks'
  | 'ShadowsocksR'
  | 'Vmess'
  | 'Trojan'
  | 'Http'
  | 'Socks5'
  | 'Snell'
  | 'Hysteria'
  | 'Hysteria2'
  | 'TUIC'
  | 'WireGuard'
  | 'Direct'
  | 'Reject'
  | 'Selector'
  | 'URLTest'
  | 'Fallback'
  | 'LoadBalance'
  | 'Relay'
  | 'Compatible'
  | string;

/** 延迟历史记录 */
export interface LatencyHistory {
  time: string;
  delay: number;
}

/** 代理节点 */
export interface ProxyNode {
  name: string;
  type: ProxyType;
  alive?: boolean;
  history?: LatencyHistory[];
  // 节点特有字段，根据实际情况扩展
  udp?: boolean;
  xudp?: boolean;
  tfo?: boolean;
}

/** 代理策略组（Selector / URLTest / Fallback / LoadBalance / Relay） */
export interface ProxyGroup {
  name: string;
  type: 'Selector' | 'URLTest' | 'Fallback' | 'LoadBalance' | 'Relay';
  now: string; // 当前选中的节点名
  all: string[]; // 所有可选节点名
}

/** /proxies 接口返回体 */
export interface ProxyResponse {
  proxies: Record<string, ProxyNode | ProxyGroup>;
}

/** Clash 运行模式 */
export type ClashMode = 'rule' | 'global' | 'direct';

/** Clash 核心配置（部分字段） */
export interface ClashConfig {
  port: number;
  'socks-port': number;
  'mixed-port': number;
  mode: ClashMode;
  'allow-lan': boolean;
  'log-level': string;
  secret?: string;
  'external-controller': string;
}

/** 单节点延迟测试返回 */
export interface DelayResult {
  delay: number;
}

/** 健康检查返回 */
export interface HealthCheckResult {
  version?: string;
  meta?: boolean;
}

// ---------- 插件设置类型 ----------

/** 用户持久化设置 */
export interface PluginSettings {
  apiBaseUrl: string;
  apiSecret: string;
  proxyEnabled: boolean;
  mixedPort: number;
  /** 批量测速并发数 */
  testConcurrency: number;
  /** 测速目标地址 */
  testUrl: string;
  /** 单节点测速超时(ms) */
  testTimeout: number;
  /** 界面语言 */
  language: string;
  /** 主题：system | dark | light */
  theme: string;
  /** 直连规则：每条为一个正则表达式，命中完整 URL 的请求不走代理 */
  bypassRules: string[];
}

// ---------- Background ↔ Popup 消息协议 ----------

/** 消息动作枚举 */
export type MessageAction = 'SET_PROXY' | 'GET_PROXY_STATUS';

/** Background 消息格式 */
export interface BackgroundMessage {
  action: MessageAction;
  enabled?: boolean;
}

/** 代理状态响应 */
export interface ProxyStatusResponse {
  enabled: boolean;
}
