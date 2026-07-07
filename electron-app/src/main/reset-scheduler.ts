import { BrowserWindow, powerMonitor } from 'electron'
import { dashboardStore } from './store'
import { computeResets } from './reset-logic'

const COMPLEMENT_CHECK_INTERVAL_MS = 60_000

/**
 * 자정/주간 리셋 스케줄러 (명세서 §6).
 *
 * 단순 setInterval 자정 대기 금지 — 절전/슬립 중 타이머가 멈춰 경계를 놓친다.
 * 대신 다음 시점마다 day-boundary 비교로 따라잡는다:
 *  - 앱 시작 직후
 *  - 창 show/focus (포그라운드 복귀)
 *  - 절전 해제 / 화면 잠금 해제 (powerMonitor)
 *  - 1분 주기 보완 체크 (앱이 계속 떠 있는 경우용 — 경계 판단은 어디까지나 비교 방식)
 *
 * 리셋 시 mode(auto/manual) 구분 없이 전체 초기화.
 */
export class ResetScheduler {
  private timer: NodeJS.Timeout | null = null
  private detachWindow: (() => void) | null = null

  constructor(private onAfterReset: () => void) {}

  start(): void {
    this.check()
    powerMonitor.on('resume', this.check)
    powerMonitor.on('unlock-screen', this.check)
    this.timer = setInterval(this.check, COMPLEMENT_CHECK_INTERVAL_MS)
  }

  /** 창 생명주기 이벤트에 붙인다 (창 재생성 시 재호출) */
  attachWindow(win: BrowserWindow): void {
    this.detachWindow?.()
    win.on('show', this.check)
    win.on('focus', this.check)
    this.detachWindow = () => {
      if (!win.isDestroyed()) {
        win.removeListener('show', this.check)
        win.removeListener('focus', this.check)
      }
    }
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.detachWindow?.()
    powerMonitor.removeListener('resume', this.check)
    powerMonitor.removeListener('unlock-screen', this.check)
  }

  private check = (): void => {
    const now = Math.floor(Date.now() / 1000)
    const state = dashboardStore.getState()
    const decision = computeResets(
      state.lastDailyResetAt,
      state.lastWeeklyResetAt,
      state.settings,
      now
    )

    let changed = false

    if (decision.daily === 'reset') {
      dashboardStore.resetTasks('daily', now)
      console.log('[reset] 일일 숙제 리셋 실행')
      changed = true
    } else if (decision.daily === 'baseline') {
      dashboardStore.markResetBaseline('daily', now)
    }

    if (decision.weekly === 'reset') {
      dashboardStore.resetTasks('weekly', now)
      console.log('[reset] 주간 숙제 리셋 실행')
      changed = true
    } else if (decision.weekly === 'baseline') {
      dashboardStore.markResetBaseline('weekly', now)
    }

    if (changed) this.onAfterReset()
  }
}
