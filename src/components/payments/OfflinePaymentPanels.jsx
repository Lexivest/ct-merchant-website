/**
 * Shared UI building blocks used by both MerchantPayment (physical verification
 * fee) and MerchantServiceFee (subscription fee) pages.
 *
 * Keeping them in one place guarantees the two pages look and behave identically
 * and means bug-fixes or copy changes only need to happen once.
 */
import { useCallback } from "react"
import {
  FaBuildingColumns,
  FaCircleCheck,
  FaClock,
  FaCopy,
  FaTriangleExclamation,
} from "react-icons/fa6"
import { useGlobalFeedback } from "../common/GlobalFeedbackProvider"
import { getProofStatusCopy } from "../../lib/offlinePayments"
import { CTM_BANK_ACCOUNT } from "../../lib/paymentConfig"

// ─── Status card ──────────────────────────────────────────────────────────────

export function PaymentStatusCard({ proof }) {
  if (!proof) return null

  const copy = getProofStatusCopy(proof.status)
  const toneClass =
    copy.tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : copy.tone === "danger"
        ? "border-red-200 bg-red-50 text-red-800"
        : "border-amber-200 bg-amber-50 text-amber-800"
  const Icon =
    copy.tone === "success"
      ? FaCircleCheck
      : copy.tone === "danger"
        ? FaTriangleExclamation
        : FaClock

  return (
    <div className={`rounded-2xl border p-4 ${toneClass}`}>
      <div className="flex items-start gap-3">
        <Icon className="mt-1 shrink-0 text-lg" />
        <div>
          <div className="font-black">{copy.title}</div>
          <p className="mt-1 text-sm font-semibold leading-6">{copy.message}</p>
          {proof.review_note ? (
            <p className="mt-2 rounded-xl bg-white/70 p-3 text-sm font-semibold">
              Staff note: {proof.review_note}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}

// ─── Bank detail row ──────────────────────────────────────────────────────────

export function BankDetailCopyRow({ label, value, onCopy }) {
  return (
    <button
      type="button"
      onClick={() => onCopy(label, value)}
      className="group w-full rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-[#D97706] hover:bg-[#FFFBEB] sm:p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[0.68rem] font-black uppercase tracking-[0.16em] text-slate-400">
            {label}
          </div>
          <div
            className={`mt-1 break-words font-black text-[#0F172A] ${
              label === "Account Number"
                ? "font-mono text-xl tracking-wide sm:text-2xl"
                : "text-base"
            }`}
          >
            {value}
          </div>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-[0.72rem] font-black text-slate-600 transition group-hover:bg-[#FEF3C7] group-hover:text-[#92400E]">
          <FaCopy /> Tap to copy
        </span>
      </div>
    </button>
  )
}

// ─── Bank details panel ───────────────────────────────────────────────────────

export function OfflineBankDetailsPanel({ open, amountLabel, planLabel, onCopy }) {
  if (!open) return null

  return (
    <div className="mt-5 rounded-[24px] border border-[#FBBF24]/60 bg-[#FFFBEB] p-4 shadow-sm sm:p-5">
      <div className="mb-4">
        <div className="inline-flex items-center gap-2 rounded-full bg-[#FEF3C7] px-3 py-1 text-[0.72rem] font-black uppercase tracking-[0.16em] text-[#92400E]">
          <FaBuildingColumns /> Offline Payment
        </div>
        <h3 className="mt-3 text-xl font-black text-[#0F172A]">Bank transfer details</h3>
        <p className="mt-1 text-sm font-semibold text-slate-600">
          {planLabel ? `${planLabel} payment: ${amountLabel}` : `Pay exactly ${amountLabel}`}.{" "}
          Tap any detail to copy.
        </p>
      </div>

      <div className="grid gap-3">
        <BankDetailCopyRow label="Bank Name"       value={CTM_BANK_ACCOUNT.bankName}      onCopy={onCopy} />
        <BankDetailCopyRow label="Account Name"    value={CTM_BANK_ACCOUNT.accountName}   onCopy={onCopy} />
        <BankDetailCopyRow label="Account Number"  value={CTM_BANK_ACCOUNT.accountNumber} onCopy={onCopy} />
      </div>
    </div>
  )
}

// ─── Clipboard hook ───────────────────────────────────────────────────────────

/**
 * Returns a stable `copyToClipboard(label, value)` function that writes to the
 * clipboard and fires a toast notification with the result.
 */
export function useCopyToClipboard() {
  const { notify } = useGlobalFeedback()

  return useCallback(
    async (label, value) => {
      const text = String(value || "")

      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text)
        } else {
          // Legacy fallback for older mobile browsers.
          const ta = document.createElement("textarea")
          ta.value = text
          ta.setAttribute("readonly", "")
          ta.style.cssText = "position:fixed;opacity:0"
          document.body.appendChild(ta)
          ta.select()
          document.execCommand("copy")
          ta.remove()
        }

        notify({ kind: "toast", type: "success", title: "Copied", message: `${label} copied.` })
      } catch {
        notify({
          kind: "toast",
          type: "error",
          title: "Copy failed",
          message: "Please copy the payment detail manually.",
        })
      }
    },
    [notify],
  )
}
