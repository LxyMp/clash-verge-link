import type { BackgroundMessage, PluginSettings } from '../types'
import { getSettings } from '../services/storage'
import { clashApi } from '../services/clashApi'
import { createProxyBackend } from './proxyBackend'

const PROXY_HOST = '127.0.0.1'
const DEFAULT_PORT = 7899

const proxy = createProxyBackend()

let cachedPort = DEFAULT_PORT
let cachedRules: string[] = []

async function loadProxyParams(): Promise<void> {
  const raw = await browser.storage.local.get('settings')
  const settings = raw['settings'] as Partial<PluginSettings> | undefined
  cachedPort = settings?.mixedPort ?? DEFAULT_PORT
  cachedRules = Array.isArray(settings?.bypassRules) ? settings!.bypassRules : []
}

async function enableProxy(): Promise<void> {
  await loadProxyParams()
  await proxy.setProxy(PROXY_HOST, cachedPort, cachedRules)
}

async function disableProxy(): Promise<void> {
  await proxy.clearProxy()
}

async function getProxyStatus(): Promise<boolean> {
  await loadProxyParams()
  return proxy.isProxyOwned(cachedPort)
}

async function persistProxyEnabled(enabled: boolean): Promise<void> {
  const current = await getSettings()
  await browser.storage.local.set({ settings: { ...current, proxyEnabled: enabled } })
}

/** 清除浏览器代理并将持久化状态回滚为关闭 */
async function clearProxyAndState(context: string): Promise<void> {
  await persistProxyEnabled(false)
  await disableProxy().catch((cleanupError: unknown) => {
    console.error(
      context,
      cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
    )
  })
}

async function rollbackProxy(context: string, error: unknown): Promise<void> {
  console.error(context, error instanceof Error ? error.message : String(error))
  await clearProxyAndState('[ClashVergeLink] proxy cleanup:')
}

/** 探测 Clash 外部控制器是否在线（带默认超时，不会悬挂） */
async function isClashOnline(): Promise<boolean> {
  try {
    const settings = await getSettings()
    clashApi.setConfig(settings.apiBaseUrl, settings.apiSecret)
    await clashApi.healthCheck()
    return true
  } catch {
    return false
  }
}

async function handleMessage(
  message: BackgroundMessage & { action: string },
): Promise<unknown> {
  switch (message.action) {
    case 'SET_PROXY': {
      const enabled = Boolean(message.enabled)
      try {
        if (enabled) await enableProxy()
        else await disableProxy()
      } catch (error) {
        if (enabled) {
          await rollbackProxy('[ClashVergeLink] enable proxy:', error)
        }
        throw error
      }

      await persistProxyEnabled(enabled)
      return { success: true }
    }

    case 'GET_PROXY_STATUS':
      return { enabled: await getProxyStatus() }

    default:
      return { success: false, error: `Unknown action: ${message.action}` }
  }
}

// Chrome 不支持 async 监听器以返回 Promise 的方式回传响应，
// 统一使用 sendResponse + return true 的经典模式（Firefox 同样支持）。
browser.runtime.onMessage.addListener(
  (message: BackgroundMessage & { action: string }, _sender, sendResponse) => {
    handleMessage(message)
      .then((response) => sendResponse(response as Record<string, unknown>))
      .catch((error: unknown) => {
        const text = error instanceof Error ? error.message : String(error)
        console.error('[ClashVergeLink::Background]', text)
        sendResponse({ success: false, error: text })
      })
    return true
  },
)

browser.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return
  const settings = changes['settings']?.newValue as PluginSettings | undefined
  const previous = changes['settings']?.oldValue as PluginSettings | undefined
  if (!settings) return

  const portChanged = previous !== undefined && previous.mixedPort !== settings.mixedPort
  const rulesChanged =
    previous !== undefined &&
    JSON.stringify(previous.bypassRules ?? []) !== JSON.stringify(settings.bypassRules ?? [])

  // 端口或直连规则变化时，重新应用代理配置使新值生效
  if (settings.proxyEnabled && (portChanged || rulesChanged)) {
    void enableProxy()
      .catch((error: unknown) => rollbackProxy('[ClashVergeLink] reapply proxy:', error))
      .catch((error: unknown) => {
        console.error(
          '[ClashVergeLink] proxy rollback:',
          error instanceof Error ? error.message : String(error),
        )
      })
  }
})

browser.runtime.onInstalled.addListener(() => {
  void browser.contextMenus
    .removeAll()
    .then(() =>
      browser.contextMenus.create({
        id: 'open-settings',
        title: browser.i18n.getMessage('contextMenuSettings'),
        contexts: ['action'],
      }),
    )
    .catch((error: unknown) => {
      console.error(
        '[ClashVergeLink] context menu:',
        error instanceof Error ? error.message : String(error),
      )
    })
})

browser.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === 'open-settings') {
    void browser.tabs.create({ url: browser.runtime.getURL('index.html') })
  }
})

void (async () => {
  try {
    const settings = await getSettings()
    if (!settings.proxyEnabled) return

    // Clash 离线时不恢复代理，避免把浏览器指向不可用端口；
    // 同时清除残留代理配置并把持久化状态回滚为关闭，保持状态一致。
    if (!(await isClashOnline())) {
      console.warn('[ClashVergeLink] init: Clash offline, clearing stale proxy')
      await clearProxyAndState('[ClashVergeLink] init: proxy cleanup:')
      return
    }

    await enableProxy().catch((error: unknown) =>
      rollbackProxy('[ClashVergeLink] restore proxy:', error),
    )
  } catch (error: unknown) {
    console.error('[ClashVergeLink] init:', error instanceof Error ? error.message : String(error))
  }
})()
