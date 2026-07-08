import { describe, expect, it } from 'vitest'
import { ALARM_RULES, computeActiveTriggers } from '../src/shared/alarms'

/** 로컬 타임존 기준 epoch ms */
const at = (h: number, m: number, s = 0): number =>
  new Date(2026, 6, 8, h, m, s).getTime() // 2026-07-08 (수)

const ids = (nowMs: number): string[] =>
  computeActiveTriggers(nowMs).map((t) => t.ruleId)

describe('computeActiveTriggers', () => {
  it('결계: 매시 정각부터 2분간 활성', () => {
    expect(ids(at(9, 0))).toContain('ominous-rift')
    expect(ids(at(9, 1, 59))).toContain('ominous-rift')
    expect(ids(at(9, 2))).not.toContain('ominous-rift')
    expect(ids(at(9, 30))).not.toContain('ominous-rift')
  })

  it('필드 보스: 12/18/20/22시 정각부터 30분간 활성', () => {
    expect(ids(at(12, 0))).toContain('field-boss')
    expect(ids(at(12, 29, 59))).toContain('field-boss')
    expect(ids(at(12, 30))).not.toContain('field-boss')
    expect(ids(at(18, 15))).toContain('field-boss')
    expect(ids(at(20, 5))).toContain('field-boss')
    expect(ids(at(22, 25))).toContain('field-boss')
  })

  it('필드 보스: 지정 외 시각에는 비활성', () => {
    expect(ids(at(13, 0))).not.toContain('field-boss')
    expect(ids(at(21, 10))).not.toContain('field-boss')
  })

  it('12시 정각에는 두 알람 모두 활성 (결계는 매시이므로)', () => {
    const active = ids(at(12, 1))
    expect(active).toContain('ominous-rift')
    expect(active).toContain('field-boss')
  })

  it('triggerAt은 해당 정각 (사운드 dedupe 키)', () => {
    const triggers = computeActiveTriggers(at(18, 10))
    const fieldBoss = triggers.find((t) => t.ruleId === 'field-boss')
    expect(fieldBoss?.triggerAt).toBe(at(18, 0))
  })

  it('키워드가 규칙에 연결되어 있다', () => {
    const rift = ALARM_RULES.find((r) => r.id === 'ominous-rift')
    expect(rift?.keyword).toBe('불길한 소환의 결계')
    const boss = ALARM_RULES.find((r) => r.id === 'field-boss')
    expect(boss?.keyword).toBe('필드 보스')
  })
})
