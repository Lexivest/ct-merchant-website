function AuthButton({
  children,
  loading = false,
  disabled = false,
  type = "button",
  onClick,
  variant = "primary",
  className = "",
}) {
  const styles = {
    primary:
      "bg-pink-600 text-white hover:bg-pink-700 shadow-[0_8px_20px_rgba(219,39,119,0.25)]",
    secondary:
      "bg-slate-900 text-white hover:bg-slate-800",
    outline:
      "border border-pink-200 bg-white text-slate-900 hover:bg-pink-50",
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={[
        "inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-extrabold transition",
        styles[variant],
        disabled || loading
          ? "cursor-not-allowed opacity-60"
          : "active:scale-[0.99]",
        className,
      ].join(" ")}
    >
      {loading ? (
        <>
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          <span>Processing...</span>
        </>
      ) : (
        children
      )}
    </button>
  )
}

export default AuthButton