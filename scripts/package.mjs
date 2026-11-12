// Builds a ready-to-share copy of the app: release/GrandRantaOpen/ and release/GrandRantaOpen.zip
//
//   npm run package
//
// The package contains the built app, the server bundled into one file (no npm install needed)
// and – when built on Windows – a portable node.exe, so Windows friends need nothing installed.
// It never includes your tournament data, passwords or the online (Cloudflare) settings.
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const release = path.join(root, 'release')
const out = path.join(release, 'GrandRantaOpen')
const zip = path.join(release, 'GrandRantaOpen.zip')
const run = (cmd) => execSync(cmd, { cwd: root, stdio: 'inherit' })

console.log('🧹 Cleaning old player package')
// only our own outputs – other files in release/ (e.g. the source zip) stay
fs.rmSync(out, { recursive: true, force: true })
fs.rmSync(zip, { force: true })
fs.mkdirSync(out, { recursive: true })

console.log('🏗️  Building the app')
run('npx vite build --outDir release/GrandRantaOpen/dist --emptyOutDir')

console.log('📦 Bundling the server into one file')
run('npx rolldown server/index.js --platform node --format esm --file release/GrandRantaOpen/server/server.mjs --log-level warn')

if (process.platform === 'win32') {
  console.log('🟢 Adding portable Node.js for Windows (' + process.version + ')')
  fs.mkdirSync(path.join(out, 'runtime'))
  fs.copyFileSync(process.execPath, path.join(out, 'runtime', 'node.exe'))
}

const crlf = (s) => s.replace(/\r?\n/g, '\r\n')
// NOTE: keep the .bat pure ASCII – cmd.exe misreads non-ASCII text (e.g. "ä") in batch files.
fs.writeFileSync(
  path.join(out, 'START HERE (Windows).bat'),
  crlf(`@echo off
title Badminton tournament app
cd /d "%~dp0"
set NODE=runtime\\node.exe
if not exist "%NODE%" (
  where node >nul 2>nul || (
    echo Node.js was not found. Install the LTS version from https://nodejs.org and try again.
    pause
    exit /b 1
  )
  set NODE=node
)
if "%PORT%"=="" set PORT=3001
set OPEN_BROWSER=1
echo.
echo   The tournament app is starting at http://localhost:%PORT%
echo   Keep this window open while you use the app. Close it to stop.
echo.
"%NODE%" server\\server.mjs
pause
`),
)

const unix = `#!/bin/bash
# Grand Räntä Open – start script for Mac / Linux (needs Node.js 20+ from https://nodejs.org)
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js was not found. Install the LTS version from https://nodejs.org and try again."
  read -r -p "Press Enter to close"
  exit 1
fi
export PORT="\${PORT:-3001}"
export OPEN_BROWSER=1
echo
echo "  Grand Räntä Open is starting at http://localhost:$PORT"
echo "  Keep this window open while you use the app. Close it (or press Ctrl+C) to stop."
echo
node server/server.mjs
`
fs.writeFileSync(path.join(out, 'START HERE (Mac).command'), unix, { mode: 0o755 })

fs.writeFileSync(
  path.join(out, 'README.txt'),
  crlf(`UUSIMAA OPEN – badminton doubles tournament app
================================================

START
  Windows:  double-click  "START HERE (Windows).bat"
            (nothing to install – Node.js is included in the "runtime" folder)
            If Windows SmartScreen warns about the file: "More info" -> "Run anyway".

  Mac:      1. Install Node.js (LTS) once from https://nodejs.org
            2. Right-click "START HERE (Mac).command" -> Open -> Open
               (if it says "permission denied": open Terminal in this folder and run
                bash "START HERE (Mac).command")

  The app opens in your browser at http://localhost:3001
  Keep the black window open while you use the app – closing it stops the app.

YOUR DATA
  Everything is saved in the "data" folder (created on first use).
  To start completely fresh, use the Reset button in the app (or delete the data folder).

PLAYERS' PHONES (TEAM PAGES)
  Every team has a live page, e.g. http://localhost:3001/unstoppable-clears
  Each team page has a random password, shown only in the organizer view and hidden until you
  click "Show password & link" on a team (Pairs page or the "Team pages & passwords" panel).
  "Copy invite" copies the link + password, ready to send e.g. on WhatsApp.
  After a game either team can report the score on its page; it counts once the other team
  accepts it. The organizer sees waiting reports on the Program page and can approve them.
  Note: in this local version anyone who opens the main page (without a team name) sees the
  organizer view, passwords included.
  Phones on the same Wi-Fi can open them using this laptop's address, which the panel shows
  (e.g. http://192.168.1.20:3001/unstoppable-clears).
  If Windows asks whether Node.js may use the network, allow "Private networks".

OTHER PORT
  If port 3001 is taken, set a different one, e.g. in Windows Command Prompt:
    set PORT=3002 && "START HERE (Windows).bat"
`),
)

console.log('🗜️  Creating the zip')
// Run inside release/ with relative names – avoids trouble with non-ASCII folder names (e.g. "ö").
if (process.platform === 'win32') {
  const tar = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') // Windows 10+ built-in bsdtar
  execSync(`"${tar}" -a -c -f GrandRantaOpen.zip GrandRantaOpen`, { cwd: release, stdio: 'inherit' })
} else {
  execSync('zip -qr GrandRantaOpen.zip GrandRantaOpen', { cwd: release, stdio: 'inherit' })
}

const mb = (fs.statSync(zip).size / 1024 / 1024).toFixed(1)
console.log(`\n✅ Done: release/GrandRantaOpen.zip (${mb} MB) – send this file to your friend.`)
