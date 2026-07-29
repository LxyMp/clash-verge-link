import type { BackgroundMessage, PluginSettings } from '../types'
import { getSettings } from '../services/storage'
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

async function rollbackProxyFirefox(context: string, error: unknown): Promise<void> {
  console.error(context, error instanceof Error ? error.message : String(error))
  await persistProxyEnabled(false)
  await disableProxyFirefox().catch((cleanupError: unknown) => {
    console.error(
      '[ClashVergeLink] proxy cleanup:',
      cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
    )
  })
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
    if (settings.proxyEnabled) {
      await enableProxyFirefox().catch((error: unknown) =>
        rollbackProxyFirefox('[ClashVergeLink] restore proxy:', error),
      )
    }
  } catch (error: unknown) {
    console.error('[ClashVergeLink] init:', error instanceof Error ? error.message : String(error))
  }
})()
