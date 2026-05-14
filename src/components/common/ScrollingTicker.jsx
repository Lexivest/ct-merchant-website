import { memo } from "react"

function ScrollingTicker({
  text,
  children,
  className = "",
  textClassName = "",
  minDuration = 24,
  speedFactor = 0.18,
}) {
  const content = children || text

  if (!content) return null

  const durationBasis = typeof text === "string" ? text.length : 120
  const duration = Math.max(minDuration, Math.round(durationBasis * speedFactor))

  return (
    <div className={`ctm-marquee ${className}`.trim()}>
      <div
        className="ctm-marquee-track"
        style={{ "--ctm-ticker-duration": `${duration}s` }}
      >
        <span className={`ctm-marquee-copy ${textClassName}`.trim()}>
          {content}
        </span>
        <span
          className={`ctm-marquee-copy ${textClassName}`.trim()}
          aria-hidden="true"
        >
          {content}
        </span>
      </div>
    </div>
  )
}

export default memo(ScrollingTicker)
