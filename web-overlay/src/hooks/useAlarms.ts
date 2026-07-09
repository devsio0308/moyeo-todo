/**
 * 퀘스트 알람 훅 (#27) — electron-app의 useAlarms를 웹 스토어에 맞게 이식.
 * 앱이 열려 있을 때만 동작 (탭 닫힘/백그라운드 시 자동 소멸 — 확정된 스펙).
 */

import { useEffect, useRef, useState } from 'react'
import {
  DEFAULT_ALARM_MODE,
  computeActiveTriggers,
  type AlarmMode
} from '../shared/alarms'
import { webStore } from '../store'

const CHECK_INTERVAL_MS = 5_000

export interface ActiveAlarm {
  ruleId: string
  keyword: string
}

interface ChimePattern {
  note: number
  bursts: number
  volume: number
}

const TONE_PATTERNS: Record<string, ChimePattern> = {
  'ominous-rift': { note: 622.25, bursts: 3, volume: 0.28 },
  'field-boss': { note: 932.33, bursts: 1, volume: 0.26 }
}
const DEFAULT_TONE: ChimePattern = { note: 880, bursts: 1, volume: 0.26 }

const STRIKES_PER_BURST = 3
const STRIKE_GAP_SEC = 0.1
const BURST_GAP_SEC = 0.45
const DECAY_SEC = 0.38

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

function hasUncompletedMatching(
  data: ReturnType<typeof webStore.getState>['data'],
  keyword: string
): boolean {
  if (!data) return false
  for (const character of Object.values(data.characters)) {
    for (const task of Object.values(character.tasks)) {
      if (!task.done && task.displayName.includes(keyword)) return true
    }
  }
  return false
}

/** 알람 모드는 웹에서는 항상 기본값(UI+소리) — 규칙별 설정 UI는 두지 않음 (범위 축소) */
export function useAlarms(): ActiveAlarm[] {
  const [activeAlarms, setActiveAlarms] = useState<ActiveAlarm[]>([])
  const played = useRef<Set<string>>(new Set())

  useEffect(() => {
    const check = (): void => {
      const { data } = webStore.getState()
      const triggers = computeActiveTriggers(Date.now())

      const alarms: ActiveAlarm[] = []
      for (const trigger of triggers) {
        const mode: AlarmMode = DEFAULT_ALARM_MODE
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

      setActiveAlarms((prev) =>
        prev.length === alarms.length && prev.every((a, i) => a.ruleId === alarms[i].ruleId)
          ? prev
          : alarms
      )
    }

    check()
    const timer = setInterval(check, CHECK_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [])

  return activeAlarms
}
