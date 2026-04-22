import { supabase } from "./supabase"
import { isNetworkError } from "./friendlyErrors"

export function buildShopDetailCacheKey(shopId, userId) {
  return `shop_detail_v2_${shopId}_${userId || "anon"}`
}

export async function fetchShopDetailData({
  shopId,
  userId = null,
  recordView = false,
}) {
  if (!shopId) {
    throw new Error("Shop id is required")
  }

  const { data, error } = await supabase.rpc("get_shop_detail_payload", {
    p_shop_id: shopId,
    p_user_id: recordView ? userId : null,
  })

  if (error) {
    console.error("Shop detail RPC error:", error)
    if (isNetworkError(error)) {
      throw new Error("We could not open this shop right now. Please try again.")
    }
    throw error
  }

  if (!data || !data.shop) {
    throw new Error("This shop is unavailable right now. Please try again later.")
  }

  return {
    shop: data.shop,
    products: data.products || [],
    likeCount: data.like_count || 0,
    approvedNews: data.approved_news || [],
    shopBanner: data.shop_banner || "",
    hasLiked: data.has_liked || false,
    ownerProfile: data.owner_profile || null,
  }
}
