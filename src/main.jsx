import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import AppErrorBoundary from './components/common/AppErrorBoundary.jsx'
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
    
    // If the error happens before React can mount, try to show a minimal UI
    const root = document.getElementById('root')
    if (root && !root.hasChildNodes()) {
      root.innerHTML = `
        <div style="padding: 24px; font-family: sans-serif; text-align: center; color: #333;">
          <h1 style="color: #db2777;">CTMerchant Error</h1>
          <p>The application encountered a critical startup error.</p>
          <div style="background: #f1f5f9; padding: 16px; border-radius: 8px; font-family: monospace; text-align: left; font-size: 12px; margin-top: 20px; border: 1px solid #e2e8f0; overflow: auto;">
            <strong>${err?.name || 'Error'}:</strong> ${err?.message || String(err)}
          </div>
          <button onclick="window.location.reload()" style="margin-top: 24px; background: #131921; color: white; border: none; padding: 12px 24px; border-radius: 8px; font-weight: bold; cursor: pointer;">
            Retry Startup
          </button>
        </div>
      `
    }

    if (window.__CTM_CRASH_LOG__.length > 10) window.__CTM_CRASH_LOG__.shift()
  }
  window.addEventListener("error", (e) => capture("window_error", e.error || e.message))
  window.addEventListener("unhandledrejection", (e) => capture("promise_rejection", e.reason))
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_startTransition: true }}>
      <AppErrorBoundary resetKey={window.location.pathname}>
        <GlobalFeedbackProvider>
          <AppFrame>
            <App />
          </AppFrame>
        </GlobalFeedbackProvider>
      </AppErrorBoundary>
    </BrowserRouter>
  </React.StrictMode>,
)
