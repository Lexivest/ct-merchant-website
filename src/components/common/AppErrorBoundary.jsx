import { Component } from "react"

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
  const isOffline = typeof navigator !== "undefined" ? !navigator.onLine : false

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <div className="w-full max-w-lg rounded-[28px] border border-pink-100 bg-white p-8 text-center shadow-xl">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-pink-100 text-3xl text-pink-600">
          !
        </div>
        <h1 className="mt-5 text-3xl font-black text-slate-900">
          {chunkLoadFailure
            ? isOffline
              ? "You are offline"
              : "Page load interrupted"
            : "Something went wrong"}
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          {chunkLoadFailure
            ? isOffline
              ? "This screen was not available locally before your connection dropped. Reconnect and reload to continue."
              : "We could not load the required page assets. Reload the app to continue."
            : "We hit an unexpected problem while loading this page. You can retry the view or return to the home page."}
        </p>

        {!chunkLoadFailure && error?.message ? (
          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-left text-sm text-amber-900">
            {error.message}
          </div>
        ) : null}
        {chunkLoadFailure && retryArmed ? (
          <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-left text-sm text-blue-900">
            Connection is still offline. We will retry as soon as your internet is restored.
          </div>
        ) : null}

        <div className="mt-6 flex flex-col gap-3">
          <button
            type="button"
            onClick={onRetry}
            className="flex-1 rounded-2xl bg-slate-900 px-5 py-3 font-bold text-white transition hover:bg-slate-800"
          >
            {chunkLoadFailure ? "Reload app" : "Retry page"}
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
    if (!this.state.retryArmed || !isChunkLoadFailure(this.state.error)) return
    if (typeof window !== "undefined") window.location.reload()
  }

  handleRetry = () => {
    if (isChunkLoadFailure(this.state.error)) {
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
