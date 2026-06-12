import { useCallback } from "react"
import { useGlobalFeedback } from "../components/common/GlobalFeedbackProvider"

/**
 * Returns a stable `copyToClipboard(label, value)` function that writes to the
 * clipboard (with a legacy fallback for older mobile browsers) and fires a toast
 * notification with the result.
 *
 * Lives in its own module so the shared payment-panel component file can export
 * only components (keeps React Fast Refresh working in dev).
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
