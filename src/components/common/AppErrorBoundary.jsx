import { Component } from "react"
import { isNetworkError } from "../../lib/friendlyErrors"
import GlobalErrorScreen from "./GlobalErrorScreen"
import {
  forceFreshAppReload,
  isChunkLoadFailure,
  isCriticalAssetLoadFailure,
} from "../../lib/runtimeRecovery"

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null, retryArmed: false, busy: false }
  }

  static getDerivedStateFromError(error) {
    return { error, retryArmed: false, busy: false }
  }

  componentDidMount() {
    if (typeof window !== "undefined") {
      window.addEventListener("online", this.handleReconnectRetry)
      window.addEventListener("error", this.handleWindowError, true)
      window.addEventListener("unhandledrejection", this.handleUnhandledRejection)
      window.addEventListener("vite:preloadError", this.handleVitePreloadError)
    }
  }

  componentWillUnmount() {
    if (typeof window !== "undefined") {
      window.removeEventListener("online", this.handleReconnectRetry)
      window.removeEventListener("error", this.handleWindowError, true)
      window.removeEventListener("unhandledrejection", this.handleUnhandledRejection)
      window.removeEventListener("vite:preloadError", this.handleVitePreloadError)
    }
  }

  componentDidCatch(error, errorInfo) {
    // Amazon-style Telemetry: Capture structured error data
    const errorData = {
      name: error?.name || "ReactError",
      message: error?.message || String(error),
      stack: error?.stack,
      componentStack: errorInfo?.componentStack,
      url: window.location.href,
      timestamp: new Date().toISOString(),
    }

    console.error("Critical Application Error Caught:", errorData)

    if (typeof window !== "undefined") {
      if (!window.__CTM_CRASH_LOG__) window.__CTM_CRASH_LOG__ = []
      window.__CTM_CRASH_LOG__.push({ type: "react_boundary", ...errorData })
    }

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
    if (!isChunkLoadFailure(error)) return false
    if (typeof navigator !== "undefined" && !navigator.onLine) return false

    const started = forceFreshAppReload({ reason: "chunk", manual: false })
    this.setState({ error, retryArmed: false, busy: started })
    return started
  }

  handleWindowError = (event) => {
    if (isCriticalAssetLoadFailure(event)) {
      const error = new Error("Critical application asset failed to load.")
      if (!this.recoverFromChunkFailure(error)) {
        this.setState({ error, retryArmed: false, busy: false })
      }
      return
    }

    const error = event?.error
    if (!isChunkLoadFailure(error)) return

    if (!this.recoverFromChunkFailure(error)) {
      this.setState({ error, retryArmed: false, busy: false })
    }
  }

  handleUnhandledRejection = (event) => {
    const error = event?.reason
    if (!isChunkLoadFailure(error)) return

    event.preventDefault?.()
    if (!this.recoverFromChunkFailure(error)) {
      this.setState({ error, retryArmed: false, busy: false })
    }
  }

  handleVitePreloadError = (event) => {
    event.preventDefault?.()
    const error = event?.payload || new Error("vite:preloadError")

    if (!this.recoverFromChunkFailure(error)) {
      this.setState({ error, retryArmed: false, busy: false })
    }
  }

  handleReconnectRetry = () => {
    if (!this.state.retryArmed) return
    if (!isChunkLoadFailure(this.state.error) && !isNetworkError(this.state.error)) return
    this.handleRetry()
  }

  handleRetry = () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
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
    if (this.state.error) {
      return (
        <GlobalErrorScreen
          error={this.state.error}
          onRetry={this.handleRetry}
          onBack={this.handleBack}
          busy={this.state.busy}
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
