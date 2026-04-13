import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import AppFrame from './components/common/AppFrame.jsx'
import GlobalFeedbackProvider from './components/common/GlobalFeedbackProvider.jsx'
import './styles/globals.css'

// --- GLOBAL CRASH CAPTURE FOR FIREFOX DIAGNOSTICS ---
if (typeof window !== "undefined") {
  window.__CTM_CRASH_LOG__ = []
  const capture = (type, err) => {
    window.__CTM_CRASH_LOG__.push({
      type,
      time: new Date().toISOString(),
      name: err?.name || "Error",
      message: err?.message || String(err),
      stack: err?.stack || "unavailable",
      url: window.location.href
    })
    if (window.__CTM_CRASH_LOG__.length > 10) window.__CTM_CRASH_LOG__.shift()
  }
  window.addEventListener("error", (e) => capture("window_error", e.error || e.message))
  window.addEventListener("unhandledrejection", (e) => capture("promise_rejection", e.reason))
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_startTransition: true }}>
      <GlobalFeedbackProvider>
        <AppFrame>
          <App />
        </AppFrame>
      </GlobalFeedbackProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
