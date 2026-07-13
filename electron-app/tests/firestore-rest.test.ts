import { describe, expect, it } from 'vitest'
import {
  fromFirestoreFields,
  fromFirestoreValue,
  toFirestoreFields,
  toFirestoreValue
} from '../src/main/firestore-rest'

describe('toFirestoreValue / fromFirestoreValue', () => {
  it('원시 타입을 왕복한다', () => {
    expect(fromFirestoreValue(toFirestoreValue('한글 문자열'))).toBe('한글 문자열')
    expect(fromFirestoreValue(toFirestoreValue(true))).toBe(true)
    expect(fromFirestoreValue(toFirestoreValue(false))).toBe(false)
    expect(fromFirestoreValue(toFirestoreValue(null))).toBeNull()
    expect(fromFirestoreValue(toFirestoreValue(undefined))).toBeNull()
  })

  it('정수와 실수를 구분해 왕복한다', () => {
    expect(toFirestoreValue(7)).toEqual({ integerValue: '7' })
    expect(fromFirestoreValue(toFirestoreValue(7))).toBe(7)
    expect(toFirestoreValue(0.85)).toEqual({ doubleValue: 0.85 })
    expect(fromFirestoreValue(toFirestoreValue(0.85))).toBe(0.85)
    expect(fromFirestoreValue(toFirestoreValue(0))).toBe(0)
  })

  it('배열을 왕복한다', () => {
    const arr = ['character_01', 'character_02']
    expect(fromFirestoreValue(toFirestoreValue(arr))).toEqual(arr)
  })

  it('빈 배열/빈 객체를 왕복한다', () => {
    expect(fromFirestoreValue(toFirestoreValue([]))).toEqual([])
    expect(fromFirestoreValue(toFirestoreValue({}))).toEqual({})
  })

  it('중첩 맵(characters → tasks 구조)을 왕복한다', () => {
    const data = {
      characters: {
        character_01: {
          displayName: '쥐시오',
          tasks: {
            task_01: {
              done: true,
              lastDoneAt: 1720000000,
              displayName: '요일 던전',
              period: 'daily',
              targetCount: 7,
              count: 3,
              category: '전투',
              location: '두갈드아일',
              excluded: false
            }
          }
        }
      },
      characterOrder: ['character_01'],
      lastDailyResetAt: null,
      lastWeeklyResetAt: 1720000000,
      dailyResetHour: 6,
      weeklyResetDay: 1
    }
    const roundTripped = fromFirestoreFields(toFirestoreFields(data))
    expect(roundTripped).toEqual(data)
  })
})

describe('toFirestoreFields / fromFirestoreFields', () => {
  it('빈 객체를 왕복한다', () => {
    expect(fromFirestoreFields(toFirestoreFields({}))).toEqual({})
  })

  it('fromFirestoreFields(undefined)는 빈 객체 (문서 없음 대비)', () => {
    expect(fromFirestoreFields(undefined)).toEqual({})
  })
})
