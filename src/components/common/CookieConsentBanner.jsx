import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { FaCookieBite, FaShieldHalved, FaXmark } from "react-icons/fa6"
import {
  readPrivacyConsent,
  subscribePrivacyConsent,
  writePrivacyConsent,
} from "../../lib/privacyConsent"

export default function CookieConsentBanner({ enabled = true }) {
  const [consent, setConsent] = useState(() => readPrivacyConsent())

  useEffect(() => subscribePrivacyConsent(setConsent), [])

  if (!enabled || consent.decided) return null

  const rejectOptional = () => {
    setConsent(writePrivacyConsent({ analytics: false, choice: "rejected" }))
  }

  const acceptAll = () => {
    setConsent(writePrivacyConsent({ analytics: true, choice: "accepted" }))
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-[1200] px-3 pb-3 sm:px-5 sm:pb-5">
      <div className="mx-auto flex max-w-3xl flex-col gap-3 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-[0_16px_48px_rgba(15,23,42,0.18)] backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between sm:p-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white">
            <FaCookieBite />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-950">
                Cookie choice
              </p>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-700">
                <FaShieldHalved />
                Essential stays on
              </span>
            </div>
            <p className="mt-1 text-xs font-semibold leading-5 text-slate-600 sm:text-sm">
              Optional analytics helps improve the dashboard. You can change this later in Profile settings.
            </p>
            <Link
              to="/privacy"
              className="mt-1 inline-block text-[11px] font-black uppercase tracking-[0.14em] text-pink-600 underline decoration-pink-200 underline-offset-4"
            >
              Privacy policy
            </Link>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={rejectOptional}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50"
            aria-label="Reject optional analytics"
          >
            <FaXmark />
          </button>
          <button
            type="button"
            onClick={rejectOptional}
            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:bg-slate-50"
          >
            Reject
          </button>
          <button
            type="button"
            onClick={acceptAll}
            className="h-10 rounded-xl bg-pink-600 px-4 text-xs font-black text-white shadow-lg shadow-pink-950/10 transition hover:bg-pink-500 active:scale-[0.98]"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  )
}
