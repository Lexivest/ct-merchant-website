import { useEffect, useState } from "react"
import { FaMobileScreenButton, FaXmark } from "react-icons/fa6"

import usePwaInstall from "../../hooks/usePwaInstall"
import IosInstallSheet from "./IosInstallSheet"
import BrandText from "./BrandText"

// ─── Snooze storage ───────────────────────────────────────────────────────────
// Escalating schedule: 1st dismiss → 7 days, 2nd → 30 days, 3rd+ → permanent.
const SNOOZE_KEY = "ctm_pwa_snooze_v2"

const SNOOZE_DURATIONS_MS = [
  7  * 24 * 60 * 60 * 1000,   // 1st dismiss: 7 days
  30 * 24 * 60 * 60 * 1000,   // 2nd dismiss: 30 days
  // 3rd+: treated as permanent below
]
const PERMANENT_MS = 10 * 365 * 24 * 60 * 60 * 1000 // ~10 years

function readSnooze() {
  try {
    const raw = window.localStorage.getItem(SNOOZE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function isPromptSnoozed() {
  if (typeof window === "undefined") return false
  const s = readSnooze()
  return Boolean(s?.until > Date.now())
}

function recordDismiss() {
  if (typeof window === "undefined") return
  try {
    const s     = readSnooze()
    const count = (s?.count ?? 0) + 1
    const ms    = SNOOZE_DURATIONS_MS[count - 1] ?? PERMANENT_MS
    window.localStorage.setItem(
      SNOOZE_KEY,
      JSON.stringify({ until: Date.now() + ms, count }),
    )
  } catch {
    // Best effort — private mode / storage full.
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

function PwaAddToHomePrompt() {
  const {
    canPromptInstall,
    installingApp,
    isIosSafari,
    promptInstall,
    showInstallPrompt,
  } = usePwaInstall()

  const [snoozed,         setSnoozed]         = useState(() => isPromptSnoozed())
  const [visible,         setVisible]          = useState(false)
  const [showIosSheet,    setShowIosSheet]     = useState(false)

  // Slide in 1.5 s after engagement conditions are met.
  useEffect(() => {
    if (!showInstallPrompt || snoozed || visible) return undefined
    const t = window.setTimeout(() => setVisible(true), 1500)
    return () => window.clearTimeout(t)
  }, [showInstallPrompt, snoozed, visible])

  function dismiss() {
    recordDismiss()
    setSnoozed(true)
    setVisible(false)
    setShowIosSheet(false)
  }

  async function handleInstall() {
    if (isIosSafari) {
      // No native prompt on iOS — show the step-by-step instruction sheet.
      setShowIosSheet(true)
      return
    }

    const result = await promptInstall()

    if (result?.status === "accepted") {
      setVisible(false)
      return
    }

    // User dismissed the native dialog — snooze the pill too.
    if (result?.status === "dismissed") {
      dismiss()
    }
  }

  if (!showInstallPrompt || !visible) return null

  const label = installingApp
    ? "Opening…"
    : canPromptInstall
      ? "Install"
      : "How to"

  return (
    <>
      {/* ── Install pill ───────────────────────────────────────────────── */}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[12000] flex justify-center px-4">
        <div className="pointer-events-auto flex w-full max-w-[400px] animate-[ctmTransitionAppear_280ms_ease-out_both] items-center gap-3 rounded-full border border-pink-100 bg-white py-2 pl-3 pr-2 shadow-[0_12px_40px_rgba(15,23,42,0.14)]">

          {/* Icon */}
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-pink-600 text-white">
            <FaMobileScreenButton className="h-3.5 w-3.5" />
          </span>

          {/* Label */}
          <p className="min-w-0 flex-1 truncate text-xs font-black text-slate-800">
            Add <BrandText /> to home screen
          </p>

          {/* Action */}
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={handleInstall}
              disabled={installingApp}
              className="rounded-full bg-pink-600 px-4 py-2 text-[11px] font-black uppercase tracking-[0.1em] text-white transition hover:bg-pink-700 active:scale-[0.97] disabled:cursor-wait disabled:opacity-60"
            >
              {label}
            </button>
            <button
              type="button"
              onClick={dismiss}
              aria-label="Dismiss install prompt"
              className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            >
              <FaXmark className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>

      {/* ── iOS instruction sheet ──────────────────────────────────────── */}
      {showIosSheet && (
        <IosInstallSheet
          onDismiss={() => {
            setShowIosSheet(false)
            dismiss()
          }}
        />
      )}
    </>
  )
}

export default PwaAddToHomePrompt
