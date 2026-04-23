import { useEffect, useState, useCallback } from "react"
import { supabase } from "../lib/supabase"
import useAuthSession from "./useAuthSession"

const SHOP_CACHE_KEY_PREFIX = "ctm_my_shop_"

function getShopCacheKey(userId) {
  return `${SHOP_CACHE_KEY_PREFIX}${userId || "guest"}`
}

function readCachedShop(userId) {
  if (!userId) return null
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const raw = window.localStorage.getItem(getShopCacheKey(userId))
      return raw ? JSON.parse(raw) : null
    }
  } catch {
    // ignore
  }
  return null
}

function writeCachedShop(userId, value) {
  if (!userId || !value) return
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(getShopCacheKey(userId), JSON.stringify(value))
    }
  } catch {
    // ignore cache write failures
  }
}

function clearCachedShop(userId) {
  if (!userId) return
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.removeItem(getShopCacheKey(userId))
    }
  } catch {
    // ignore cache cleanup failures
  }
}

function buildMetaFromShop(shopData) {
  if (!shopData) return { title: "Register Shop", status: "default" }
  if (shopData.is_open === false) return { title: "Locked", status: "locked" }
  if (shopData.status === "pending") return { title: "Pending", status: "pending" }
  if (shopData.status === "rejected") return { title: "Rejected", status: "rejected" }
  if (!shopData.is_verified && shopData.kyc_status === "submitted") {
    return { title: "Video Pending", status: "kyc_pending", subtitle: "Under Review" }
  }
  return { title: "My Shop", status: "approved" }
}

export default function useMyShop() {
  const { user, isOffline } = useAuthSession()
  const [shopData, setShopData] = useState(() => readCachedShop(user?.id))
  const [dataError, setDataError] = useState(false)
  const [loading, setLoading] = useState(true)
  const [hasResolvedOnline, setHasResolvedOnline] = useState(false)
  
  // Default fallback state
  const [shopMeta, setShopMeta] = useState({ title: "Checking...", status: "locked" })

  useEffect(() => {
    if (!user?.id) {
      setShopData(null)
      setHasResolvedOnline(false)
      setLoading(false)
      return
    }

    const cached = readCachedShop(user.id)
    setShopData(cached)
    setHasResolvedOnline(false)
    setLoading(false)
  }, [user?.id])

  const fetchShop = useCallback(async () => {
    if (!user?.id) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setDataError(false)
      const { data, error } = await supabase
        .from("shops")
        .select("id, status, rejection_reason, is_open, is_verified, kyc_status, kyc_video_url")
        .eq("owner_id", user.id)
        .maybeSingle()

      if (error) throw error

      setShopData(data)
      setHasResolvedOnline(true)
      if (data) {
        writeCachedShop(user.id, data)
      } else {
        clearCachedShop(user.id)
      }
    } catch (err) {
      console.error("Error fetching user shop status:", err)
      setDataError(true)
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  // Only attempt network fetch if we are online
  useEffect(() => {
    if (!isOffline) {
      fetchShop()
    }
  }, [fetchShop, isOffline])

  useEffect(() => {
    if (!user?.id || isOffline) return undefined

    const channel = supabase
      .channel(`public:shops:owner_id=eq.${user.id}:my-shop`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "shops",
          filter: `owner_id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            setShopData(null)
            clearCachedShop(user.id)
          } else {
            const nextShop = payload.new || null
            setShopData(nextShop)
            if (nextShop) {
              writeCachedShop(user.id, nextShop)
            } else {
              clearCachedShop(user.id)
            }

            window.setTimeout(() => {
              fetchShop()
            }, 0)
          }

          setDataError(false)
          setHasResolvedOnline(true)
          setLoading(false)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user?.id, isOffline, fetchShop])

  // ROBUST STATE INTERCEPTION (Handles Offline & Network Errors)
  useEffect(() => {
    const resolvedMeta = buildMetaFromShop(shopData)

    // 1. Completely offline
    if (isOffline) {
      setShopMeta({ 
        title: shopData ? resolvedMeta.title : "Shop Status", 
        status: shopData ? resolvedMeta.status : "locked",
        subtitle: shopData ? "Offline (cached status)" : "Offline Mode" 
      })
      return
    }

    // 2. Online, but Supabase fetch failed (and we have no cached shop)
    if (dataError && !shopData) {
      setShopMeta({ 
        title: "Shop Status", 
        status: "locked",
        subtitle: "Connection Error" 
      })
      return
    }

    // 3. Actively fetching for the first time
    if (loading && !shopData && !hasResolvedOnline) {
      setShopMeta({ title: "Checking...", status: "locked" })
      return
    }

    // 4. No confirmed result yet: stay neutral (prevents wrong "Register Shop" on weak network)
    if (!shopData && !hasResolvedOnline) {
      setShopMeta({ title: "Shop Status", status: "locked", subtitle: "Checking status..." })
      return
    }

    // 5. Confirmed no shop
    if (!shopData && hasResolvedOnline) {
      setShopMeta({ title: "Register Shop", status: "default" })
      return
    }

    // 6. Resolved shop state
    setShopMeta(resolvedMeta)
  }, [shopData, isOffline, dataError, loading, hasResolvedOnline])

  return {
    shopData,
    shopMeta,
    loading,
    dataError,
    hasResolvedOnline,
    canRegisterShop: hasResolvedOnline && !shopData && !isOffline && !dataError,
    refetchShop: fetchShop,
  }
}
