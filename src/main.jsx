import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

// A tab opened before a new deploy may request code files that changed; reload once to get the new version.
window.addEventListener('vite:preloadError', (e) => {
  if (sessionStorage.getItem('bita-reloaded')) return
  e.preventDefault()
  sessionStorage.setItem('bita-reloaded', '1')
  location.reload()
})
window.addEventListener('load', () => setTimeout(() => sessionStorage.removeItem('bita-reloaded'), 10000))

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {}))
}
