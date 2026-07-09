import { describe, expect, it } from 'vitest'
import { parseQuestDocuments } from '../src/main/quest-catalog'

const doc = (
  id: string,
  fields: Record<string, unknown>
): { name: string; fields: Record<string, unknown> } => ({
  name: `projects/p/databases/(default)/documents/quests/${id}`,
  fields
})

describe('parseQuestDocuments', () => {
  it('정상 문서를 order 순으로 파싱한다', () => {
    const body = {
      documents: [
        doc('raid', {
          name: { stringValue: '주간 레이드' },
          period: { stringValue: 'weekly' },
          order: { integerValue: '2' }
        }),
        doc('dungeon', {
          name: { stringValue: '일일 던전' },
          period: { stringValue: 'daily' },
          order: { integerValue: '1' }
        })
      ]
    }
    expect(parseQuestDocuments(body)).toEqual([
      {
        id: 'dungeon',
        name: '일일 던전',
        period: 'daily',
        targetCount: 1,
        category: null,
        location: null
      },
      {
        id: 'raid',
        name: '주간 레이드',
        period: 'weekly',
        targetCount: 1,
        category: null,
        location: null
      }
    ])
  })

  it('category 필드를 파싱하고 허용 외 값은 무시한다 (#13)', () => {
    const body = {
      documents: [
        doc('combat', { name: { stringValue: '결계' }, category: { stringValue: '전투' } }),
        doc('barter', { name: { stringValue: '교역' }, category: { stringValue: '물물교환' } }),
        doc('invalid', { name: { stringValue: '요리' }, category: { stringValue: '낚시' } })
      ]
    }
    const items = parseQuestDocuments(body)
    expect(items.find((i) => i.id === 'combat')?.category).toBe('전투')
    expect(items.find((i) => i.id === 'barter')?.category).toBe('물물교환')
    expect(items.find((i) => i.id === 'invalid')?.category).toBeNull()
  })

  it('location 필드를 파싱한다 (#24)', () => {
    const body = {
      documents: [
        doc('barter1', {
          name: { stringValue: '엘빈: 야채볶음 2 → 상급목재 4' },
          location: { stringValue: '두갈드아일' }
        }),
        doc('no-loc', { name: { stringValue: '지역 없음' } }),
        doc('empty-loc', { name: { stringValue: '빈 지역' }, location: { stringValue: '  ' } })
      ]
    }
    const items = parseQuestDocuments(body)
    expect(items.find((i) => i.id === 'barter1')?.location).toBe('두갈드아일')
    expect(items.find((i) => i.id === 'no-loc')?.location).toBeNull()
    expect(items.find((i) => i.id === 'empty-loc')?.location).toBeNull()
  })

  it('targetCount 필드를 파싱한다 (#7)', () => {
    const body = {
      documents: [
        doc('multi', {
          name: { stringValue: '주간 던전 5회' },
          period: { stringValue: 'weekly' },
          targetCount: { integerValue: '5' }
        }),
        doc('bad-count', {
          name: { stringValue: '음수 방어' },
          targetCount: { integerValue: '-3' }
        })
      ]
    }
    const items = parseQuestDocuments(body)
    expect(items.find((i) => i.id === 'multi')?.targetCount).toBe(5)
    expect(items.find((i) => i.id === 'bad-count')?.targetCount).toBe(1) // 1 미만은 1로 클램프
  })

  it('period가 없거나 이상하면 daily로 처리', () => {
    const body = { documents: [doc('a', { name: { stringValue: '출석' } })] }
    expect(parseQuestDocuments(body)[0].period).toBe('daily')
  })

  it('name 없는 문서는 스킵', () => {
    const body = {
      documents: [
        doc('bad', { period: { stringValue: 'daily' } }),
        doc('good', { name: { stringValue: '보스' } })
      ]
    }
    const items = parseQuestDocuments(body)
    expect(items).toHaveLength(1)
    expect(items[0].id).toBe('good')
  })

  it('order 없는 문서는 뒤로 정렬', () => {
    const body = {
      documents: [
        doc('no-order', { name: { stringValue: 'ㅎ정렬끝' } }),
        doc('first', { name: { stringValue: '먼저' }, order: { integerValue: '1' } })
      ]
    }
    expect(parseQuestDocuments(body).map((i) => i.id)).toEqual(['first', 'no-order'])
  })

  it('documents가 없으면 빈 배열 (빈 컬렉션 응답)', () => {
    expect(parseQuestDocuments({})).toEqual([])
    expect(parseQuestDocuments(null)).toEqual([])
  })
})
