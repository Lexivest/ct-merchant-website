import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { FaChartLine, FaCookieBite, FaShieldHalved, FaXmark } from "react-icons/fa6"
import {
  readPrivacyConsent,
  subscribePrivacyConsent,
  writePrivacyConsent,
} from "../../lib/privacyConsent"

function PreferencePill({ icon, title, text, tone = "slate" }) {
  const toneClass =
    tone === "pink"
      ? "border-pink-100 bg-pink-50 text-pink-700"
      : "border-slate-200 bg-slate-50 text-slate-700"

  return (
    <div className={`rounded-2xl border p-3 ${toneClass}`}>
      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em]">
        {icon}
        <span>{title}</span>
      </div>
      <p className="mt-1.5 text-xs font-semibold leading-5 text-slate-600">{text}</p>
    </div>
  )
}

export default function CookieConsentBanner() {
  const [consent, setConsent] = useState(() => readPrivacyConsent())
  const [expanded, setExpanded] = useState(false)

  useEffect(() => subscribePrivacyConsent(setConsent), [])

  if (consent.decided) return null

  const rejectOptional = () => {
    setConsent(writePrivacyConsent({ analytics: false, choice: "rejected" }))
  }

  const acceptAll = () => {
    setConsent(writePrivacyConsent({ analytics: true, choice: "accepted" }))
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-[1200] px-3 pb-3 sm:px-5 sm:pb-5">
      <div className="mx-auto max-w-5xl overflow-hidden rounded-[28px] border border-slate-200 bg-white/95 shadow-[0_24px_80px_rgba(15,23,42,0.24)] backdrop-blur-xl">
        <div className="grid gap-5 p-5 md:grid-cols-[1.35fr_0.65fr] md:p-6">
          <div>
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-lg text-white shadow-lg shadow-slate-300">
                <FaCookieBite />
              </div>

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[11px] font-black uppercase tracking-[0.22em] text-pink-600">
                    Privacy Preferences
                  </p>
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-700">
                    Essential storage stays on
                  </span>
                </div>

                <h2 className="mt-2 text-xl font-black tracking-tight text-slate-950 md:text-2xl">
                  Help CTMerchant remember what matters.
                </h2>

                <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-600">
                  We use essential browser storage for sign-in, security, saved drafts, and fast page loading.
                  Optional analytics only helps us count site visits and improve marketplace reliability.
                </p>

                <button
                  type="button"
                  onClick={() => setExpanded((value) => !value)}
                  className="mt-3 text-xs font-black uppercase tracking-[0.18em] text-slate-500 underline decoration-slate-300 underline-offset-4 transition hover:text-pink-600"
                >
                  {expanded ? "Hide details" : "View details"}
                </button>
              </div>
            </div>

            {expanded ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <PreferencePill
                  icon={<FaShieldHalved />}
                  title="Essential"
                  text="Required for login, route recovery, account safety, dashboard caching, and form drafts."
                />
                <PreferencePill
                  icon={<FaChartLine />}
                  title="Optional analytics"
                  text="Anonymous visit counting for product quality and marketplace performance decisions."
                  tone="pink"
                />
              </div>
            ) : null}
          </div>

          <div className="flex flex-col justify-between gap-4 rounded-3xl bg-slate-950 p-4 text-white">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-pink-300">
                  Your choice
                </p>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-300">
                  You can reject optional analytics and still use CTMerchant normally.
                </p>
              </div>
              <button
                type="button"
                onClick={rejectOptional}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-slate-200 transition hover:bg-white/20"
                aria-label="Reject optional analytics"
              >
                <FaXmark />
              </button>
            </div>

            <div className="grid gap-2">
              <button
                type="button"
                onClick={acceptAll}
                className="h-12 rounded-2xl bg-pink-600 px-4 text-sm font-black text-white shadow-lg shadow-pink-950/20 transition hover:bg-pink-500 active:scale-[0.98]"
              >
                Accept all
              </button>
              <button
                type="button"
                onClick={rejectOptional}
                className="h-12 rounded-2xl border border-white/15 bg-white/5 px-4 text-sm font-black text-slate-100 transition hover:bg-white/10 active:scale-[0.98]"
              >
                Reject optional
              </button>
              <Link
                to="/privacy"
                className="pt-1 text-center text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400 transition hover:text-white"
              >
                Read privacy policy
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
