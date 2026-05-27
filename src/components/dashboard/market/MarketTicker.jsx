import { useEffect, useRef, useState } from "react"
import { supabase } from "../../../lib/supabase"

const DEFAULT_COLOR = "#1e3a8a" // dark blue fallback

/**
 * MarketTicker
 *
 * A 48 px broadcast strip in the market dashboard. Fetches active messages
 * for the user's city + global ones, cycles through them with a directional
 * slide animation, and smoothly cross-fades the bar background colour
 * between each message's chosen colour.
 */
export default function MarketTicker({ cityId }) {
  const [messages,  setMessages]  = useState([])
  const [index,     setIndex]     = useState(0)
  const [phase,     setPhase]     = useState("visible")
  const [barColor,  setBarColor]  = useState(DEFAULT_COLOR)
  // phase: "visible" | "exit" | "enter"

  const intervalRef = useRef(null)

  // ── Fetch ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!cityId) return
    supabase
      .from("ticker_messages")
      .select("id, message, image_url, bg_color")
      .or(`city_id.eq.${cityId},city_id.is.null`)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (data?.length) {
          setMessages(data)
          setBarColor(data[0]?.bg_color || DEFAULT_COLOR)
        }
      })
  }, [cityId])

  // ── Cycle with 3-phase directional slide + background colour fade ──────
  useEffect(() => {
    if (messages.length < 2) return

    intervalRef.current = setInterval(() => {
      // Phase 1: slide current content out to the left
      setPhase("exit")

      // Phase 2: swap content + teleport new content to right (no transition)
      const swapTimer = setTimeout(() => {
        setIndex((prev) => {
          const next = (prev + 1) % messages.length
          // Update bar colour at the same moment the content swaps
          setBarColor(messages[next]?.bg_color || DEFAULT_COLOR)
          return next
        })
        setPhase("enter")

        // Phase 3: slide into view
        const enterTimer = setTimeout(() => setPhase("visible"), 32)
        return () => clearTimeout(enterTimer)
      }, 320)

      return () => clearTimeout(swapTimer)
    }, 4500)

    return () => clearInterval(intervalRef.current)
  }, [messages])

  if (!messages.length) return null

  const current = messages[index]

  const contentStyle = {
    opacity:   phase === "visible" ? 1 : 0,
    transform:
      phase === "visible" ? "translateX(0)"
      : phase === "exit"  ? "translateX(-14px)"
      :                     "translateX(14px)",
    transition:
      phase === "enter"
        ? "none"
        : "opacity 0.3s ease, transform 0.3s ease",
    display:    "flex",
    alignItems: "center",
    gap:        10,
    minWidth:   0,
    flex:       1,
    overflow:   "hidden",
  }

  return (
    <div
      className="market-ticker-bar"
      role="marquee"
      aria-live="polite"
      aria-atomic="true"
      style={{
        background:  barColor,
        transition:  "background-color 0.6s ease",
      }}
    >
      <div className="ticker-inner-wrap">
        <div style={contentStyle}>
          {/* Optional thumbnail */}
          {current?.image_url ? (
            <img
              src={current.image_url}
              alt=""
              aria-hidden="true"
              style={{
                flexShrink:   0,
                width:        30,
                height:       30,
                borderRadius: 7,
                objectFit:    "cover",
                background:   "rgba(0,0,0,0.2)",
              }}
            />
          ) : null}

          {/* Message text */}
          <p className="market-ticker-message">
            {current?.message || ""}
          </p>
        </div>
      </div>
    </div>
  )
}
