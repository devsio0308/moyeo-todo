import { useEffect, useRef, useState } from 'react'
import {
  ALARM_RULES,
  DEFAULT_ALARM_MODE,
  computeActiveTriggers,
  type AlarmMode
} from '../../shared/alarms'
import type { StoreShape } from '../../shared/types'
import { useDashboardStore } from '../store/useDashboardStore'

const CHECK_INTERVAL_MS = 5_000

/** 어느 캐릭터든 keyword를 포함한 미완료 퀘스트가 있는지 */
function hasUncompletedMatching(data: StoreShape | null, keyword: string): boolean {
  if (!data) return false
  for (const character of Object.values(data.characters)) {
    for (const task of Object.values(character.tasks)) {
      if (!task.done && task.displayName.includes(keyword)) return true
    }
  }
  return false
}

/** 규칙별 알람음 패턴 — 3연타를 기본 단위로, 반복 횟수와 음으로 구분 */
interface TonePattern {
  /** 기본 주파수 (Hz) */
  note: number
  /** 3연타 반복 횟수 */
  bursts: number
  volume: number
}

const TONE_PATTERNS: Record<string, TonePattern> = {
  // 결계: 낮은 D#5 — 3연타 ×3
  'ominous-rift': { note: 622.25, bursts: 3, volume: 0.28 },
  // 필드 보스: A#5 — 3연타 ×1. 결계(D#5)와 같은 옥타브의 완전5도 — 동시에 울리면 자연스러운 화음
  'field-boss': { note: 932.33, bursts: 1, volume: 0.26 }
}

const DEFAULT_TONE: TonePattern = { note: 880, bursts: 1, volume: 0.26 }

const STRIKES_PER_BURST = 3
const STRIKE_GAP_SEC = 0.1
const BURST_GAP_SEC = 0.45
const DECAY_SEC = 0.38

/** Web Audio 알람음 — 부드러운 sine 단일 톤의 3연타 (에셋/네트워크 불필요, CSP 안전) */
function playChime(ruleId?: string): void {
  try {
    const { note, bursts, volume } = (ruleId && TONE_PATTERNS[ruleId]) || DEFAULT_TONE
    const ctx = new AudioContext()
    const burstLen = (STRIKES_PER_BURST - 1) * STRIKE_GAP_SEC

    for (let b = 0; b < bursts; b++) {
      const burstStart = ctx.currentTime + b * (burstLen + BURST_GAP_SEC)
      for (let s = 0; s < STRIKES_PER_BURST; s++) {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.value = note
        const t = burstStart + s * STRIKE_GAP_SEC
        // 부드러운 어택(15ms) → 자연 감쇠. 마지막 타는 살짝 길게 울림
        const decay = s === STRIKES_PER_BURST - 1 ? DECAY_SEC * 1.6 : DECAY_SEC
        gain.gain.setValueAtTime(0, t)
        gain.gain.linearRampToValueAtTime(volume, t + 0.015)
        gain.gain.exponentialRampToValueAtTime(0.0005, t + decay)
        osc.connect(gain).connect(ctx.destination)
        osc.start(t)
        osc.stop(t + decay + 0.05)
      }
    }

    const totalMs = (bursts * (burstLen + BURST_GAP_SEC) + DECAY_SEC + 0.5) * 1000
    setTimeout(() => void ctx.close(), totalMs)
  } catch (e) {
    console.warn('[alarm] 사운드 재생 실패:', e)
  }
}

/** 지금 하이라이트해야 하는 알람 (규칙별 색상 구분용) */
export interface ActiveAlarm {
  ruleId: string
  keyword: string
}

/**
 * 퀘스트 알람 훅 (#11).
 * 5초 주기로 트리거를 확인해:
 * - 반환값: 지금 하이라이트할 알람 목록 (미완료 매칭 퀘스트가 있을 때만)
 * - 부수효과: 'sound' 모드 규칙은 트리거당 1회 차임 재생
 */
export function useAlarms(): ActiveAlarm[] {
  const [activeAlarms, setActiveAlarms] = useState<ActiveAlarm[]>([])
  // (ruleId:triggerAt) → 재생 완료 표시. 창 하나당 1회만 울리게
  const played = useRef<Set<string>>(new Set())
  // dev 테스트용 강제 알람 (__alarmTest) — until까지 하이라이트 유지
  const forced = useRef<{ alarm: ActiveAlarm; until: number } | null>(null)

  useEffect(() => {
    const check = (): void => {
      const { data } = useDashboardStore.getState()
      const alarmModes = data?.settings.alarmModes ?? {}
      const triggers = computeActiveTriggers(Date.now())

      const alarms: ActiveAlarm[] = []
      for (const trigger of triggers) {
        const mode: AlarmMode = alarmModes[trigger.ruleId] ?? DEFAULT_ALARM_MODE
        if (mode === 'off') continue
        if (!hasUncompletedMatching(data, trigger.keyword)) continue

        alarms.push({ ruleId: trigger.ruleId, keyword: trigger.keyword })

        if (mode === 'sound') {
          const key = `${trigger.ruleId}:${trigger.triggerAt}`
          if (!played.current.has(key)) {
            played.current.add(key)
            playChime(trigger.ruleId)
          }
        }
      }

      // dev 강제 알람 병합 (__alarmTest — 실제 스케줄과 무관하게 하이라이트 유지)
      if (forced.current) {
        if (Date.now() < forced.current.until) {
          if (!alarms.some((a) => a.ruleId === forced.current?.alarm.ruleId)) {
            alarms.push(forced.current.alarm)
          }
        } else {
          forced.current = null
        }
      }

      // 오래된 재생 기록 정리 (하루 지난 키)
      if (played.current.size > 100) {
        const cutoff = Date.now() - 86_400_000
        played.current = new Set(
          [...played.current].filter((k) => Number(k.split(':')[1]) >= cutoff)
        )
      }

      setActiveAlarms((prev) =>
        prev.length === alarms.length && prev.every((a, i) => a.ruleId === alarms[i].ruleId)
          ? prev
          : alarms
      )
    }

    // dev 전용: DevTools 콘솔에서 강제 알람 테스트
    //   __alarmTest()                    → 결계 알람 30초 (차임 + 하이라이트)
    //   __alarmTest('field-boss', 60)   → 필드 보스 알람 60초
    if (import.meta.env.DEV) {
      ;(window as unknown as Record<string, unknown>).__alarmTest = (
        ruleId: string = 'ominous-rift',
        seconds: number = 30
      ): string => {
        const rule = ALARM_RULES.find((r) => r.id === ruleId)
        if (!rule) return `알 수 없는 규칙 — 사용 가능: ${ALARM_RULES.map((r) => r.id).join(', ')}`
        forced.current = {
          alarm: { ruleId: rule.id, keyword: rule.keyword },
          until: Date.now() + seconds * 1000
        }
        playChime(rule.id)
        check()
        return `알람 강제 발동: ${rule.label} — ${seconds}초간 하이라이트`
      }
    }

    check()
    const timer = setInterval(check, CHECK_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [])

  return activeAlarms
}
