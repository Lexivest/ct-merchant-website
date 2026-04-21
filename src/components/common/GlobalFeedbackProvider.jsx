/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import ctmLogo from "../../assets/images/logo.jpg"
import StableImage from "./StableImage"

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
      kind: payload.kind || "notice",
      type,
      title: payload.title || (type === "success" ? "Success" : type === "error" ? "Action Failed" : "Notice"),
      message,
      confirmText: payload.confirmText || "Continue",
      cancelText: payload.cancelText || "Cancel",
      autoCloseMs: Number(payload.autoCloseMs) > 0 ? Number(payload.autoCloseMs) : (payload.kind === "toast" ? 4000 : null),
    }
  }

  const message = String(payload ?? "")
  const type = inferType(message)
  return {
    kind: "notice",
    type,
    title: type === "success" ? "Success" : type === "error" ? "Action Failed" : "Notice",
    message,
    confirmText: "Continue",
    cancelText: "Cancel",
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

  if (item.kind === "toast") {
    const tone = item.type === "error" ? "bg-slate-900 text-white shadow-2xl" : "bg-white text-slate-900 shadow-xl border border-slate-100"
    return (
      <div 
        className="fixed bottom-6 left-1/2 z-[13000] -translate-x-1/2 px-4 w-full max-w-sm"
        role="status"
        aria-live="polite"
      >
        <div className={`flex items-center gap-3 rounded-2xl p-4 transition-all duration-300 animate-in fade-in slide-in-from-bottom-4 ${tone}`}>
          <div className={`h-2.5 w-2.5 shrink-0 rounded-full animate-pulse ${item.type === "success" ? "bg-emerald-400" : item.type === "error" ? "bg-rose-500" : "bg-sky-400"}`} />
          <p className="text-[13px] font-black leading-tight flex-1">{item.message}</p>
          <button 
            type="button" 
            onClick={() => onClose(true)}
            className="ml-2 flex h-6 w-6 items-center justify-center rounded-full bg-slate-400/10 text-[10px] font-bold transition hover:bg-slate-400/20"
          >
            ✕
          </button>
        </div>
      </div>
    )
  }

  const tone = modalTone(item.type)
  const isConfirm = item.kind === "confirm"

  return (
    <div
      className="fixed inset-0 z-[12000] flex items-center justify-center bg-slate-900/55 px-4 py-6 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-live="assertive"
    >
      <div className={`w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl ring-2 ${tone.ring}`}>
        <div className="mb-4 flex items-center gap-3">
          <StableImage
            src={ctmLogo}
            alt="CTM"
            containerClassName="h-11 w-11 overflow-hidden rounded-xl border border-slate-200"
            className="h-full w-full object-cover"
            loading="eager"
          />
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

        {isConfirm ? (
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => onClose(false)}
              className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-extrabold text-slate-700 transition hover:bg-slate-50"
            >
              {item.cancelText}
            </button>
            <button
              type="button"
              onClick={() => onClose(true)}
              className={`flex-1 rounded-xl px-4 py-3 text-sm font-extrabold text-white transition ${tone.button}`}
            >
              {item.confirmText}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => onClose(true)}
            className={`w-full rounded-xl px-4 py-3 text-sm font-extrabold text-white transition ${tone.button}`}
          >
            {item.confirmText}
          </button>
        )}
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
    confirm(payload) {
      if (typeof window !== "undefined" && typeof window.confirm === "function") {
        return Promise.resolve(
          window.confirm(typeof payload === "string" ? payload : payload?.message || "")
        )
      }
      return Promise.resolve(false)
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

  const confirm = useCallback((payload) => {
    const item = normalizePayload({
      ...(
        payload && typeof payload === "object"
          ? payload
          : { message: payload }
      ),
      kind: "confirm",
      autoCloseMs: null,
    })

    return new Promise((resolve) => {
      queueRef.current.push({ ...item, resolve })
      setActiveItem((current) => {
        if (current) return current
        return queueRef.current.shift() || null
      })
    })
  }, [])

  const closeActive = useCallback((result = true) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (activeItem?.kind === "confirm" && typeof activeItem.resolve === "function") {
      activeItem.resolve(result)
    }
    showNext()
  }, [activeItem, showNext])

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

  const value = useMemo(() => ({ notify, confirm }), [notify, confirm])

  return (
    <GlobalFeedbackContext.Provider value={value}>
      {children}
      <GlobalFeedbackModal item={activeItem} onClose={closeActive} />
    </GlobalFeedbackContext.Provider>
  )
}

export default GlobalFeedbackProvider
