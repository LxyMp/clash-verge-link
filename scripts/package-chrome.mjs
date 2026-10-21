// 将 dist-chrome/ 打包为 Chrome Web Store 上传用 ZIP（manifest 位于压缩包根目录）
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const { version } = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
const artifactDir = resolve(root, 'web-ext-artifacts')
const archive = resolve(artifactDir, `clash-verge-link-chrome-${version}.zip`)

mkdirSync(artifactDir, { recursive: true })
rmSync(archive, { force: true })
execFileSync('zip', ['-r', '-q', archive, '.'], { cwd: resolve(root, 'dist-chrome') })
console.log(`Chrome archive ready: ${archive}`)
