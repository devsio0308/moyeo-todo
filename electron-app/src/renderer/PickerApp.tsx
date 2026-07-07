import { useCallback, useEffect, useRef, useState } from 'react'
import type { Screenshot } from '../shared/types'

interface DragRect {
  x1: number
  y1: number
  x2: number
  y2: number
}

/**
 * 전체 화면 영역 선택 UI (#picker 해시로 열리는 별도 창).
 * 엔진 스크린샷 위에서 드래그 → 이미지 픽셀 좌표로 환산해 main에 전달.
 */
export default function PickerApp(): React.JSX.Element {
  const [screenshot, setScreenshot] = useState<Screenshot | null>(null)
  const [message, setMessage] = useState('')
  const [drag, setDrag] = useState<DragRect | null>(null)
  const dragging = useRef(false)

  useEffect(() => {
    return window.api.picker.onInit(({ screenshot, message }) => {
      setScreenshot(screenshot)
      setMessage(message)
    })
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') window.api.picker.cancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const finish = useCallback(
    (rect: DragRect): void => {
      if (!screenshot) return
      // 창 좌표 → 이미지 픽셀 좌표 (창은 디스플레이 전체를 덮는다)
      const scaleX = screenshot.width / window.innerWidth
      const scaleY = screenshot.height / window.innerHeight
      const left = Math.round(Math.min(rect.x1, rect.x2) * scaleX)
      const top = Math.round(Math.min(rect.y1, rect.y2) * scaleY)
      const width = Math.round(Math.abs(rect.x2 - rect.x1) * scaleX)
      const height = Math.round(Math.abs(rect.y2 - rect.y1) * scaleY)
      if (width < 8 || height < 8) return // 실수 클릭 방지
      window.api.picker.done({ left, top, width, height })
    },
    [screenshot]
  )

  const sel = drag
    ? {
        left: Math.min(drag.x1, drag.x2),
        top: Math.min(drag.y1, drag.y2),
        width: Math.abs(drag.x2 - drag.x1),
        height: Math.abs(drag.y2 - drag.y1)
      }
    : null

  return (
    <div
      className="picker-root"
      onMouseDown={(e) => {
        dragging.current = true
        setDrag({ x1: e.clientX, y1: e.clientY, x2: e.clientX, y2: e.clientY })
      }}
      onMouseMove={(e) => {
        if (!dragging.current) return
        setDrag((d) => (d ? { ...d, x2: e.clientX, y2: e.clientY } : d))
      }}
      onMouseUp={() => {
        dragging.current = false
        if (drag) finish(drag)
      }}
    >
      {screenshot && (
        <img
          className="picker-screenshot"
          src={`data:image/png;base64,${screenshot.image}`}
          alt=""
          draggable={false}
        />
      )}
      <div className="picker-dim" />
      {sel && sel.width > 0 && (
        <div
          className="picker-selection"
          style={{ left: sel.left, top: sel.top, width: sel.width, height: sel.height }}
        >
          <span className="picker-size">
            {screenshot
              ? `${Math.round((sel.width * screenshot.width) / window.innerWidth)}×${Math.round(
                  (sel.height * screenshot.height) / window.innerHeight
                )}px`
              : ''}
          </span>
        </div>
      )}
      <div className="picker-help">
        {message} <kbd>ESC</kbd> 취소
      </div>
    </div>
  )
}
