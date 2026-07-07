#!/usr/bin/env node
/**
 * Python 캡처 엔진 빌드 → Electron 리소스 복사 (명세서 §7 빌드 자동화 1단계).
 *
 *   python-engine/ 에서 PyInstaller(build.spec) 실행
 *   → dist/capture-engine(.exe) 를 electron-app/resources/engine/ 으로 복사
 *
 * 이후 electron-builder가 extraResources로 최종 패키지에 동봉한다.
 * 사용: npm run build:engine  (build:all에 포함)
 */

import { execSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const engineDir = resolve(__dirname, '../../python-engine')
const isWindows = process.platform === 'win32'

// 1) python 실행기 결정 (.venv 우선)
const venvPython = isWindows
  ? join(engineDir, '.venv', 'Scripts', 'python.exe')
  : join(engineDir, '.venv', 'bin', 'python')
const python = existsSync(venvPython) ? venvPython : isWindows ? 'python' : 'python3'

console.log(`[build-engine] python: ${python}`)

// 2) PyInstaller 실행
execSync(`"${python}" -m PyInstaller build.spec --noconfirm`, {
  cwd: engineDir,
  stdio: 'inherit'
})

// 3) 산출물 복사
const exeName = isWindows ? 'capture-engine.exe' : 'capture-engine'
const built = join(engineDir, 'dist', exeName)
if (!existsSync(built)) {
  console.error(`[build-engine] 산출물이 없습니다: ${built}`)
  process.exit(1)
}

const destDir = resolve(__dirname, '../resources/engine')
mkdirSync(destDir, { recursive: true })
copyFileSync(built, join(destDir, exeName))
console.log(`[build-engine] 복사 완료: ${join(destDir, exeName)}`)
