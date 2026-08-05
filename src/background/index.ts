import type { BackgroundMessage, PluginSettings } from '../types'
import { getSettings } from '../services/storage'
import { clashApi } from '../services/clashApi'
import { isOwnedProxyConfig } from './proxyState'

const PROXY_HOST = '127.0.0.1'
const DEFAULT_PORT = 7899

let cachedPort = DEFAULT_PORT

async function loadPort(): Promise<void> {
  const raw = await browser.storage.local.get('settings')
  const settings = raw['settings'] as Partial<PluginSettings> | undefined
  cachedPort = settings?.mixedPort ?? DEFAULT_PORT
}

async function enableProxyFirefox(): Promise<void> {
  await loadPort()
  const config: browser.proxy.ProxyConfig = {
    proxyType: 'manual',
    http: `http://${PROXY_HOST}:${cachedPort}`,
    httpProxyAll: true,
    passthrough: 'localhost, 127.0.0.1, [::1], <local>',
  }
  await browser.proxy.settings.set({ value: config, scope: 'regular' })
}

async function disableProxyFirefox(): Promise<void> {
  await browser.proxy.settings.clear({ scope: 'regular' })
}

async function getProxyStatusFirefox(): Promise<boolean> {
  await loadPort()
  const result = await browser.proxy.settings.get({})
  return isOwnedProxyConfig(
    result.value as browser.proxy.ProxyConfig,
    cachedPort,
    result.levelOfControl,
  )
}

async function persistProxyEnabled(enabled: boolean): Promise<void> {
  const current = await getSettings()
  await browser.storage.local.set({ settings: { ...current, proxyEnabled: enabled } })
}

/** 清除 Firefox 代理并将持久化状态回滚为关闭 */
async function clearProxyAndState(context: string): Promise<void> {
  await persistProxyEnabled(false)
  await disableProxyFirefox().catch((cleanupError: unknown) => {
    console.error(
      context,
      cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
    )
  })
}

async function rollbackProxyFirefox(context: string, error: unknown): Promise<void> {
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

browser.runtime.onMessage.addListener(
  async (message: BackgroundMessage & { action: string }): Promise<unknown> => {
    try {
      switch (message.action) {
        case 'SET_PROXY': {
          const enabled = Boolean(message.enabled)
          try {
            if (enabled) await enableProxyFirefox()
            else await disableProxyFirefox()
          } catch (error) {
            if (enabled) {
              await rollbackProxyFirefox('[ClashVergeLink] enable proxy:', error)
            }
            throw error
          }

          await persistProxyEnabled(enabled)
          return { success: true }
        }

        case 'GET_PROXY_STATUS':
          return { enabled: await getProxyStatusFirefox() }

        default:
          return { success: false, error: `Unknown action: ${message.action}` }
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('[ClashVergeLink::Background]', message)
      return { success: false, error: message }
    }
  },
)

browser.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return
  const settings = changes['settings']?.newValue as PluginSettings | undefined
  const previous = changes['settings']?.oldValue as PluginSettings | undefined
  if (!settings) return

  if (settings.proxyEnabled && previous && previous.mixedPort !== settings.mixedPort) {
    void enableProxyFirefox()
      .catch((error: unknown) => rollbackProxyFirefox('[ClashVergeLink] reapply proxy:', error))
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

    // Clash 离线时不恢复代理，避免把 Firefox 指向不可用端口；
    // 同时清除残留代理配置并把持久化状态回滚为关闭，保持状态一致。
    if (!(await isClashOnline())) {
      console.warn('[ClashVergeLink] init: Clash offline, clearing stale proxy')
      await clearProxyAndState('[ClashVergeLink] init: proxy cleanup:')
      return
    }

    await enableProxyFirefox().catch((error: unknown) =>
      rollbackProxyFirefox('[ClashVergeLink] restore proxy:', error),
    )
  } catch (error: unknown) {
    console.error('[ClashVergeLink] init:', error instanceof Error ? error.message : String(error))
  }
})()
