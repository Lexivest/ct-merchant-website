import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import ctmLogo from "../../assets/images/logo.jpg"

const GlobalFeedbackContext = createContext(null)

const SUCCESS_PATTERN =
  /(success|successful|submitted|saved|updated|deleted|approved|copied|uploaded|sent|verified|done|completed|activated)/i
const ERROR_PATTERN =
  /(fail|failed|error|unable|denied|invalid|missing|blocked|restricted|offline|not found|cancelled|canceled|cannot|can't|could not|warning|exceeds|too large)/i

function inferType(message = "") {
  const text = String(message || "").trim()
  if (!text) return "info"
  if (/^[✅✔]/.test(text)) return "success"
  if (/^[⚠❌⛔]/.test(text)) return "error"
  if (ERROR_PATTERN.test(text)) return "error"
  if (SUCCESS_PATTERN.test(text)) return "success"
  return "info"
}

function normalizePayload(payload) {
  if (payload && typeof payload === "object") {
    const message = String(payload.message || payload.text || "")
    const type = payload.type || inferType(message)
    return {
      type,
      title: payload.title || (type === "success" ? "Success" : type === "error" ? "Action Failed" : "Notice"),
      message,
      confirmText: payload.confirmText || "Continue",
      autoCloseMs: Number(payload.autoCloseMs) > 0 ? Number(payload.autoCloseMs) : null,
    }
  }

  const message = String(payload ?? "")
  const type = inferType(message)
  return {
    type,
    title: type === "success" ? "Success" : type === "error" ? "Action Failed" : "Notice",
    message,
    confirmText: "Continue",
    autoCloseMs: null,
  }
}

function modalTone(type) {
  if (type === "success") {
    return {
      ring: "ring-emerald-200",
      badgeBg: "bg-emerald-100",
      badgeText: "text-emerald-700",
      button: "bg-emerald-600 hover:bg-emerald-700",
    }
  }
  if (type === "error") {
    return {
      ring: "ring-rose-200",
      badgeBg: "bg-rose-100",
      badgeText: "text-rose-700",
      button: "bg-rose-600 hover:bg-rose-700",
    }
  }
  return {
    ring: "ring-slate-200",
    badgeBg: "bg-slate-100",
    badgeText: "text-slate-700",
    button: "bg-pink-600 hover:bg-pink-700",
  }
}

function GlobalFeedbackModal({ item, onClose }) {
  if (!item) return null

  const tone = modalTone(item.type)

  return (
    <div
      className="fixed inset-0 z-[12000] flex items-center justify-center bg-slate-900/55 px-4 py-6 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-live="assertive"
    >
      <div className={`w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl ring-2 ${tone.ring}`}>
        <div className="mb-4 flex items-center gap-3">
          <div className="h-11 w-11 overflow-hidden rounded-xl border border-slate-200 bg-white">
            <img src={ctmLogo} alt="CTM" className="h-full w-full object-cover" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.13em] text-slate-500">CTMerchant</p>
            <h3 className="text-lg font-black text-slate-900">{item.title}</h3>
          </div>
        </div>

        <div className={`mb-5 inline-flex rounded-full px-3 py-1 text-[0.72rem] font-extrabold uppercase tracking-wide ${tone.badgeBg} ${tone.badgeText}`}>
          {item.type === "success" ? "Success" : item.type === "error" ? "Failed" : "Info"}
        </div>

        <p className="mb-6 whitespace-pre-line text-sm leading-6 text-slate-700">
          {item.message || "Operation completed."}
        </p>

        <button
          type="button"
          onClick={onClose}
          className={`w-full rounded-xl px-4 py-3 text-sm font-extrabold text-white transition ${tone.button}`}
        >
          {item.confirmText}
        </button>
      </div>
    </div>
  )
}

export function useGlobalFeedback() {
  const context = useContext(GlobalFeedbackContext)
  if (context) return context

  return {
    notify(payload) {
      if (typeof window !== "undefined" && typeof window.alert === "function") {
        window.alert(typeof payload === "string" ? payload : payload?.message || "")
      }
    },
  }
}

function GlobalFeedbackProvider({ children }) {
  const [activeItem, setActiveItem] = useState(null)
  const queueRef = useRef([])
  const timerRef = useRef(null)

  const showNext = useCallback(() => {
    if (queueRef.current.length === 0) {
      setActiveItem(null)
      return
    }
    const next = queueRef.current.shift()
    setActiveItem(next)
  }, [])

  const notify = useCallback((payload) => {
    const item = normalizePayload(payload)
    queueRef.current.push(item)
    setActiveItem((current) => {
      if (current) return current
      return queueRef.current.shift() || null
    })
  }, [])

  const closeActive = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    showNext()
  }, [showNext])

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }

    if (activeItem?.autoCloseMs) {
      timerRef.current = setTimeout(() => {
        showNext()
      }, activeItem.autoCloseMs)
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [activeItem, showNext])

  useEffect(() => {
    if (typeof window === "undefined") return undefined

    const originalAlert = window.alert
    window.alert = (message) => {
      notify(message)
    }
    window.ctmNotify = (payload) => {
      notify(payload)
    }

    return () => {
      window.alert = originalAlert
      delete window.ctmNotify
    }
  }, [notify])

  const value = useMemo(() => ({ notify }), [notify])

  return (
    <GlobalFeedbackContext.Provider value={value}>
      {children}
      <GlobalFeedbackModal item={activeItem} onClose={closeActive} />
    </GlobalFeedbackContext.Provider>
  )
}

export default GlobalFeedbackProvider
