import { useEffect } from "react"

export default function usePreventPullToRefresh() {
  useEffect(() => {
    let startY = 0

    const handleTouchStart = (e) => {
      startY = e.touches[0].clientY
    }

    const handleTouchMove = (e) => {
      const currentY = e.touches[0].clientY
      
      // If the user is swiping DOWN (currentY > startY) AND the window is at the very top
      if (currentY > startY && window.scrollY <= 0) {
        e.preventDefault() // Forcefully block the native browser refresh
      }
    }

    // We must use { passive: false } so the browser allows us to call preventDefault()
    document.addEventListener("touchstart", handleTouchStart, { passive: true })
    document.addEventListener("touchmove", handleTouchMove, { passive: false })

    return () => {
      document.removeEventListener("touchstart", handleTouchStart)
      document.removeEventListener("touchmove", handleTouchMove)
    }
  }, [])
}