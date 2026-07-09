import { BrowserWindow, ipcMain } from 'electron'
import { dashboardStore } from './store'
import { openPicker } from './picker-window'
import { syncQuestCatalogOnce } from './quest-catalog'
import { registerGameAccount } from './cloud-sync'
import { deleteTemplate, listTemplates, saveTemplate, syncTemplateMeta } from './templates'
import type { Screenshot, Settings, TaskMode, TaskPeriod, TaskState } from '../shared/types'

interface IpcCallbacks {
  /** settings mutation 직후 호출 — 엔진 설정 파일 갱신/리로드용 */
  onSettingsChanged?: () => void
  /** 엔진에 전체 화면 스크린샷 요청 (연결 없으면 reject) */
  requestScreenshot?: () => Promise<Screenshot>
}

/**
 * renderer ↔ main IPC.
 * 모든 store mutation은 최신 전체 상태를 반환하고,
 * 동시에 'store:changed'로 전체 창에 브로드캐스트한다 (#17 — 두 창 상태 공유).
 */
export function registerIpcHandlers(
  broadcastAll: (channel: string, payload: unknown) => void,
  callbacks: IpcCallbacks = {}
): void {
  const broadcast = (): void => {
    broadcastAll('store:changed', dashboardStore.getState())
  }

  ipcMain.handle('store:get-state', () => dashboardStore.getState())

  ipcMain.handle('store:add-character', (_e, displayName: string) => {
    const state = dashboardStore.addCharacter(displayName)
    broadcast()
    return state
  })

  ipcMain.handle('store:remove-character', (_e, characterId: string) => {
    const state = dashboardStore.removeCharacter(characterId)
    broadcast()
    return state
  })

  ipcMain.handle('store:rename-character', (_e, characterId: string, displayName: string) => {
    const state = dashboardStore.renameCharacter(characterId, displayName)
    broadcast()
    return state
  })

  ipcMain.handle('store:reorder-characters', (_e, order: string[]) => {
    const state = dashboardStore.reorderCharacters(order)
    broadcast()
    return state
  })

  ipcMain.handle(
    'store:add-task',
    (
      _e,
      characterId: string,
      displayName: string,
      period: TaskPeriod,
      targetCount?: number,
      category?: import('../shared/types').QuestCategory | null,
      location?: string | null
    ) => {
      const state = dashboardStore.addTask(
        characterId,
        displayName,
        period,
        null,
        targetCount,
        category ?? null,
        location ?? null
      )
      broadcast()
      return state
    }
  )

  ipcMain.handle(
    'store:increment-task',
    (_e, characterId: string, taskId: string, delta: number) => {
      const state = dashboardStore.incrementTask(characterId, taskId, delta)
      broadcast()
      return state
    }
  )

  ipcMain.handle(
    'store:set-task-excluded',
    (_e, characterId: string, taskId: string, excluded: boolean) => {
      const state = dashboardStore.setTaskExcluded(characterId, taskId, excluded)
      broadcast()
      return state
    }
  )

  ipcMain.handle('store:remove-task', (_e, characterId: string, taskId: string) => {
    const state = dashboardStore.removeTask(characterId, taskId)
    broadcast()
    return state
  })

  ipcMain.handle(
    'store:update-task',
    (
      _e,
      characterId: string,
      taskId: string,
      patch: Partial<
        Pick<
          TaskState,
          'displayName' | 'period' | 'threshold' | 'category' | 'targetCount' | 'location'
        >
      >
    ) => {
      const state = dashboardStore.updateTask(characterId, taskId, patch)
      if (
        patch.period !== undefined ||
        patch.threshold !== undefined ||
        patch.targetCount !== undefined // repeatable 메타에 영향 (#7)
      ) {
        // 템플릿 메타(period/threshold/repeatable)도 함께 갱신 후 엔진 리로드
        syncTemplateMeta(characterId, taskId)
        callbacks.onSettingsChanged?.()
      }
      broadcast()
      return state
    }
  )

  ipcMain.handle(
    'store:set-task-done',
    (_e, characterId: string, taskId: string, done: boolean, mode: TaskMode) => {
      const state = dashboardStore.setTaskDone(characterId, taskId, done, mode)
      broadcast()
      return state
    }
  )

  ipcMain.handle('store:update-settings', (_e, patch: Partial<Settings>) => {
    const state = dashboardStore.updateSettings(patch)
    callbacks.onSettingsChanged?.()
    broadcast()
    return state
  })

  // ── 리전 지정 / 템플릿 등록 플로우 (명세서 §5 SettingsPanel) ──

  /** 요청한 창을 숨긴 채 엔진 스크린샷 → 픽커로 영역 선택 (#17: sender 기준) */
  const pickRect = async (
    sender: Electron.WebContents,
    message: string
  ): Promise<{
    rect: import('../shared/types').CaptureRegion | null
    screenshot: Screenshot
  }> => {
    if (!callbacks.requestScreenshot) throw new Error('스크린샷 기능이 초기화되지 않았습니다')
    const win = BrowserWindow.fromWebContents(sender)
    const wasVisible = win?.isVisible() ?? false
    win?.hide()
    try {
      // 창 숨김이 화면에 반영될 시간 (컴포지터 지연)
      await new Promise((r) => setTimeout(r, 300))
      const screenshot = await callbacks.requestScreenshot()
      const rect = await openPicker(screenshot, message)
      return { rect, screenshot }
    } finally {
      if (wasVisible) win?.show()
    }
  }

  ipcMain.handle('flow:pick-region', async (e) => {
    const { rect } = await pickRect(e.sender, '퀘스트 완료 팝업이 뜨는 영역을 드래그하세요')
    if (!rect) return null // 취소
    const state = dashboardStore.updateSettings({ captureRegion: rect })
    callbacks.onSettingsChanged?.()
    broadcast()
    return state
  })

  ipcMain.handle('flow:clear-region', () => {
    const state = dashboardStore.updateSettings({ captureRegion: null })
    callbacks.onSettingsChanged?.()
    broadcast()
    return state
  })

  ipcMain.handle('flow:register-template', async (e, characterId: string, taskId: string) => {
    const { rect, screenshot } = await pickRect(
      e.sender,
      '이 퀘스트의 완료 팝업(고유한 부분)을 드래그로 지정하세요'
    )
    if (!rect) return null // 취소
    saveTemplate(characterId, taskId, screenshot, rect)
    callbacks.onSettingsChanged?.() // 엔진이 새 템플릿을 읽도록 reload
    return listTemplates()
  })

  ipcMain.handle('template:list', () => listTemplates())

  ipcMain.handle('template:delete', (_e, characterId: string, taskId: string) => {
    deleteTemplate(characterId, taskId)
    callbacks.onSettingsChanged?.()
    return listTemplates()
  })

  // ── 퀘스트 카탈로그 동기화 (#4) ─────────────────────────

  ipcMain.handle('catalog:sync', async () => {
    const result = await syncQuestCatalogOnce()
    if (result.ok) broadcast()
    return result
  })

  // ── 게임계정 ID 기반 Firestore 동기화 (#26) ─────────────

  ipcMain.handle('cloud:register', async (_e, gameAccountId: string) => {
    const result = await registerGameAccount(gameAccountId)
    if (result.ok) broadcast()
    return result
  })
}
