import { useEffect } from "react"

export default function usePreventPullToRefresh() {
  useEffect(() => {
    // Keep this hook as a safe no-op for pages that already import it.
    // Aggressive overscroll blocking froze normal scrolling on some Android browsers.
    return undefined
  }, [])
}
