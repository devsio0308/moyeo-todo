import { spawn, type ChildProcess } from 'child_process'
import { EventEmitter } from 'events'
import { app } from 'electron'
import { is } from '@electron-toolkit/utils'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { dashboardStore } from './store'

const RESTART_DELAY_MS = 3_000
const MAX_CONSECUTIVE_FAILURES = 5
/** 이 시간 이상 살아있었으면 '정상 동작 후 종료'로 보고 실패 카운터를 리셋 */
const STABLE_ALIVE_MS = 30_000

/**
 * Python 캡처 엔진 서브프로세스 관리 (명세서 §3).
 * - 죽으면 3초 후 자동 재시작
 * - 연속 5회 실패 시 재시작 중단 + 'failed' 이벤트 (무한 루프 방지)
 * - stop()은 SIGTERM으로 정리 (before-quit에서 호출 — 좀비 방지)
 *
 * 이벤트: 'failed' — 재시작 포기. UI에 에러 배지 표시용
 */
export class PythonBridge extends EventEmitter {
  private proc: ChildProcess | null = null
  private restartTimer: NodeJS.Timeout | null = null
  private consecutiveFailures = 0
  private spawnedAt = 0
  private stopped = false

  start(): void {
    this.stopped = false
    this.consecutiveFailures = 0
    this.spawnProcess()
  }

  get failed(): boolean {
    return this.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES
  }

  stop(): void {
    this.stopped = true
    if (this.restartTimer) {
      clearTimeout(this.restartTimer)
      this.restartTimer = null
    }
    if (this.proc && !this.proc.killed) {
      this.proc.kill('SIGTERM')
    }
    this.proc = null
  }

  private spawnProcess(): void {
    const { command, args, cwd } = resolveEngineCommand()
    console.log(`[python-bridge] 엔진 시작: ${command} ${args.join(' ')}`)

    this.spawnedAt = Date.now()
    const proc = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    this.proc = proc

    proc.stdout?.on('data', (d: Buffer) => console.log(`[engine] ${String(d).trimEnd()}`))
    proc.stderr?.on('data', (d: Buffer) => console.log(`[engine!] ${String(d).trimEnd()}`))

    proc.on('error', (err) => {
      // spawn 자체 실패 (python 미설치 등) — exit 이벤트로 이어지지 않을 수 있음
      console.error('[python-bridge] spawn 실패:', err.message)
      if (this.proc === proc) {
        this.proc = null
        this.handleExit()
      }
    })

    proc.on('exit', (code, signal) => {
      if (this.proc !== proc) return
      this.proc = null
      console.log(`[python-bridge] 엔진 종료 (code=${code}, signal=${signal})`)
      this.handleExit()
    })
  }

  private handleExit(): void {
    if (this.stopped) return

    const aliveMs = Date.now() - this.spawnedAt
    if (aliveMs >= STABLE_ALIVE_MS) this.consecutiveFailures = 0
    this.consecutiveFailures++

    if (this.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      console.error(
        `[python-bridge] 연속 ${this.consecutiveFailures}회 실패 — 재시작 중단`
      )
      this.emit('failed')
      return
    }

    console.log(`[python-bridge] ${RESTART_DELAY_MS / 1000}초 후 재시작 (${this.consecutiveFailures}회째 실패)`)
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null
      this.spawnProcess()
    }, RESTART_DELAY_MS)
  }
}

// ── 엔진 실행 커맨드/설정 경로 ─────────────────────────────

export function engineConfigPath(): string {
  return join(app.getPath('userData'), 'engine-config.json')
}

export function templatesDir(): string {
  return join(app.getPath('userData'), 'templates')
}

/**
 * 스토어 설정을 engine-config.json으로 직렬화.
 * 설정 변경 시마다 다시 쓰고 reload_config를 보낸다.
 */
export function writeEngineConfig(): string {
  const { settings } = dashboardStore.getState()
  const dir = templatesDir()
  mkdirSync(dir, { recursive: true })
  const config = {
    captureIntervalSec: settings.captureIntervalSec,
    matchThreshold: settings.matchThreshold,
    dailyResetHour: settings.dailyResetHour,
    weeklyResetDay: settings.weeklyResetDay,
    captureRegion: settings.captureRegion,
    templatesDir: dir
  }
  const path = engineConfigPath()
  writeFileSync(path, JSON.stringify(config, null, 2), 'utf-8')
  return path
}

function resolveEngineCommand(): { command: string; args: string[]; cwd?: string } {
  const configArgs = ['--config', engineConfigPath()]

  if (is.dev) {
    // 개발 모드: 레포의 python-engine을 직접 실행 (.venv 우선)
    const engineDir = join(__dirname, '../../../python-engine')
    const venvPython =
      process.platform === 'win32'
        ? join(engineDir, '.venv', 'Scripts', 'python.exe')
        : join(engineDir, '.venv', 'bin', 'python')
    const python = existsSync(venvPython)
      ? venvPython
      : process.platform === 'win32'
        ? 'python'
        : 'python3'
    return { command: python, args: ['main.py', ...configArgs], cwd: engineDir }
  }

  // 배포 모드: PyInstaller로 빌드된 exe (extraResources로 번들 — 명세서 §7)
  const exeName = process.platform === 'win32' ? 'capture-engine.exe' : 'capture-engine'
  return { command: join(process.resourcesPath, 'engine', exeName), args: configArgs }
}
