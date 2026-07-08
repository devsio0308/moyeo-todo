import { nativeImage } from 'electron'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { CaptureRegion, Screenshot, TemplateIndex } from '../shared/types'
import { templatesDir } from './python-bridge'
import { dashboardStore } from './store'

/**
 * 템플릿 이미지 저장소 관리.
 * 구조: <userData>/templates/<character_id>/<task_id>.png + <task_id>.json
 * (python-engine/templates/README.md 참고)
 */

/** 스크린샷에서 rect를 크롭해 (char, task) 템플릿으로 저장 */
export function saveTemplate(
  characterId: string,
  taskId: string,
  screenshot: Screenshot,
  rect: CaptureRegion
): void {
  const image = nativeImage.createFromBuffer(Buffer.from(screenshot.image, 'base64'))
  // createFromBuffer는 scaleFactor 1 → crop 좌표가 곧 이미지 픽셀
  const cropped = image.crop({
    x: rect.left,
    y: rect.top,
    width: rect.width,
    height: rect.height
  })
  if (cropped.isEmpty()) throw new Error('크롭 결과가 비어 있습니다')

  const task = dashboardStore.getState().characters[characterId]?.tasks[taskId]
  if (!task) throw new Error(`존재하지 않는 퀘스트: ${characterId}/${taskId}`)

  const dir = join(templatesDir(), characterId)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${taskId}.png`), cropped.toPNG())
  writeFileSync(
    join(dir, `${taskId}.json`),
    JSON.stringify(
      {
        period: task.period,
        threshold: task.threshold,
        // 카운트형 퀘스트(#7): 주기당 1회 쿨다운 대신 소실 후 재발화 허용
        repeatable: (task.targetCount ?? 1) > 1,
        // 등록 시점 화면 해상도(mss 픽셀) — 해상도 변경 감지용 (명세서 §4)
        screen: { width: screenshot.width, height: screenshot.height }
      },
      null,
      2
    ),
    'utf-8'
  )
}

/** 등록된 템플릿 목록: characterId → taskId[] */
export function listTemplates(): TemplateIndex {
  const root = templatesDir()
  const index: TemplateIndex = {}
  if (!existsSync(root)) return index
  for (const charDir of readdirSync(root, { withFileTypes: true })) {
    if (!charDir.isDirectory()) continue
    const tasks = readdirSync(join(root, charDir.name))
      .filter((f) => f.endsWith('.png'))
      .map((f) => f.replace(/\.png$/, ''))
    if (tasks.length > 0) index[charDir.name] = tasks
  }
  return index
}

export function deleteTemplate(characterId: string, taskId: string): void {
  const dir = join(templatesDir(), characterId)
  for (const ext of ['.png', '.json']) {
    const p = join(dir, `${taskId}${ext}`)
    if (existsSync(p)) rmSync(p)
  }
}

/** 태스크 메타(period/threshold) 변경 시 템플릿 메타 동기화 */
export function syncTemplateMeta(characterId: string, taskId: string): void {
  const dir = join(templatesDir(), characterId)
  const pngPath = join(dir, `${taskId}.png`)
  const metaPath = join(dir, `${taskId}.json`)
  if (!existsSync(pngPath) || !existsSync(metaPath)) return
  const task = dashboardStore.getState().characters[characterId]?.tasks[taskId]
  if (!task) return
  try {
    const meta = JSON.parse(readFileSync(metaPath, 'utf-8'))
    meta.period = task.period
    meta.threshold = task.threshold
    meta.repeatable = (task.targetCount ?? 1) > 1
    writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8')
  } catch {
    // 메타가 깨졌으면 다음 등록 때 재생성
  }
}
