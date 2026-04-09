import { useEffect, useState } from "react"
import { Navigate } from "react-router-dom"
import useAuthSession from "../../hooks/useAuthSession"
import { supabase } from "../../lib/supabase"

const SUBSCRIPTION_CACHE_KEY = "ctmerchant_subscription_guard_v1"

function readCachedSubscription(userId) {
  if (typeof localStorage === "undefined" || !userId) return null

  try {
    const raw = localStorage.getItem(SUBSCRIPTION_CACHE_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw)
    if (parsed?.userId !== userId) return null

    return typeof parsed.isActive === "boolean" ? parsed.isActive : null
  } catch {
    return null
  }
}

function writeCachedSubscription(userId, isActive) {
  if (typeof localStorage === "undefined" || !userId) return

  try {
    localStorage.setItem(
      SUBSCRIPTION_CACHE_KEY,
      JSON.stringify({
        userId,
        isActive: Boolean(isActive),
        updatedAt: Date.now(),
      })
    )
  } catch {
    // ignore
  }
}

function clearCachedSubscription() {
  if (typeof localStorage === "undefined") return

  try {
    localStorage.removeItem(SUBSCRIPTION_CACHE_KEY)
  } catch {
    // ignore
  }
}

export default function SubscriptionGuard({ children }) {
  const { user, loading, isOffline } = useAuthSession()
  const [isActive, setIsActive] = useState(() =>
    user?.id ? readCachedSubscription(user.id) : null
  )
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    async function checkSubscription() {
      if (!user) {
        clearCachedSubscription()
        setIsActive(false)
        setChecking(false)
        return
      }

      const cachedStatus = readCachedSubscription(user.id)

      if (isOffline) {
        setIsActive(cachedStatus)
        setChecking(false)
        return
      }

      try {
        const { data, error } = await supabase
          .from("shops")
          .select("is_subscription_active")
          .eq("owner_id", user.id)
          .maybeSingle()

        if (error) throw error

        let nextIsActive = false
        if (data && data.is_subscription_active !== null) {
          nextIsActive = data.is_subscription_active === true
        }

        writeCachedSubscription(user.id, nextIsActive)
        setIsActive(nextIsActive)
      } catch (error) {
        console.error("Failed to verify subscription status:", error)
        setIsActive(cachedStatus)
      } finally {
        setChecking(false)
      }
    }

    if (!loading) {
      setChecking(true)
      void checkSubscription()
    }
  }, [user, loading, isOffline])

  if (loading || checking) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-slate-50">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-pink-600/20 border-t-pink-600"></div>
        <p className="mt-4 font-semibold text-slate-500">Verifying access...</p>
      </div>
    )
  }

  if (!isActive) {
    return <Navigate to="/service-fee" replace />
  }

  return children
}
