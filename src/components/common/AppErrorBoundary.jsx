import { Component } from "react"
import { isNetworkError } from "../../lib/friendlyErrors"
import { isNetworkOffline } from "../../lib/networkStatus"
import { logError } from "../../lib/errorLogger"
import GlobalErrorScreen from "./GlobalErrorScreen"
import { PageLoadingScreen } from "./PageStatusScreen"
import {
  forceFreshAppReload,
  hasAttemptedFreshReload,
  isChunkLoadFailure,
  isCriticalAssetLoadFailure,
} from "../../lib/runtimeRecovery"

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null, retryArmed: false, busy: false }
  }

  static getDerivedStateFromError(error) {
    // Network errors reaching the boundary are almost always failed module
    // imports (real API errors are caught in components before propagating up).
    const looksLikeModuleFailure = isChunkLoadFailure(error) || isNetworkError(error)
    // Only pre-set busy if this is the FIRST automatic recovery attempt.
    // If a reload already happened and the error persists, show the widget
    // so the user can act — don't spin forever.
    const busyNow = looksLikeModuleFailure && !isNetworkOffline() && !hasAttemptedFreshReload("chunk")
    return { error, retryArmed: false, busy: busyNow }
  }

  componentDidMount() {
    if (typeof window !== "undefined" && this.props.captureGlobal !== false) {
      window.addEventListener("online", this.handleReconnectRetry)
      window.addEventListener("error", this.handleWindowError, true)
      window.addEventListener("unhandledrejection", this.handleUnhandledRejection)
      window.addEventListener("vite:preloadError", this.handleVitePreloadError)
    }
  }

  componentWillUnmount() {
    if (typeof window !== "undefined" && this.props.captureGlobal !== false) {
      window.removeEventListener("online", this.handleReconnectRetry)
      window.removeEventListener("error", this.handleWindowError, true)
      window.removeEventListener("unhandledrejection", this.handleUnhandledRejection)
      window.removeEventListener("vite:preloadError", this.handleVitePreloadError)
    }
  }

  componentDidCatch(error, errorInfo) {
    console.error("Critical Application Error Caught:", error)
    logError(error, {
      type: "react_boundary",
      componentStack: (errorInfo?.componentStack || "").slice(0, 800),
    })
    this.recoverFromChunkFailure(error)
  }

  componentDidUpdate(prevProps) {
    if (
      this.state.error &&
      prevProps.resetKey !== this.props.resetKey
    ) {
      this.setState({ error: null, retryArmed: false, busy: false })
    }
  }

  recoverFromChunkFailure(error) {
    // Also handle network errors: at the boundary level they almost always
    // mean a failed module import (e.g. Safari "Load failed" on a 404'd chunk).
    if (!isChunkLoadFailure(error) && !isNetworkError(error)) return false

    if (isNetworkOffline()) {
      // Can't reload — show the error widget with retry armed for when we come back online.
      this.setState({ error, retryArmed: true, busy: false })
      return false
    }

    const started = forceFreshAppReload({ reason: "chunk", manual: false })
    // If the reload already happened this session (started=false), don't
    // overwrite the busy state — getDerivedStateFromError already set busy:false
    // for the repeat case, which is correct (auto-recovery gave up, show widget).
    if (started) {
      this.setState({ error, retryArmed: false, busy: true })
    }
    return started
  }

  handleWindowError = (event) => {
    if (isCriticalAssetLoadFailure(event)) {
      const error = new Error("Critical application asset failed to load.")
      this.recoverFromChunkFailure(error)
      return
    }

    const error = event?.error
    if (!isChunkLoadFailure(error)) return

    this.recoverFromChunkFailure(error)
  }

  handleUnhandledRejection = (event) => {
    const error = event?.reason
    if (!isChunkLoadFailure(error)) return

    event.preventDefault?.()
    this.recoverFromChunkFailure(error)
  }

  handleVitePreloadError = (event) => {
    event.preventDefault?.()
    const error = event?.payload || new Error("vite:preloadError")

    this.recoverFromChunkFailure(error)
  }

  handleReconnectRetry = () => {
    if (!this.state.retryArmed) return
    if (!isChunkLoadFailure(this.state.error) && !isNetworkError(this.state.error)) return
    this.handleRetry()
  }

  handleRetry = () => {
    if (isNetworkOffline()) {
      this.setState({ retryArmed: true, busy: false })
      return
    }

    this.setState({ retryArmed: false, busy: true })
    forceFreshAppReload({ reason: "manual", manual: true })
  }

  handleBack = () => {
    if (typeof window === "undefined") return

    if (window.history.length > 1) {
      window.history.back()
      return
    }

    window.location.assign("/")
  }

  render() {
    // A recovery reload is already in flight — show a clean loading screen
    // so the user never sees the "Connection issue" widget while the page
    // is resetting itself after a post-deployment stale-chunk error.
    if (this.state.busy) {
      return <PageLoadingScreen />
    }

    if (this.state.error) {
      return (
        <GlobalErrorScreen
          error={this.state.error}
          onRetry={this.handleRetry}
          onBack={this.handleBack}
          busy={false}
          retryLabel="Try again"
          message={
            this.state.retryArmed
              ? "We still can't reach the server. Please check your connection and try again."
              : ""
          }
        />
      )
    }

    return this.props.children
  }
}

export default AppErrorBoundary
