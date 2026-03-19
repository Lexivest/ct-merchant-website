import { useEffect, useState, useCallback } from "react"
import { supabase } from "../lib/supabase"
import useAuthSession from "./useAuthSession"

export default function useMyShop() {
  const { user } = useAuthSession()
  const [shopData, setShopData] = useState(null)
  
  // Default state before data loads
  const [shopMeta, setShopMeta] = useState({ title: "Register Shop", status: "default" })
  const [loading, setLoading] = useState(true)

  const fetchShop = useCallback(async () => {
    if (!user?.id) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      const { data, error } = await supabase
        .from("shops")
        .select("id, status, rejection_reason, is_open")
        .eq("owner_id", user.id)
        .maybeSingle()

      if (error) throw error

      setShopData(data)

      // Evaluate logic immediately upon fetching
      if (!data) {
        setShopMeta({ title: "Register Shop", status: "default" })
      } else if (data.is_open === false) {
        setShopMeta({ title: "Locked", status: "locked" })
      } else if (data.status === "pending") {
        setShopMeta({ title: "Pending", status: "pending" })
      } else if (data.status === "rejected") {
        setShopMeta({ title: "Rejected", status: "rejected" })
      } else {
        setShopMeta({ title: "My Shop", status: "approved" })
      }
    } catch (err) {
      console.error("Error fetching user shop status:", err)
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    fetchShop()
  }, [fetchShop])

  return { shopData, shopMeta, loading, refetchShop: fetchShop }
}