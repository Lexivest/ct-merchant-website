import { memo } from "react"

function ScrollingTicker({
  text,
  className = "",
  textClassName = "",
  minDuration = 24,
  speedFactor = 0.18,
}) {
  if (!text) return null

  const duration = Math.max(minDuration, Math.round(text.length * speedFactor))

  return (
    <div className={`ctm-marquee ${className}`.trim()}>
      <div
        className="ctm-marquee-track"
        style={{ "--ctm-ticker-duration": `${duration}s` }}
      >
        <span className={`ctm-marquee-copy ${textClassName}`.trim()}>{text}</span>
        <span
          className={`ctm-marquee-copy ${textClassName}`.trim()}
          aria-hidden="true"
        >
          {text}
        </span>
      </div>
    </div>
  )
}

export default memo(ScrollingTicker)
