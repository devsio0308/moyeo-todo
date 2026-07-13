// electron-app 스모크 테스트 드라이버 — 화면 캡처 없이 CDP(Chrome DevTools Protocol)로만
// 관리창/오버레이창의 DOM·상태를 확인한다. 새 npm 의존성 불필요 (Node 22+ 내장 fetch/WebSocket 사용).
//
// 사전 조건: electron-app 디렉터리에서 아래로 dev 서버를 remote-debugging 포트와 함께 띄워둔 상태여야 함
//   npm run dev -- --remote-debugging-port=9222
//
// 실행: node .claude/skills/run-electron-app/driver.mjs
const BASE = 'http://127.0.0.1:9222'

async function listTargets() {
  const res = await fetch(`${BASE}/json/list`)
  return res.json()
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl)
    ws.addEventListener('open', () => resolve(ws))
    ws.addEventListener('error', reject)
  })
}

function send(ws, method, params = {}) {
  return new Promise((resolve) => {
    const id = Math.floor(Math.random() * 1e9)
    const handler = (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id === id) {
        ws.removeEventListener('message', handler)
        resolve(msg.result)
      }
    }
    ws.addEventListener('message', handler)
    ws.send(JSON.stringify({ id, method, params }))
  })
}

async function evalOn(ws, expression) {
  const result = await send(ws, 'Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true
  })
  if (result.exceptionDetails) {
    return { error: result.exceptionDetails.exception?.description || JSON.stringify(result.exceptionDetails) }
  }
  return { value: result.result?.value }
}

async function main() {
  console.log('=== 1. 관리창(ManageApp) 타겟 확인 ===')
  let targets = await listTargets()
  console.log(targets.map((t) => ({ title: t.title, url: t.url })))

  const manageTarget = targets.find((t) => t.type === 'page' && !t.url.includes('#'))
  if (!manageTarget) throw new Error('관리창 타겟을 찾을 수 없음 — dev 서버가 --remote-debugging-port=9222 로 떠 있는지 확인')

  const manageWs = await connect(manageTarget.webSocketDebuggerUrl)
  await send(manageWs, 'Runtime.enable')

  console.log('\n=== 2. 관리창 DOM/상태 확인 ===')
  console.log('title:', (await evalOn(manageWs, 'document.title')).value)
  console.log(
    'side-nav 항목:',
    (await evalOn(manageWs, `[...document.querySelectorAll('.side-nav-item')].map(e => e.textContent)`)).value
  )
  console.log('에러 배지 존재 여부:', (await evalOn(manageWs, `!!document.querySelector('.badge-failed')`)).value)
  console.log(
    'preload API 노출 여부:',
    (await evalOn(manageWs, `window.api ? 'OK' : 'MISSING'`)).value
  )

  console.log('\n=== 3. 오버레이 띄우기 버튼 클릭 (DOM 이벤트 — 마우스/키보드 자동화 아님) ===')
  const clickResult = await evalOn(
    manageWs,
    `(() => {
      const btn = document.querySelector('.overlay-launch-btn')
      if (!btn) return 'BUTTON_NOT_FOUND'
      btn.click()
      return 'CLICKED: ' + btn.textContent
    })()`
  )
  console.log(clickResult)

  await new Promise((r) => setTimeout(r, 1500))

  console.log('\n=== 4. 오버레이 창 타겟 등장 확인 ===')
  targets = await listTargets()
  console.log(targets.map((t) => ({ title: t.title, url: t.url })))
  const overlayTarget = targets.find((t) => t.url.includes('#overlay'))
  if (!overlayTarget) {
    console.log('오버레이 타겟을 찾지 못함 — 실패')
    manageWs.close()
    return
  }

  const overlayWs = await connect(overlayTarget.webSocketDebuggerUrl)
  await send(overlayWs, 'Runtime.enable')

  console.log('\n=== 5. 오버레이 창 DOM 확인 ===')
  console.log(
    '타이틀바 버튼들:',
    (await evalOn(overlayWs, `[...document.querySelectorAll('.titlebar-btn, .titlebar-icon-btn')].map(e => e.textContent)`))
      .value
  )
  console.log('본문 텍스트 일부:', (await evalOn(overlayWs, `document.body.innerText.slice(0, 300)`)).value)
  console.log(
    'root 렌더 여부(자식 노드 수, 0이면 빈 화면):',
    (await evalOn(overlayWs, `document.getElementById('root')?.children.length`)).value
  )

  manageWs.close()
  overlayWs.close()
  console.log('\n=== 완료 ===')
}

main().catch((e) => {
  console.error('스모크 테스트 실패:', e)
  process.exit(1)
})
