import { useEffect } from "react"
import { FaXmark } from "react-icons/fa6"

// Step definitions — numbers replace icons to stay dependency-light.
const STEPS = [
  {
    num: "1",
    heading: "Tap the Share button",
    detail: "Tap the square-with-arrow icon at the bottom of Safari",
    color: "bg-pink-50 text-pink-600",
  },
  {
    num: "2",
    heading: 'Tap "Add to Home Screen"',
    detail: "Scroll down in the share sheet to find this option",
    color: "bg-violet-50 text-violet-600",
  },
  {
    num: "3",
    heading: 'Tap "Add" to confirm',
    detail: "CTMerchant will appear on your home screen instantly",
    color: "bg-emerald-50 text-emerald-600",
  },
]

function IosInstallSheet({ onDismiss }) {
  // Lock body scroll while sheet is open.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = prev }
  }, [])

  // Close on Escape key.
  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onDismiss() }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onDismiss])

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[12100] bg-black/50 backdrop-blur-sm"
        aria-hidden="true"
        onClick={onDismiss}
      />

      {/* Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="How to add CTMerchant to your home screen"
        className="fixed inset-x-0 bottom-0 z-[12101] animate-[ctmTransitionAppear_220ms_ease-out_both] rounded-t-[28px] bg-white px-5 pb-8 pt-4 shadow-[0_-20px_60px_rgba(15,23,42,0.22)]"
      >
        {/* Drag handle */}
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-slate-200" />

        {/* Header */}
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-pink-600">
              Install App
            </p>
            <h2 className="mt-0.5 text-xl font-black leading-tight text-slate-900">
              Add to Home Screen
            </h2>
            <p className="mt-1 text-sm font-medium leading-snug text-slate-500">
              Get instant access to CTMerchant — works offline too.
            </p>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200"
          >
            <FaXmark className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Steps */}
        <div className="space-y-3">
          {STEPS.map(({ num, heading, detail, color }) => (
            <div key={num} className="flex items-start gap-3">
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${color} text-sm font-black`}
              >
                {num}
              </div>
              <div className="pb-1 pt-1">
                <p className="text-sm font-black text-slate-900">{heading}</p>
                <p className="mt-0.5 text-xs font-medium leading-snug text-slate-500">{detail}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Share-button pointer */}
        <div className="mt-5 flex items-center gap-2 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
          <span className="text-lg" aria-hidden="true">⬆</span>
          <p className="text-xs font-semibold text-slate-500">
            The Share button is in Safari&apos;s toolbar at the bottom of the screen
          </p>
        </div>

        {/* CTA */}
        <button
          type="button"
          onClick={onDismiss}
          className="mt-5 w-full rounded-2xl bg-slate-900 py-4 text-sm font-black text-white transition hover:bg-slate-800 active:scale-[0.98]"
        >
          Got it
        </button>
      </div>
    </>
  )
}

export default IosInstallSheet
