import { useEffect, useRef, useState } from "react"
import { supabase } from "../../../lib/supabase"

/**
 * MarketTicker
 *
 * A thin horizontal broadcast strip placed inside the market dashboard.
 * Fetches active ticker_messages for the user's city (plus global messages
 * where city_id IS NULL) and cycles through them with a smooth fade animation.
 *
 * Renders nothing if there are no active messages.
 */
export default function MarketTicker({ cityId }) {
  const [messages, setMessages] = useState([])
  const [index, setIndex]       = useState(0)
  const [visible, setVisible]   = useState(true)
  const intervalRef             = useRef(null)

  // Fetch once when cityId is available
  useEffect(() => {
    if (!cityId) return

    supabase
      .from("ticker_messages")
      .select("id, message")
      .or(`city_id.eq.${cityId},city_id.is.null`)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (data?.length) setMessages(data)
      })
  }, [cityId])

  // Cycle through messages with a fade-out / swap / fade-in rhythm
  useEffect(() => {
    if (messages.length < 2) return

    intervalRef.current = setInterval(() => {
      // 1. Fade out
      setVisible(false)

      // 2. After CSS transition completes, swap the message and fade back in
      const swapTimer = setTimeout(() => {
        setIndex((prev) => (prev + 1) % messages.length)
        setVisible(true)
      }, 380) // matches the CSS transition duration below

      return () => clearTimeout(swapTimer)
    }, 4200)

    return () => clearInterval(intervalRef.current)
  }, [messages])

  if (!messages.length) return null

  return (
    <div
      className="market-ticker-bar"
      role="marquee"
      aria-live="polite"
      aria-atomic="true"
    >
      {/* Left accent pill */}
      <span className="market-ticker-pill">
        CTMerchant
      </span>

      {/* Animated message */}
      <p
        className="market-ticker-message"
        style={{
          opacity:   visible ? 1 : 0,
          transform: visible ? "translateY(0)" : "translateY(-5px)",
          transition: "opacity 0.35s ease, transform 0.35s ease",
        }}
      >
        {messages[index]?.message || ""}
      </p>
    </div>
  )
}
