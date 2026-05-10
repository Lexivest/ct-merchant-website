import { useEffect, useState } from "react"
import { Navigate, useLocation } from "react-router-dom"
import useAuthSession from "../../hooks/useAuthSession"
import { supabase } from "../../lib/supabase"
import { PageLoadingScreen } from "../common/PageStatusScreen"

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
  const location = useLocation()
  const { user, loading, isOffline } = useAuthSession()
  const routeVerifiedActive = location.state?.verifiedSubscriptionActive === true
  const [isActive, setIsActive] = useState(() =>
    routeVerifiedActive ? true : user?.id ? readCachedSubscription(user.id) : null
  )
  const [checking, setChecking] = useState(() => !routeVerifiedActive)

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
          .select("subscription_end_date")
          .eq("owner_id", user.id)
          .maybeSingle()

        if (error) throw error

        let nextIsActive = false
        if (data?.subscription_end_date) {
          const endDate = new Date(data.subscription_end_date)
          nextIsActive = !isNaN(endDate.getTime()) && endDate.getTime() > Date.now()
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
      if (routeVerifiedActive && user?.id) {
        writeCachedSubscription(user.id, true)
        setIsActive(true)
        setChecking(false)
        return
      }

      setChecking(true)
      void checkSubscription()
    }
  }, [user, loading, isOffline, routeVerifiedActive])

  if (loading || checking) {
    return <PageLoadingScreen />
  }

  if (!isActive) {
    return <Navigate to="/service-fee" replace />
  }

  return children
}
