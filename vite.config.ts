import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import vue from '@vitejs/plugin-vue'
import { defineConfig, type Plugin } from 'vite'

const staticAssets = [
  'manifest.json',
  '_locales/en/messages.json',
  '_locales/zh_CN/messages.json',
  'src/assets/icons/icon16.png',
  'src/assets/icons/icon24.png',
  'src/assets/icons/icon32.png',
  'src/assets/icons/icon48.png',
  'src/assets/icons/icon128.png',
] as const

function firefoxExtensionAssets(): Plugin {
  return {
    name: 'firefox-extension-assets',
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
    },
  }
}

export default defineConfig({
  plugins: [vue(), firefoxExtensionAssets()],
  build: {
    outDir: 'dist-firefox',
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'popup.html'),
        settings: resolve(__dirname, 'index.html'),
        background: resolve(__dirname, 'src/background/index.ts'),
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js',
      },
    },
  },
})
