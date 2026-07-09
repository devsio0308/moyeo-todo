/**
 * Firestore REST 클라이언트 (#27) — electron-app/src/main/firestore-rest.ts와 동일 변환기.
 * SDK 없이 fetch만 사용. 두 종류의 쓰기를 구분한다:
 * - patchTaskFields: updateMask로 건드린 필드만 부분 업데이트 (체크/카운트 — 데스크톱과
 *   동시 편집해도 서로 다른 필드면 충돌 없음)
 * - putFullDocument: 문서 전체 덮어쓰기 (리셋 캐치업처럼 다수 필드를 한 번에 바꿀 때만)
 */

import type { CloudPlayerData, TaskState } from './shared/types'

const FIRESTORE_TIMEOUT_MS = 10_000

type FirestoreValue =
  | { nullValue: null }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { stringValue: string }
  | { mapValue: { fields: Record<string, FirestoreValue> } }
  | { arrayValue: { values: FirestoreValue[] } }

function toFirestoreValue(v: unknown): FirestoreValue {
  if (v === undefined || v === null) return { nullValue: null }
  if (typeof v === 'boolean') return { booleanValue: v }
  if (typeof v === 'number') {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }
  }
  if (typeof v === 'string') return { stringValue: v }
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFirestoreValue) } }
  if (typeof v === 'object') {
    const fields: Record<string, FirestoreValue> = {}
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      fields[k] = toFirestoreValue(val)
    }
    return { mapValue: { fields } }
  }
  throw new Error(`Firestore로 변환할 수 없는 값 타입: ${typeof v}`)
}

function fromFirestoreValue(v: FirestoreValue): unknown {
  if ('nullValue' in v) return null
  if ('booleanValue' in v) return v.booleanValue
  if ('integerValue' in v) return Number(v.integerValue)
  if ('doubleValue' in v) return v.doubleValue
  if ('stringValue' in v) return v.stringValue
  if ('arrayValue' in v) return (v.arrayValue.values ?? []).map(fromFirestoreValue)
  if ('mapValue' in v) {
    const out: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(v.mapValue.fields ?? {})) out[k] = fromFirestoreValue(val)
    return out
  }
  return null
}

function toFirestoreFields(obj: Record<string, unknown>): Record<string, FirestoreValue> {
  const fields: Record<string, FirestoreValue> = {}
  for (const [k, v] of Object.entries(obj)) fields[k] = toFirestoreValue(v)
  return fields
}

function fromFirestoreFields(
  fields: Record<string, FirestoreValue> | undefined
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(fields ?? {})) out[k] = fromFirestoreValue(v)
  return out
}

function docUrl(projectId: string, path: string, query = ''): string {
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/${path}${query}`
}

function playerDocPath(gameAccountId: string): string {
  return `players/${encodeURIComponent(gameAccountId)}`
}

export class NotRegisteredError extends Error {
  constructor() {
    super('등록되지 않은 ID입니다')
    this.name = 'NotRegisteredError'
  }
}

/** 플레이어 문서 조회. 없으면 NotRegisteredError. */
export async function getPlayerData(
  projectId: string,
  gameAccountId: string
): Promise<CloudPlayerData> {
  const res = await fetch(docUrl(projectId, playerDocPath(gameAccountId)), {
    signal: AbortSignal.timeout(FIRESTORE_TIMEOUT_MS)
  })
  if (res.status === 404) throw new NotRegisteredError()
  if (!res.ok) {
    throw new Error(`Firestore 읽기 실패 (HTTP ${res.status}) — 잠시 후 다시 시도해주세요`)
  }
  const body = await res.json()
  return fromFirestoreFields(body.fields) as unknown as CloudPlayerData
}

/** 문서 전체 덮어쓰기 — 리셋 캐치업처럼 다수 필드를 한 번에 바꿀 때만 사용 */
export async function putFullDocument(
  projectId: string,
  gameAccountId: string,
  data: CloudPlayerData
): Promise<void> {
  const res = await fetch(docUrl(projectId, playerDocPath(gameAccountId)), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: toFirestoreFields(data as unknown as Record<string, unknown>) }),
    signal: AbortSignal.timeout(FIRESTORE_TIMEOUT_MS)
  })
  if (!res.ok) throw new Error(`Firestore 쓰기 실패 (HTTP ${res.status})`)
}

/**
 * 특정 캐릭터의 특정 퀘스트 필드만 부분 업데이트 (updateMask).
 * 문서 전체를 다시 보내지 않고, patch에 담긴 필드만 정확히 교체한다 — 그 사이 다른
 * 기기가 다른 퀘스트를 바꿔도 서로 덮어쓰지 않는다.
 */
export async function patchTaskFields(
  projectId: string,
  gameAccountId: string,
  characterId: string,
  taskId: string,
  patch: Partial<Pick<TaskState, 'done' | 'mode' | 'lastDoneAt' | 'count'>>
): Promise<void> {
  const prefix = `characters.${characterId}.tasks.${taskId}`
  const maskParams = Object.keys(patch)
    .map((key) => `updateMask.fieldPaths=${encodeURIComponent(`${prefix}.${key}`)}`)
    .join('&')

  const body = {
    fields: {
      characters: {
        mapValue: {
          fields: {
            [characterId]: {
              mapValue: {
                fields: {
                  tasks: {
                    mapValue: {
                      fields: {
                        [taskId]: { mapValue: { fields: toFirestoreFields(patch) } }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  const res = await fetch(docUrl(projectId, playerDocPath(gameAccountId), `?${maskParams}`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(FIRESTORE_TIMEOUT_MS)
  })
  if (!res.ok) throw new Error(`Firestore 쓰기 실패 (HTTP ${res.status})`)
}
