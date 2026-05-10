import { useEffect, useLayoutEffect, useState } from "react"
import { useLocation, useNavigationType } from "react-router-dom"
import AppErrorBoundary from "./AppErrorBoundary"
import UpdateBanner from "./UpdateBanner"
import { forceFreshAppReload, removeRecoverySearchParam } from "../../lib/runtimeRecovery"
import { useVersionCheck } from "../../hooks/useVersionCheck"
import useRouteWarmup from "../../hooks/useRouteWarmup"

function forceScrollTop() {
  if (typeof window === "undefined") return

  window.scrollTo({ top: 0, left: 0, behavior: "auto" })

  const scrollingElement = document.scrollingElement || document.documentElement
  if (scrollingElement) {
    scrollingElement.scrollTop = 0
    scrollingElement.scrollLeft = 0
  }

  if (document.body) {
    document.body.scrollTop = 0
    document.body.scrollLeft = 0
  }
}

function RouteFeedback() {
  const location = useLocation()
  const navigationType = useNavigationType()
  const routeKey = `${location.pathname}${location.search}${location.hash}`

  useEffect(() => {
    if (typeof window === "undefined" || !("scrollRestoration" in window.history)) {
      return undefined
    }

    const previousScrollRestoration = window.history.scrollRestoration
    // "auto" lets the browser restore scroll position on back/forward (POP).
    // We still scroll to top on PUSH/REPLACE navigations via the layout effect.
    window.history.scrollRestoration = "auto"

    return () => {
      window.history.scrollRestoration = previousScrollRestoration
    }
  }, [])

  useLayoutEffect(() => {
    if (location.hash || typeof window === "undefined") return undefined
    // Skip scrolling to top when the user pressed back/forward — the browser's
    // native scroll restoration already handles the correct position.
    if (navigationType === "POP") return undefined

    forceScrollTop()

    let frameId = window.requestAnimationFrame(forceScrollTop)
    const timers = [60, 180, 420].map((delay) =>
      window.setTimeout(forceScrollTop, delay)
    )

    return () => {
      window.cancelAnimationFrame(frameId)
      timers.forEach((timerId) => window.clearTimeout(timerId))
    }
  }, [location.hash, location.pathname, location.search, navigationType])

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.style.scrollBehavior = "auto"
    }
  }, [])

  return (
    <div
      key={routeKey}
      aria-hidden="true"
      className="route-progress route-progress-active"
    />
  )
}

function AppFrame({ children }) {
  const location = useLocation()
  const { hasUpdate } = useVersionCheck()
  const [bannerDismissed, setBannerDismissed] = useState(false)
  useRouteWarmup({ pathname: location.pathname })

  useEffect(() => {
    removeRecoverySearchParam()
  }, [])

  // Reset dismissal when a different (newer) update arrives
  useEffect(() => {
    if (hasUpdate) setBannerDismissed(false)
  }, [hasUpdate])

  return (
    <AppErrorBoundary
      resetKey={`${location.pathname}${location.search}${location.hash}`}
    >
      {hasUpdate && !bannerDismissed && (
        <UpdateBanner
          onUpdate={() => forceFreshAppReload({ reason: "version-update", manual: true })}
          onDismiss={() => setBannerDismissed(true)}
        />
      )}
      <RouteFeedback />
      {children}
    </AppErrorBoundary>
  )
}

export default AppFrame
