import { useEffect, useRef, useState } from "react"
import { FaBolt } from "react-icons/fa6"
import { supabase } from "../../../lib/supabase"

// ── Helpers ────────────────────────────────────────────────────────────────

function calcRemaining(endsAt) {
  const diff = new Date(endsAt).getTime() - Date.now()
  if (diff <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, totalSeconds: 0, expired: true }
  }
  const totalSeconds = Math.floor(diff / 1000)
  return {
    days:         Math.floor(totalSeconds / 86400),
    hours:        Math.floor(totalSeconds / 3600) % 24,
    minutes:      Math.floor(totalSeconds / 60) % 60,
    seconds:      totalSeconds % 60,
    totalSeconds,
    expired:      false,
  }
}

// ── Sub-component: a single digit block ───────────────────────────────────

function DigitBlock({ value, label, urgent }) {
  const display = String(value).padStart(2, "0")
  return (
    <div className="flash-digit-wrap">
      <span className={`flash-digit-block${urgent ? " flash-digit-urgent" : ""}`}>
        {display}
      </span>
      <span className="flash-digit-label">{label}</span>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export default function FlashSaleBar({ cityId }) {
  const [sales,      setSales]      = useState([])
  const [saleIndex,  setSaleIndex]  = useState(0)
  const [countdown,  setCountdown]  = useState(null)
  const tickRef = useRef(null)

  // ── Fetch active, non-expired sales ──────────────────────────────────
  // Re-fetches every 5 minutes so newly-started sales appear without a
  // full page reload (flash sales can start after the initial dashboard load).
  useEffect(() => {
    if (!cityId) return

    function fetchSales() {
      const nowIso = new Date().toISOString()

      supabase
        .from("flash_sales")
        .select("id, title, subtitle, discount_label, image_url, ends_at")
        .or(`city_id.eq.${cityId},city_id.is.null`)
        .eq("is_active", true)
        .lte("starts_at", nowIso)
        .gt("ends_at",   nowIso)
        .order("ends_at", { ascending: true })
        .limit(10)
        .then(({ data }) => {
          if (data?.length) {
            setSales(data)
            setSaleIndex(0)
            setCountdown(calcRemaining(data[0].ends_at))
          }
        })
    }

    fetchSales()
    const refetchInterval = setInterval(fetchSales, 5 * 60 * 1000) // every 5 min
    return () => clearInterval(refetchInterval)
  }, [cityId])

  // ── 1-second countdown tick ───────────────────────────────────────────
  useEffect(() => {
    if (!sales.length) return

    clearInterval(tickRef.current)

    tickRef.current = setInterval(() => {
      setSaleIndex((currentIndex) => {
        const current = sales[currentIndex]
        if (!current) return currentIndex

        const next = calcRemaining(current.ends_at)
        setCountdown(next)

        // Current sale just expired — try to advance to the next one
        if (next.expired) {
          const nextIndex = currentIndex + 1
          if (nextIndex < sales.length) {
            setCountdown(calcRemaining(sales[nextIndex].ends_at))
            return nextIndex
          }
          // All sales expired — leave index as-is; render returns null below
        }

        return currentIndex
      })
    }, 1000)

    return () => clearInterval(tickRef.current)
  }, [sales])

  // Nothing to show
  if (!sales.length || !countdown) return null

  const current = sales[saleIndex]
  if (!current || countdown.expired) return null

  const isUrgent = countdown.days === 0 && countdown.hours === 0 && countdown.minutes < 10
  const showDays = countdown.days > 0

  return (
    <div className={`flash-sale-bar${isUrgent ? " flash-sale-bar--urgent" : ""}`}>

      {/* ── Left: image spans the full bar height (both rows) ─────────── */}
      <div className="flash-sale-media">
        {current.image_url ? (
          <img
            src={current.image_url}
            alt=""
            aria-hidden="true"
            className="flash-sale-img"
          />
        ) : (
          <div className="flash-sale-icon-wrap">
            <FaBolt className="flash-sale-icon" />
          </div>
        )}
      </div>

      {/* ── Right column: header row + main row stacked ───────────────── */}
      <div className="flash-sale-content">

        {/* Row 1: label centred via flex; badge is position:absolute so it
             never pushes the label off-centre on narrow screens            */}
        <div className="flash-sale-header">
          <span className="flash-sale-header-label">
            <FaBolt className="flash-sale-header-bolt" />
            Flash Sale
          </span>
          {current.discount_label ? (
            <span className="flash-sale-badge">{current.discount_label}</span>
          ) : null}
        </div>

        {/* Row 2: scrolling text · countdown */}
        <div className="flash-sale-main-row">
          <div className="flash-sale-text">
            <div className="flash-sale-marquee-track">
              <span className="flash-sale-marquee-copy">
                <span className="flash-sale-title">{current.title}</span>
                {current.subtitle ? (
                  <>
                    <span style={{ color: "rgba(255,255,255,0.35)", fontWeight: 900, fontSize: "0.7rem" }}>—</span>
                    <span className="flash-sale-subtitle">{current.subtitle}</span>
                  </>
                ) : null}
              </span>
              <span className="flash-sale-marquee-copy" aria-hidden="true">
                <span className="flash-sale-title">{current.title}</span>
                {current.subtitle ? (
                  <>
                    <span style={{ color: "rgba(255,255,255,0.35)", fontWeight: 900, fontSize: "0.7rem" }}>—</span>
                    <span className="flash-sale-subtitle">{current.subtitle}</span>
                  </>
                ) : null}
              </span>
            </div>
          </div>

          <div className="flash-sale-timer" aria-label="Time remaining">
            {showDays ? <DigitBlock value={countdown.days}    label="d" urgent={isUrgent} /> : null}
            <DigitBlock               value={countdown.hours}   label="h" urgent={isUrgent} />
            <DigitBlock               value={countdown.minutes} label="m" urgent={isUrgent} />
            <DigitBlock               value={countdown.seconds} label="s" urgent={isUrgent} />
          </div>
        </div>

      </div>
    </div>
  )
}
