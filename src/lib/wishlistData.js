import { supabase } from "./supabase"

export function buildWishlistCacheKey(userId) {
  return `wishlist_items_${userId || "guest"}`
}

export async function fetchWishlistData({ userId }) {
  if (!userId) return []

  const { data, error } = await supabase
    .from("wishlist")
    .select("product_id, created_at, products(*)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })

  if (error) throw error

  return (data || []).filter((item) => item.products)
}
