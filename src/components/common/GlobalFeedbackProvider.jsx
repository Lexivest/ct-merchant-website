/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { FaXmark } from "react-icons/fa6"
import ctmLogo from "../../assets/images/logo.jpg"
import BrandText, { renderBrandedText } from "./BrandText"
import StableImage from "./StableImage"

const GlobalFeedbackContext = createContext(null)

const SUCCESS_PATTERN =
  /(success|successful|submitted|saved|updated|deleted|approved|copied|uploaded|sent|verified|done|completed|activated)/i
const ERROR_PATTERN =
  /(fail|failed|error|unable|denied|invalid|missing|blocked|restricted|offline|not found|cancelled|canceled|cannot|can't|could not|warning|exceeds|too large)/i

function inferType(message = "") {
  const text = String(message || "").trim()
  if (!text) return "info"
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
      title:
        payload.title ||
        (type === "success" ? "Success" : type === "error" ? "Action Failed" : "Notice"),
      message,
      confirmText: payload.confirmText || "Continue",
      cancelText: payload.cancelText || "Cancel",
      placeholder: payload.placeholder || "",
      defaultValue: payload.defaultValue || "",
      inputLabel: payload.inputLabel || "",
      multiline: Boolean(payload.multiline),
      autoCloseMs:
        Number(payload.autoCloseMs) > 0
          ? Number(payload.autoCloseMs)
          : payload.kind === "toast"
            ? 4000
            : null,
      onClose: typeof payload.onClose === "function" ? payload.onClose : null,
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
    placeholder: "",
    defaultValue: "",
    inputLabel: "",
    multiline: false,
    autoCloseMs: null,
    onClose: null,
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
  const [promptValue, setPromptValue] = useState(() => item?.defaultValue || "")

  if (!item) return null

  if (item.kind === "toast") {
    const tone =
      item.type === "error"
        ? "border border-slate-800 bg-slate-900 text-white shadow-2xl"
        : "border border-slate-100 bg-white text-slate-900 shadow-xl"

    return (
      <div
        className="fixed bottom-6 left-1/2 z-[13000] w-full max-w-sm -translate-x-1/2 px-4"
        role="status"
        aria-live="polite"
      >
        <div className={`flex items-center gap-3 rounded-2xl p-4 ${tone}`}>
          <div
            className={`h-2.5 w-2.5 shrink-0 rounded-full ${
              item.type === "success"
                ? "bg-emerald-400"
                : item.type === "error"
                  ? "bg-rose-500"
                  : "bg-sky-400"
            }`}
          />
          <p className="flex-1 text-[13px] font-black leading-tight">
            {renderBrandedText(item.message)}
          </p>
          <button
            type="button"
            onClick={() => onClose(true)}
            className="ml-2 flex h-6 w-6 items-center justify-center rounded-full bg-slate-400/10 text-[10px] font-bold transition hover:bg-slate-400/20"
          >
            <FaXmark />
          </button>
        </div>
      </div>
    )
  }

  const tone = modalTone(item.type)
  const isConfirm = item.kind === "confirm"
  const isPrompt = item.kind === "prompt"
  const canSubmitPrompt = !isPrompt || String(promptValue).trim().length > 0

  function handleSubmit() {
    if (isPrompt) {
      onClose(promptValue.trim())
      return
    }

    onClose(true)
  }

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
            <p className="text-xs font-bold uppercase tracking-[0.13em] text-slate-500">
              <BrandText />
            </p>
            <h3 className="text-lg font-black text-slate-900">
              {renderBrandedText(item.title)}
            </h3>
          </div>
        </div>

        <div className={`mb-5 inline-flex rounded-full px-3 py-1 text-[0.72rem] font-extrabold uppercase tracking-wide ${tone.badgeBg} ${tone.badgeText}`}>
          {item.type === "success" ? "Success" : item.type === "error" ? "Failed" : "Info"}
        </div>

        <p className="mb-6 whitespace-pre-line text-sm leading-6 text-slate-700">
          {renderBrandedText(item.message || "Operation completed.")}
        </p>

        {isPrompt ? (
          <>
            {item.inputLabel ? (
              <label className="mb-2 block text-left text-[12px] font-black uppercase tracking-[0.14em] text-slate-500">
                {item.inputLabel}
              </label>
            ) : null}

            {item.multiline ? (
              <textarea
                value={promptValue}
                onChange={(event) => setPromptValue(event.target.value)}
                placeholder={item.placeholder}
                className="mb-5 min-h-[110px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-pink-400 focus:bg-white"
              />
            ) : (
              <input
                value={promptValue}
                onChange={(event) => setPromptValue(event.target.value)}
                placeholder={item.placeholder}
                className="mb-5 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 outline-none transition focus:border-pink-400 focus:bg-white"
              />
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => onClose(null)}
                className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-extrabold text-slate-700 transition hover:bg-slate-50"
              >
                {item.cancelText}
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmitPrompt}
                className={`flex-1 rounded-xl px-4 py-3 text-sm font-extrabold text-white transition disabled:cursor-not-allowed disabled:opacity-50 ${tone.button}`}
              >
                {item.confirmText}
              </button>
            </div>
          </>
        ) : isConfirm ? (
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
              onClick={handleSubmit}
              className={`flex-1 rounded-xl px-4 py-3 text-sm font-extrabold text-white transition ${tone.button}`}
            >
              {item.confirmText}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
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
    prompt(payload) {
      if (typeof window !== "undefined" && typeof window.prompt === "function") {
        const message = typeof payload === "string" ? payload : payload?.message || ""
        const defaultValue = typeof payload === "object" ? payload?.defaultValue || "" : ""
        return Promise.resolve(window.prompt(message, defaultValue))
      }
      return Promise.resolve(null)
    },
  }
}

function GlobalFeedbackProvider({ children }) {
  const [activeItem, setActiveItem] = useState(null)
  const queueRef = useRef([])
  const timerRef = useRef(null)
  const itemIdRef = useRef(0)
  const lastToastRef = useRef({
    fingerprint: "",
    at: 0,
  })

  const showNext = useCallback(() => {
    if (queueRef.current.length === 0) {
      setActiveItem(null)
      return
    }
    const next = queueRef.current.shift()
    setActiveItem(next)
  }, [])

  const notify = useCallback((payload) => {
    const item = {
      ...normalizePayload(payload),
      _id: ++itemIdRef.current,
    }

    if (item.kind === "toast") {
      const fingerprint = `${item.type}|${item.title}|${item.message}`
      const now = Date.now()
      if (
        lastToastRef.current.fingerprint === fingerprint &&
        now - lastToastRef.current.at < 1600
      ) {
        return
      }
      lastToastRef.current = { fingerprint, at: now }
    }

    queueRef.current.push(item)
    setActiveItem((current) => {
      if (current) return current
      return queueRef.current.shift() || null
    })
  }, [])

  const confirm = useCallback((payload) => {
    const item = normalizePayload({
      ...(payload && typeof payload === "object" ? payload : { message: payload }),
      kind: "confirm",
      autoCloseMs: null,
    })

    return new Promise((resolve) => {
      queueRef.current.push({ ...item, _id: ++itemIdRef.current, resolve })
      setActiveItem((current) => {
        if (current) return current
        return queueRef.current.shift() || null
      })
    })
  }, [])

  const prompt = useCallback((payload) => {
    const item = normalizePayload({
      ...(payload && typeof payload === "object" ? payload : { message: payload }),
      kind: "prompt",
      autoCloseMs: null,
    })

    return new Promise((resolve) => {
      queueRef.current.push({ ...item, _id: ++itemIdRef.current, resolve })
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

    if (typeof activeItem?.onClose === "function") {
      try {
        activeItem.onClose(result)
      } catch (error) {
        console.error("Global feedback onClose handler failed:", error)
      }
    }

    if (
      (activeItem?.kind === "confirm" || activeItem?.kind === "prompt") &&
      typeof activeItem.resolve === "function"
    ) {
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
        closeActive(true)
      }, activeItem.autoCloseMs)
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [activeItem, closeActive])

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

  const value = useMemo(() => ({ notify, confirm, prompt }), [confirm, notify, prompt])

  return (
    <GlobalFeedbackContext.Provider value={value}>
      {children}
      <GlobalFeedbackModal key={activeItem?._id || "feedback"} item={activeItem} onClose={closeActive} />
    </GlobalFeedbackContext.Provider>
  )
}

export default GlobalFeedbackProvider
