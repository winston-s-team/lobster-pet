import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import DetailPanel from './components/DetailPanel'
import './App.css'

const params = new URLSearchParams(window.location.search)
const mode = params.get('mode')

if (mode === 'detail') {
  document.documentElement.style.background = '#1a1b2e'
  document.documentElement.style.height = '100%'
  document.documentElement.style.overflow = 'hidden'
  document.body.style.background = '#1a1b2e'
  document.body.style.height = '100%'
  document.body.style.overflow = 'hidden'
  const root = document.getElementById('root')
  if (root) { root.style.height = '100%'; root.style.overflow = 'hidden'; root.classList.add('detail-root') }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {mode === 'detail' ? <DetailPanel /> : <App />}
  </React.StrictMode>,
)
