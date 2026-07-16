/**
 * 오버레이 체크/카운트 조작의 실행취소/다시실행 (#undo).
 *
 * 스냅샷 방식 — 조작 직전의 characters 전체를 메모리에 쌓아두고 통째로 복원한다.
 * 연동(일일↔주간)·풀형(dailyUsed)처럼 한 조작이 여러 필드를 건드려도 역연산
 * 계산 없이 정확히 되돌아간다. 디스크에 저장하지 않음 — 앱 재시작 시 초기화.
 *
 * 안전 규칙: 체크/카운트 외의 변경(리셋, 클라우드 pull, 카탈로그 동기화,
 * 캐릭터/퀘스트 CRUD)이 일어나면 스택을 전부 비운다 — 오래된 상태를
 * 부활시키는 사고 방지.
 */

import { dashboardStore } from './store'
import type { Character } from '../shared/types'

const MAX_HISTORY = 50

let undoStack: Array<Record<string, Character>> = []
let redoStack: Array<Record<string, Character>> = []
let listener: (() => void) | null = null

export interface HistoryState {
  canUndo: boolean
  canRedo: boolean
}

/** 스택 변화 시 호출될 리스너 (renderer에 canUndo/canRedo 브로드캐스트용) */
export function setHistoryListener(cb: () => void): void {
  listener = cb
}

export function historyState(): HistoryState {
  return { canUndo: undoStack.length > 0, canRedo: redoStack.length > 0 }
}

function snapshot(): Record<string, Character> {
  return structuredClone(dashboardStore.getState().characters)
}

/** 체크/카운트 조작 직전에 호출 — 현재 상태를 실행취소 지점으로 기록 */
export function recordHistory(): void {
  undoStack.push(snapshot())
  if (undoStack.length > MAX_HISTORY) undoStack.shift()
  redoStack = []
  listener?.()
}

/** 체크/카운트 외의 변경(리셋·pull·CRUD·동기화) 시 호출 — 스택 전체 폐기 */
export function clearHistory(): void {
  if (undoStack.length === 0 && redoStack.length === 0) return
  undoStack = []
  redoStack = []
  listener?.()
}

/** @returns 되돌렸으면 true (호출자가 broadcast/push 담당) */
export function undoHistory(): boolean {
  const prev = undoStack.pop()
  if (!prev) return false
  redoStack.push(snapshot())
  dashboardStore.restoreCharacters(prev)
  listener?.()
  return true
}

export function redoHistory(): boolean {
  const next = redoStack.pop()
  if (!next) return false
  undoStack.push(snapshot())
  dashboardStore.restoreCharacters(next)
  listener?.()
  return true
}
