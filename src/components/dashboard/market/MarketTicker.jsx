import { useEffect, useRef, useState } from "react"
import { supabase } from "../../../lib/supabase"

/**
 * MarketTicker
 *
 * A thin broadcast strip in the market dashboard. Fetches active messages
 * for the user's city + global ones, then cycles through them with a
 * directional slide animation (exits left, enters from right).
 *
 * Each message may carry an optional image_url shown as a 26 px thumbnail.
 * Renders nothing when there are no active messages.
 */
export default function MarketTicker({ cityId }) {
  const [messages,  setMessages]  = useState([])
  const [index,     setIndex]     = useState(0)
  const [phase,     setPhase]     = useState("visible")
  // "visible" | "exit" | "enter"
  // exit  → slides left + fades out
  // enter → teleport to right, no transition (instant reposition)
  // visible → slides left into place + fades in

  const intervalRef = useRef(null)

  // ── Fetch ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!cityId) return
    supabase
      .from("ticker_messages")
      .select("id, message, image_url")
      .or(`city_id.eq.${cityId},city_id.is.null`)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (data?.length) setMessages(data)
      })
  }, [cityId])

  // ── Cycle with 3-phase directional slide ──────────────────────────────
  useEffect(() => {
    if (messages.length < 2) return

    intervalRef.current = setInterval(() => {
      // Phase 1: slide current content out to the left
      setPhase("exit")

      // Phase 2: after exit transition completes, swap content and
      // teleport the new content to the right (transition: none)
      const swapTimer = setTimeout(() => {
        setIndex((prev) => (prev + 1) % messages.length)
        setPhase("enter")

        // Phase 3: one animation frame later, transition into view
        const enterTimer = setTimeout(() => {
          setPhase("visible")
        }, 32) // ~2 frames — enough for the browser to paint the "enter" position

        return () => clearTimeout(enterTimer)
      }, 320) // matches the exit CSS transition duration

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
      :                     "translateX(14px)",   // "enter" — off to the right
    transition:
      phase === "enter"
        ? "none"                                   // instant reposition, no animation
        : "opacity 0.3s ease, transform 0.3s ease",
    display: "flex",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
    flex: 1,
    overflow: "hidden",
  }

  return (
    <div
      className="market-ticker-bar"
      role="marquee"
      aria-live="polite"
      aria-atomic="true"
    >
      <div style={contentStyle}>
        {/* Optional thumbnail */}
        {current?.image_url ? (
          <img
            src={current.image_url}
            alt=""
            aria-hidden="true"
            style={{
              flexShrink: 0,
              width: 26,
              height: 26,
              borderRadius: 6,
              objectFit: "cover",
              background: "#1e293b",
            }}
          />
        ) : null}

        {/* Message text */}
        <p className="market-ticker-message">
          {current?.message || ""}
        </p>
      </div>
    </div>
  )
}
