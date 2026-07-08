import { useEffect, useRef, useState } from 'react'
import {
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

/** Web Audio 합성 차임 — 에셋/네트워크 불필요 (CSP 안전) */
function playChime(): void {
  try {
    const ctx = new AudioContext()
    const notes = [880, 1174.66, 880] // A5 → D6 → A5
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      const t = ctx.currentTime + i * 0.22
      gain.gain.setValueAtTime(0, t)
      gain.gain.linearRampToValueAtTime(0.25, t + 0.03)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2)
      osc.connect(gain).connect(ctx.destination)
      osc.start(t)
      osc.stop(t + 0.22)
    })
    setTimeout(() => void ctx.close(), 1500)
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
            playChime()
          }
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

    check()
    const timer = setInterval(check, CHECK_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [])

  return activeAlarms
}
