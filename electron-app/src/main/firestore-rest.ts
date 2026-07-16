/**
 * Firestore REST API 범용 문서 read/write (#26).
 * quest-catalog.ts는 읽기 전용 컬렉션이라 전용 파서를 쓰지만, 플레이어 데이터는
 * 임의의 중첩 구조(characters → tasks)를 그대로 왕복해야 해서 범용 변환기가 필요하다.
 * SDK 없이 fetch만 사용 — 프로젝트 전반의 방침과 동일.
 */

const FIRESTORE_TIMEOUT_MS = 10_000

type FirestoreValue =
  | { nullValue: null }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { stringValue: string }
  | { timestampValue: string }
  | { mapValue: { fields: Record<string, FirestoreValue> } }
  | { arrayValue: { values: FirestoreValue[] } }

/** JS 값 → Firestore REST Value. undefined/null은 nullValue로 통일 */
export function toFirestoreValue(v: unknown): FirestoreValue {
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

/** Firestore REST Value → JS 값 */
export function fromFirestoreValue(v: FirestoreValue): unknown {
  if ('nullValue' in v) return null
  if ('booleanValue' in v) return v.booleanValue
  if ('integerValue' in v) return Number(v.integerValue)
  if ('doubleValue' in v) return v.doubleValue
  if ('stringValue' in v) return v.stringValue
  // 콘솔에서 timestamp 타입으로 넣어도(#catalog-watch meta 문서) ISO 문자열로 그대로 비교 가능
  if ('timestampValue' in v) return v.timestampValue
  if ('arrayValue' in v) return (v.arrayValue.values ?? []).map(fromFirestoreValue)
  if ('mapValue' in v) {
    const out: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(v.mapValue.fields ?? {})) {
      out[k] = fromFirestoreValue(val)
    }
    return out
  }
  return null
}

export function toFirestoreFields(obj: Record<string, unknown>): Record<string, FirestoreValue> {
  const fields: Record<string, FirestoreValue> = {}
  for (const [k, v] of Object.entries(obj)) fields[k] = toFirestoreValue(v)
  return fields
}

export function fromFirestoreFields(
  fields: Record<string, FirestoreValue> | undefined
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(fields ?? {})) out[k] = fromFirestoreValue(v)
  return out
}

function docUrl(projectId: string, path: string): string {
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/${path}`
}

/** 문서를 읽는다. 존재하지 않으면 null (예외 아님). 그 외 실패는 throw. */
export async function getFirestoreDocument(
  projectId: string,
  path: string
): Promise<Record<string, unknown> | null> {
  const res = await fetch(docUrl(projectId, path), {
    signal: AbortSignal.timeout(FIRESTORE_TIMEOUT_MS)
  })
  if (res.status === 404) return null
  if (!res.ok) {
    throw new Error(`Firestore 읽기 실패 (HTTP ${res.status}) — 프로젝트 ID/규칙 확인`)
  }
  const body = await res.json()
  return fromFirestoreFields(body.fields)
}

/** 문서를 통째로 덮어쓴다 (없으면 생성). updateMask 없는 PATCH라 부분 필드가 아닌 전체 교체. */
export async function putFirestoreDocument(
  projectId: string,
  path: string,
  data: Record<string, unknown>
): Promise<void> {
  const res = await fetch(docUrl(projectId, path), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: toFirestoreFields(data) }),
    signal: AbortSignal.timeout(FIRESTORE_TIMEOUT_MS)
  })
  if (!res.ok) {
    throw new Error(`Firestore 쓰기 실패 (HTTP ${res.status}) — 프로젝트 ID/규칙 확인`)
  }
}
