function AuthNotification({
  type = "info",
  title,
  message,
  visible = false,
}) {
  if (!visible || !message) return null

  const styles = {
    success:
      "border-pink-300 bg-pink-50 text-pink-800",
    error:
      "border-red-200 bg-red-50 text-red-700",
    warning:
      "border-amber-200 bg-amber-50 text-amber-800",
    info:
      "border-slate-200 bg-slate-50 text-slate-700",
  }

  const icons = {
    success: "✓",
    error: "!",
    warning: "!",
    info: "i",
  }

  return (
    <div
      className={`mt-4 flex items-start gap-3 rounded-2xl border-l-4 p-4 shadow-sm ${styles[type]}`}
      role="alert"
      aria-live="polite"
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/80 text-sm font-extrabold">
        {icons[type]}
      </div>

      <div className="min-w-0">
        {title ? (
          <p className="text-sm font-extrabold">{title}</p>
        ) : null}
        <p className="text-sm leading-6">{message}</p>
      </div>
    </div>
  )
}

export default AuthNotification