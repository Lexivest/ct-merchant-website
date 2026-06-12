import { useState } from "react"
import { Link } from "react-router-dom"

const STORAGE_KEY = "ctm_cookie_notice_acknowledged"

// Show the notice unless it was already acknowledged. Derived once as lazy
// initial state (client-only SPA) so there's no set-state-in-effect and no
// first-render flash.
function readInitialVisible() {
  try {
    return !localStorage.getItem(STORAGE_KEY)
  } catch {
    // localStorage blocked — don't show the notice
    return false
  }
}

export default function CookieNotice() {
  const [visible, setVisible] = useState(readInitialVisible)

  function handleAcknowledge() {
    try {
      localStorage.setItem(STORAGE_KEY, "1")
    } catch {
      // ignore
    }
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="cookie-notice" role="region" aria-label="Cookie notice">
      <p className="cookie-notice-text">
        CTMerchant uses cookies and device storage for authentication, security,
        and service functionality.{" "}
        <Link to="/privacy" className="cookie-notice-link">
          Privacy Policy
        </Link>
      </p>
      <button
        className="cookie-notice-btn"
        onClick={handleAcknowledge}
        aria-label="Acknowledge cookie notice"
      >
        Got it
      </button>
    </div>
  )
}
