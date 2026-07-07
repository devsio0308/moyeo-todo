import { EventEmitter } from 'events'
import WebSocket from 'ws'
import { WS_URL, type ClientMessage, type EngineMessage } from '../shared/types'

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
