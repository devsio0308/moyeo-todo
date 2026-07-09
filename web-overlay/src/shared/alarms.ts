/**
 * electron-app/src/shared/alarms.ts verbatim 복사 (#27) — 순수 함수/상수, 변경 없음.
 */

export type AlarmMode = 'sound' | 'ui' | 'off'

export interface AlarmRule {
  id: string
  keyword: string
  label: string
  schedule: { type: 'hourly' } | { type: 'daily'; hours: number[] }
  windowMs: number
}

export const ALARM_RULES: AlarmRule[] = [
  {
    id: 'ominous-rift',
    keyword: '불길한 소환의 결계',
    label: '불길한 소환의 결계 — 매시 정각',
    schedule: { type: 'hourly' },
    windowMs: 2 * 60_000
  },
  {
    id: 'field-boss',
    keyword: '필드 보스',
    label: '필드 보스 — 12 / 18 / 20 / 22시',
    schedule: { type: 'daily', hours: [12, 18, 20, 22] },
    windowMs: 30 * 60_000
  }
]

export const DEFAULT_ALARM_MODE: AlarmMode = 'sound'

export interface ActiveTrigger {
  ruleId: string
  keyword: string
  triggerAt: number
}

export function computeActiveTriggers(
  nowMs: number,
  rules: AlarmRule[] = ALARM_RULES
): ActiveTrigger[] {
  const now = new Date(nowMs)
  const hourStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    now.getHours()
  ).getTime()

  const active: ActiveTrigger[] = []
  for (const rule of rules) {
    const hits =
      rule.schedule.type === 'hourly' || rule.schedule.hours.includes(now.getHours())
    if (hits && nowMs - hourStart < rule.windowMs) {
      active.push({ ruleId: rule.id, keyword: rule.keyword, triggerAt: hourStart })
    }
  }
  return active
}
