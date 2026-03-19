import { useEffect, useState, useCallback } from "react"
import { supabase } from "../lib/supabase"
import useAuthSession from "./useAuthSession"

export default function useMyShop() {
  const { user, isOffline } = useAuthSession()
  const [shopData, setShopData] = useState(null)
  const [dataError, setDataError] = useState(false)
  const [loading, setLoading] = useState(true)
  
  // Default fallback state
  const [shopMeta, setShopMeta] = useState({ title: "Checking...", status: "locked" })

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
        .select("id, status, rejection_reason, is_open")
        .eq("owner_id", user.id)
        .maybeSingle()

      if (error) throw error

      setShopData(data)
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

  // ROBUST STATE INTERCEPTION (Handles Offline & Network Errors)
  useEffect(() => {
    // 1. Completely offline
    if (isOffline) {
      setShopMeta({ 
        title: shopData ? "My Shop" : "Shop Status", 
        status: "locked",
        subtitle: "Offline Mode" 
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
    if (loading && !shopData) {
      setShopMeta({ title: "Checking...", status: "locked" })
      return
    }

    // 4. Normal Operating Logic
    if (!shopData) {
      setShopMeta({ title: "Register Shop", status: "default" })
    } else if (shopData.is_open === false) {
      setShopMeta({ title: "Locked", status: "locked" })
    } else if (shopData.status === "pending") {
      setShopMeta({ title: "Pending", status: "pending" })
    } else if (shopData.status === "rejected") {
      setShopMeta({ title: "Rejected", status: "rejected" })
    } else {
      setShopMeta({ title: "My Shop", status: "approved" })
    }
  }, [shopData, isOffline, dataError, loading])

  return { shopData, shopMeta, loading, dataError, refetchShop: fetchShop }
}