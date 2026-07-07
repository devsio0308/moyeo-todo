import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import PickerApp from './PickerApp'
import './styles.css'

// '#picker' 해시로 열리면 영역 선택 UI, 아니면 대시보드
const Root = window.location.hash === '#picker' ? PickerApp : App

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
)
