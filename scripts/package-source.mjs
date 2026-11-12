// Zips the SOURCE CODE for another developer: release/GrandRantaOpen-source.zip
//
//   npm run package:source
//
// Contains everything needed to develop, run and deploy the app – but never your tournament data
// (data/), local secrets (.dev.vars), installed libraries (node_modules) or build output.
// The receiver runs `npm install` and follows DEPLOY.md.
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const release = path.join(root, 'release')
const name = 'GrandRantaOpen-source'
const out = path.join(release, name)
const zip = path.join(release, `${name}.zip`)

const INCLUDE = [
  'index.html',
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'vite.config.ts',
  'wrangler.toml',
  '.gitignore',
  '.dev.vars.example',
  'README.md',
  'DEPLOY.md',
  'src',
  'server',
  'shared',
  'worker',
  'migrations',
  'scripts',
]
// Never ship these, even if they end up inside an included folder.
const NEVER = /(^|[\\/])(node_modules|dist|release|data|\.wrangler|\.dev\.vars|\.git)([\\/]|$)/

fs.rmSync(out, { recursive: true, force: true })
fs.rmSync(zip, { force: true })
fs.mkdirSync(out, { recursive: true })

for (const item of INCLUDE) {
  const from = path.join(root, item)
  if (!fs.existsSync(from)) continue
  fs.cpSync(from, path.join(out, item), {
    recursive: true,
    filter: (src) => !NEVER.test(path.relative(root, src)),
  })
}
// An empty data folder so the local server has a place to save to.
fs.mkdirSync(path.join(out, 'data'))
fs.writeFileSync(path.join(out, 'data', '.gitkeep'), '')

// Run inside release/ with relative names – avoids trouble with non-ASCII folder names (e.g. "ö").
if (process.platform === 'win32') {
  const tar = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe')
  execSync(`"${tar}" -a -c -f ${name}.zip ${name}`, { cwd: release, stdio: 'inherit' })
} else {
  execSync(`zip -qr ${name}.zip ${name}`, { cwd: release, stdio: 'inherit' })
}
fs.rmSync(out, { recursive: true, force: true })

const kb = Math.round(fs.statSync(zip).size / 1024)
console.log(`✅ Done: release/${name}.zip (${kb} KB) – source code for another developer (no data, no secrets).`)
