import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import vue from '@vitejs/plugin-vue'
import { defineConfig, type Plugin } from 'vite'

type BuildTarget = 'firefox' | 'chrome'

// EXT_TARGET=chrome yarn vite build 切换到 Chrome 目标，默认 Firefox
const target: BuildTarget = process.env.EXT_TARGET === 'chrome' ? 'chrome' : 'firefox'

const staticAssets = [
  '_locales/en/messages.json',
  '_locales/zh_CN/messages.json',
  'src/assets/icons/icon16.png',
  'src/assets/icons/icon24.png',
  'src/assets/icons/icon32.png',
  'src/assets/icons/icon48.png',
  'src/assets/icons/icon128.png',
] as const

const manifestSource =
  target === 'chrome' ? 'manifest.chrome.json' : 'manifest.firefox.json'

function extensionAssets(): Plugin {
  const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8')) as {
    version: string
  }

  return {
    name: `extension-assets-${target}`,
    generateBundle() {
      for (const sourcePath of staticAssets) {
        const fileName = sourcePath.startsWith('src/assets/icons/')
          ? sourcePath.replace('src/assets/', '')
          : sourcePath

        this.emitFile({
          type: 'asset',
          fileName,
          source: readFileSync(resolve(__dirname, sourcePath)),
        })
      }

      // 版本号统一取自 package.json，避免各平台 manifest 漂移
      const manifest = JSON.parse(readFileSync(resolve(__dirname, manifestSource), 'utf8'))
      manifest.version = pkg.version
      this.emitFile({
        type: 'asset',
        fileName: 'manifest.json',
        source: `${JSON.stringify(manifest, null, 2)}\n`,
      })
    },
  }
}

// Chromium 系浏览器没有 browser.* 命名空间；在所有 chunk 顶部注入别名，
// 保证任何模块求值前生效（以 banner 形式注入，不会被摇树优化移除）。
const browserNamespaceBanner = `if (typeof globalThis.browser === 'undefined' && typeof globalThis.chrome !== 'undefined') {
  globalThis.browser = globalThis.chrome;
}`

export default defineConfig({
  // 构建期注入目标平台常量，src/compat/platform.ts 消费；
  // 配合摇树优化，每个产物只保留对应平台的代理实现
  define: {
    __EXT_TARGET__: JSON.stringify(target),
  },
  plugins: [vue(), extensionAssets()],
  build: {
    outDir: target === 'chrome' ? 'dist-chrome' : 'dist-firefox',
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'popup.html'),
        settings: resolve(__dirname, 'index.html'),
        background: resolve(__dirname, 'src/background/index.ts'),
      },
      output: {
        banner: browserNamespaceBanner,
        entryFileNames: (chunk) =>
          chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js',
      },
    },
  },
})
