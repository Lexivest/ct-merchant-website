function CTMLoader({
  size = "md",
  label = "CTM",
  className = "",
}) {
  const sizeClass =
    size === "sm"
      ? "h-12 w-12"
      : size === "lg"
        ? "h-20 w-20"
        : "h-16 w-16"

  const textClass =
    size === "sm"
      ? "text-[0.72rem]"
      : size === "lg"
        ? "text-[0.92rem]"
        : "text-[0.82rem]"

  return (
    <div className={`relative ${sizeClass} ${className}`.trim()}>
      <div className="absolute inset-0 rounded-full border-[3px] border-pink-200/70" />
      <div className="absolute inset-[-4px] animate-[ctmSpin_1.15s_linear_infinite] rounded-full border-[3px] border-transparent border-t-[#db2777] border-r-[#7c3aed]" />
      <div className="absolute inset-[7px] animate-[ctmSpinReverse_1.5s_linear_infinite] rounded-full border-[2px] border-transparent border-b-[#ec4899] border-l-[#9333ea]" />
      <div className="absolute inset-[13px] flex items-center justify-center rounded-full bg-white text-[#131921] shadow-[0_8px_18px_rgba(15,23,42,0.14)]">
        <span className={`font-black tracking-[0.18em] ${textClass}`}>{label}</span>
      </div>
    </div>
  )
}

export default CTMLoader
