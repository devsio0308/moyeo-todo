import React from 'react'
import ReactDOM from 'react-dom/client'
import ManageApp from './ManageApp'
import OverlayApp from './OverlayApp'
import './styles.css'

// 해시 라우팅 (#17): #overlay = 체크 전용 오버레이, 기본 = 관리 창
const Root = window.location.hash === '#overlay' ? OverlayApp : ManageApp

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
)
