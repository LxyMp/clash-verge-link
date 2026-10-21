// 构建后在独立临时配置的 Chromium/Chrome 中载入扩展。
// 注意：Chrome 137+ 的正式版会忽略 --load-extension 参数，此时按输出提示
// 在 chrome://extensions 手动"加载已解压的扩展程序"指向 dist-chrome/。
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const extDir = resolve(root, 'dist-chrome')

if (!existsSync(resolve(extDir, 'manifest.json'))) {
  console.error('未找到 dist-chrome/manifest.json，请先执行 yarn build:chrome')
  process.exit(1)
}

const candidates = [
  process.env.CHROME_BIN,
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean)

const bin = candidates.find((path) => existsSync(path))
if (!bin) {
  console.error('未找到 Chrome/Chromium，可用 CHROME_BIN 环境变量指定浏览器可执行文件路径')
  process.exit(1)
}

const profile = mkdtempSync(resolve(tmpdir(), 'clash-verge-link-chrome-'))
console.log(`浏览器: ${bin}`)
console.log(`扩展目录: ${extDir}`)
console.log('若扩展未自动加载，请在 chrome://extensions 开启"开发者模式"后"加载已解压的扩展程序"选择上述目录')

const child = spawn(
  bin,
  [
    `--user-data-dir=${profile}`,
    `--load-extension=${extDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    'chrome://extensions',
  ],
  { stdio: 'inherit' },
)

child.on('exit', (code) => process.exit(code ?? 0))
