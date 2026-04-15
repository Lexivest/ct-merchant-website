import { useEffect } from "react"

export default function usePreventPullToRefresh() {
  useEffect(() => {
    // Prevent native pull-to-refresh by setting overscroll-behavior to contain on the root element.
    // This stops the browser from triggering a hard reload when pulling down at the top.
    document.documentElement.style.overscrollBehaviorY = "contain"
    document.body.style.overscrollBehaviorY = "contain"

    return () => {
      document.documentElement.style.overscrollBehaviorY = ""
      document.body.style.overscrollBehaviorY = ""
    }
  }, [])
}
