/**
 * 퀘스트 알람 규칙 + 트리거 계산 (#11).
 * Electron 의존 없는 순수 로직 — vitest로 테스트한다.
 *
 * 규칙: 퀘스트 이름에 keyword가 포함된 미완료 퀘스트가 있으면
 * 지정된 정각부터 ALARM_WINDOW_MS 동안 알람(UI 펄스 + 옵션에 따라 소리 1회).
 */

export type AlarmMode = 'sound' | 'ui' | 'off' // sound = UI+소리

export interface AlarmRule {
  id: string
  /** 퀘스트 이름에 이 키워드가 포함되면 알람 대상 (키워드당 퀘스트 1개 전제) */
  keyword: string
  label: string
  schedule: { type: 'hourly' } | { type: 'daily'; hours: number[] }
  /** 정각부터 UI 표시가 유지되는 시간 (ms) */
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
    windowMs: 30 * 60_000 // 정각부터 30분간 표시
  }
]

export const DEFAULT_ALARM_MODE: AlarmMode = 'sound'

export interface ActiveTrigger {
  ruleId: string
  keyword: string
  /** 트리거 정각 (epoch ms) — 사운드 1회 재생 dedupe 키로 사용 */
  triggerAt: number
}

/** 현재 시각(로컬)에 활성인 알람 트리거 목록 — 규칙별 window 안이어야 함 */
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
