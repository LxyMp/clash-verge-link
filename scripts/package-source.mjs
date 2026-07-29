import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const { version } = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
const artifactDir = resolve(root, 'web-ext-artifacts')
const archive = resolve(artifactDir, `clashvergelink-${version}-source.zip`)

const sourcePaths = [
  '.gitignore',
  'LICENSE',
  'PRIVACY.md',
  'README.md',
  '_locales',
  'docs',
  'index.html',
  'manifest.json',
  'package.json',
  'popup.html',
  'scripts',
  'src',
  'tests',
  'tsconfig.json',
  'tsconfig.node.json',
  'vite.config.ts',
  'yarn.lock',
]

mkdirSync(artifactDir, { recursive: true })
rmSync(archive, { force: true })
execFileSync('zip', ['-r', '-q', archive, ...sourcePaths], { cwd: root })
console.log(`Source archive ready: ${archive}`)
