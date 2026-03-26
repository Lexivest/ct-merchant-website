import { useEffect } from "react"

export default function usePreventPullToRefresh() {
  useEffect(() => {
    // Disabled intentionally so native browser pull-to-refresh remains available everywhere.
    return undefined
  }, [])
}
