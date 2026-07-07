import { EventEmitter } from 'events'
import WebSocket from 'ws'
import {
  WS_URL,
  type ClientMessage,
  type EngineMessage,
  type Screenshot
} from '../shared/types'

const BACKOFF_INITIAL_MS = 1_000
const BACKOFF_MAX_MS = 10_000
const HEARTBEAT_TIMEOUT_MS = 15_000

/**
 * Python 엔진(WS 서버)에 붙는 클라이언트 (명세서 §2).
 * - 끊기면 exponential backoff(1s → 2s → 4s → ... 최대 10s)로 재접속
 * - 하트비트 15초 미수신 시 죽은 연결로 간주하고 강제 재접속
 *
 * 이벤트:
 * - 'message' (msg: EngineMessage)   — heartbeat 제외한 엔진 이벤트
 * - 'status'  (connected: boolean)
 * - 'connected'                       — 접속 직후 상태 재동기화용
 */
export class EngineWsClient extends EventEmitter {
  private ws: WebSocket | null = null
  private backoffMs = BACKOFF_INITIAL_MS
  private reconnectTimer: NodeJS.Timeout | null = null
  private watchdogTimer: NodeJS.Timeout | null = null
  private stopped = false

  connect(): void {
    if (this.stopped || this.ws) return

    const ws = new WebSocket(WS_URL)
    this.ws = ws

    ws.on('open', () => {
      this.backoffMs = BACKOFF_INITIAL_MS
      this.resetWatchdog()
      this.emit('status', true)
      this.emit('connected')
    })

    ws.on('message', (raw) => {
      let msg: EngineMessage
      try {
        msg = JSON.parse(String(raw))
      } catch {
        console.warn('[ws-client] 잘못된 메시지 무시:', String(raw).slice(0, 100))
        return
      }
      if (msg.type === 'heartbeat') {
        this.resetWatchdog()
        return
      }
      if (msg.type === 'screenshot') {
        this.resolveScreenshot(msg)
        return
      }
      this.emit('message', msg)
    })

    const onGone = (): void => {
      if (this.ws !== ws) return
      this.cleanupSocket()
      this.emit('status', false)
      this.scheduleReconnect()
    }
    ws.on('close', onGone)
    ws.on('error', onGone)
  }

  // ── 스크린샷 요청/응답 (리전 지정/템플릿 등록 UI용) ────────

  private pendingScreenshot: {
    resolve: (s: Screenshot) => void
    reject: (e: Error) => void
    timer: NodeJS.Timeout
  } | null = null

  /** 엔진에 전체 화면 스크린샷 요청. 연결 없음/실패/10초 초과 시 reject. */
  requestScreenshot(): Promise<Screenshot> {
    return new Promise((resolve, reject) => {
      if (this.pendingScreenshot) {
        reject(new Error('이미 스크린샷 요청이 진행 중입니다'))
        return
      }
      if (!this.send({ type: 'capture_screenshot' })) {
        reject(new Error('캡처 엔진이 연결되어 있지 않습니다'))
        return
      }
      const timer = setTimeout(() => {
        this.pendingScreenshot = null
        reject(new Error('스크린샷 응답 시간 초과'))
      }, 10_000)
      this.pendingScreenshot = { resolve, reject, timer }
    })
  }

  private resolveScreenshot(msg: {
    image?: string
    width?: number
    height?: number
    error?: string
  }): void {
    const pending = this.pendingScreenshot
    if (!pending) return
    this.pendingScreenshot = null
    clearTimeout(pending.timer)
    if (msg.error || !msg.image || !msg.width || !msg.height) {
      pending.reject(new Error(msg.error ?? '스크린샷 실패'))
    } else {
      pending.resolve({ image: msg.image, width: msg.width, height: msg.height })
    }
  }

  /** Electron → Python. 연결이 없으면 조용히 버린다 (재접속 시 상태 재동기화가 이를 보완). */
  send(msg: ClientMessage): boolean {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg))
      return true
    }
    return false
  }

  stop(): void {
    this.stopped = true
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    if (this.watchdogTimer) clearTimeout(this.watchdogTimer)
    this.ws?.removeAllListeners()
    this.ws?.close()
    this.ws = null
  }

  private cleanupSocket(): void {
    if (this.watchdogTimer) clearTimeout(this.watchdogTimer)
    this.watchdogTimer = null
    this.ws?.removeAllListeners()
    this.ws = null
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, this.backoffMs)
    this.backoffMs = Math.min(this.backoffMs * 2, BACKOFF_MAX_MS)
  }

  /** 하트비트 워치독 — 15초 미수신이면 연결을 끊고 재접속 루프로 */
  private resetWatchdog(): void {
    if (this.watchdogTimer) clearTimeout(this.watchdogTimer)
    this.watchdogTimer = setTimeout(() => {
      console.warn('[ws-client] 하트비트 15초 미수신 — 재접속')
      const ws = this.ws
      this.cleanupSocket()
      ws?.terminate()
      this.emit('status', false)
      this.scheduleReconnect()
    }, HEARTBEAT_TIMEOUT_MS)
  }
}
