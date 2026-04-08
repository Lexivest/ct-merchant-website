import { Component } from "react"
import { isNetworkError } from "../../lib/friendlyErrors"

function isChunkLoadFailure(error) {
  const message = String(error?.message || error || "").toLowerCase()
  return (
    message.includes("error loading dynamically imported module") ||
    message.includes("failed to fetch dynamically imported module") ||
    message.includes("importing a module script failed") ||
    message.includes("failed to load module script") ||
    message.includes("chunkloaderror") ||
    message.includes("loading chunk")
  )
}

function ErrorFallback({ error, onRetry, retryArmed }) {
  const chunkLoadFailure = isChunkLoadFailure(error)
  const networkError = isNetworkError(error)
  const isOffline = typeof navigator !== "undefined" ? !navigator.onLine : false

  let title = "Something went wrong"
  let description = "An unexpected error occurred. Please try again."

  if (isOffline || networkError) {
    title = "Network unavailable"
    description = "Please check your internet connection and retry."
  } else if (chunkLoadFailure) {
    title = "App Update Available"
    description = "A new version of the app is ready. Please reload to continue."
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <div className="w-full max-w-lg rounded-[28px] border border-pink-100 bg-white p-8 text-center shadow-xl">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-pink-100 text-3xl text-pink-600">
          !
        </div>
        <h1 className="mt-5 text-3xl font-black text-slate-900">
          {title}
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          {retryArmed ? "Waiting for connection to resume..." : description}
        </p>

        <div className="mt-6 flex flex-col gap-3">
          <button
            type="button"
            onClick={onRetry}
            className="flex-1 rounded-2xl bg-slate-900 px-5 py-3 font-bold text-white transition hover:bg-slate-800"
          >
            Retry
          </button>
          <button
            type="button"
            onClick={() => {
              if (typeof window !== "undefined") {
                window.history.back()
              }
            }}
            className="flex-1 rounded-2xl border border-pink-200 bg-pink-50 px-5 py-3 font-bold text-pink-700 transition hover:bg-pink-100"
          >
            Back
          </button>
        </div>
      </div>
    </div>
  )
}

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null, retryArmed: false }
  }

  static getDerivedStateFromError(error) {
    return { error, retryArmed: false }
  }

  componentDidMount() {
    if (typeof window !== "undefined") {
      window.addEventListener("online", this.handleReconnectRetry)
    }
  }

  componentWillUnmount() {
    if (typeof window !== "undefined") {
      window.removeEventListener("online", this.handleReconnectRetry)
    }
  }

  componentDidCatch(error, errorInfo) {
    console.error("AppErrorBoundary caught an error:", error, errorInfo)
  }

  componentDidUpdate(prevProps) {
    if (
      this.state.error &&
      prevProps.resetKey !== this.props.resetKey
    ) {
      this.setState({ error: null, retryArmed: false })
    }
  }

  handleReconnectRetry = () => {
    if (!this.state.retryArmed) return
    if (!isChunkLoadFailure(this.state.error) && !isNetworkError(this.state.error)) return
    if (typeof window !== "undefined") window.location.reload()
  }

  handleRetry = () => {
    if (isChunkLoadFailure(this.state.error) || isNetworkError(this.state.error)) {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        this.setState({ retryArmed: true })
        return
      }
      if (typeof window !== "undefined") window.location.reload()
      return
    }
    this.setState({ error: null, retryArmed: false })
  }

  render() {
    if (this.state.error) {
      return (
        <ErrorFallback
          error={this.state.error}
          onRetry={this.handleRetry}
          retryArmed={this.state.retryArmed}
        />
      )
    }

    return this.props.children
  }
}

export default AppErrorBoundary
