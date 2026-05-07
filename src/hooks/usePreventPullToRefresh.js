import { useEffect } from "react"

export default function usePreventPullToRefresh() {
  useEffect(() => {
    const root = document.documentElement
    const body = document.body
    const previousRootOverscroll = root.style.overscrollBehaviorY
    const previousBodyOverscroll = body.style.overscrollBehaviorY

    // Prevent native pull-to-refresh from forcing a hard reload on mobile browsers.
    root.style.overscrollBehaviorY = "none"
    body.style.overscrollBehaviorY = "none"

    return () => {
      root.style.overscrollBehaviorY = previousRootOverscroll
      body.style.overscrollBehaviorY = previousBodyOverscroll
    }
  }, [])
}
