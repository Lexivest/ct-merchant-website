import { useEffect, useLayoutEffect } from "react"
import { useLocation, useNavigationType } from "react-router-dom"
import AppErrorBoundary from "./AppErrorBoundary"
import { removeRecoverySearchParam } from "../../lib/runtimeRecovery"
import { useVersionCheck } from "../../hooks/useVersionCheck"
import useRouteWarmup from "../../hooks/useRouteWarmup"
import usePreventPullToRefresh from "../../hooks/usePreventPullToRefresh"

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
    window.history.scrollRestoration = "manual"

    return () => {
      window.history.scrollRestoration = previousScrollRestoration
    }
  }, [])

  useLayoutEffect(() => {
    if (location.hash || typeof window === "undefined") return undefined

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
  usePreventPullToRefresh()
  useVersionCheck() // Warm app updates in the background without interrupting users.
  useRouteWarmup({ pathname: location.pathname })

  useEffect(() => {
    removeRecoverySearchParam()
  }, [])

  return (
    <AppErrorBoundary
      resetKey={`${location.pathname}${location.search}${location.hash}`}
    >
      <RouteFeedback />
      {children}
    </AppErrorBoundary>
  )
}

export default AppFrame
