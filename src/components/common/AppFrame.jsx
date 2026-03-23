import { useEffect } from "react"
import { useLocation, useNavigationType } from "react-router-dom"
import AppErrorBoundary from "./AppErrorBoundary"

function RouteFeedback() {
  const location = useLocation()
  const navigationType = useNavigationType()
  const routeKey = `${location.pathname}${location.search}${location.hash}`

  useEffect(() => {
    if (
      navigationType !== "POP" &&
      !location.hash &&
      typeof window !== "undefined"
    ) {
      window.scrollTo({ top: 0, behavior: "smooth" })
    }

    if (typeof document !== "undefined") {
      document.documentElement.style.scrollBehavior = "smooth"
    }
  }, [location.hash, location.pathname, location.search, navigationType])

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
