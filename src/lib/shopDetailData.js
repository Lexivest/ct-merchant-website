import { supabase } from "./supabase"
import { isNetworkError } from "./friendlyErrors"

export function buildShopDetailCacheKey(shopId, userId) {
  return `shop_detail_v2_${shopId}_${userId || "anon"}`
}

function normalizeRecordId(value) {
  const trimmedValue = String(value || "").trim()
  if (/^\d+$/.test(trimmedValue)) {
    const numericValue = Number(trimmedValue)
    if (Number.isSafeInteger(numericValue)) {
      return numericValue
    }
  }
  return trimmedValue
}

async function fetchShopDetailDataDirect({ shopId, userId = null }) {
  const normalizedShopId = normalizeRecordId(shopId)

  const { data: shop, error: shopError } = await supabase
    .from("shops")
    .select(`
      *,
      cities (
        name
      )
    `)
    .eq("id", normalizedShopId)
    .maybeSingle()

  if (shopError) {
    throw shopError
  }

  if (!shop) {
    throw new Error("This shop is unavailable right now. Please try again later.")
  }

  const [
    productsResult,
    likesResult,
    contentResult,
    ownerProfileResult,
    hasLikedResult,
  ] = await Promise.allSettled([
    supabase
      .from("products")
      .select("*")
      .eq("shop_id", normalizedShopId)
      .eq("is_available", true)
      .order("id", { ascending: true })
      .limit(100),
    supabase
      .from("shop_likes")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", normalizedShopId),
    supabase
      .from("shop_banners_news")
      .select("content_type, content_data")
      .eq("shop_id", normalizedShopId)
      .eq("status", "approved")
      .order("created_at", { ascending: false }),
    shop.owner_id
      ? supabase
          .from("profiles")
          .select("id, full_name, avatar_url")
          .eq("id", shop.owner_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    userId
      ? supabase
          .from("shop_likes")
          .select("id")
          .eq("shop_id", normalizedShopId)
          .eq("user_id", userId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])

  const products =
    productsResult.status === "fulfilled" && !productsResult.value.error
      ? productsResult.value.data || []
      : []

  const likeCount =
    likesResult.status === "fulfilled" && !likesResult.value.error
      ? likesResult.value.count || 0
      : 0

  const contentRows =
    contentResult.status === "fulfilled" && !contentResult.value.error
      ? contentResult.value.data || []
      : []

  const approvedNews = contentRows
    .filter((item) => item.content_type === "news")
    .map((item) => item.content_data)
    .filter(Boolean)

  const shopBanner =
    contentRows.find((item) => item.content_type === "banner")?.content_data || ""

  const ownerProfile =
    ownerProfileResult.status === "fulfilled" && !ownerProfileResult.value.error
      ? ownerProfileResult.value.data || null
      : null

  const hasLiked =
    hasLikedResult.status === "fulfilled" && !hasLikedResult.value.error
      ? Boolean(hasLikedResult.value.data)
      : false

  return {
    shop,
    products,
    likeCount,
    approvedNews,
    shopBanner,
    hasLiked,
    ownerProfile,
  }
}

export async function fetchShopDetailData({
  shopId,
  userId = null,
  recordView = false,
}) {
  if (!shopId) {
    throw new Error("Shop id is required")
  }

  const normalizedShopId = normalizeRecordId(shopId)

  const { data, error } = await supabase.rpc("get_shop_detail_payload", {
    p_shop_id: normalizedShopId,
    p_user_id: recordView ? userId : null,
  })

  if (error) {
    console.error("Shop detail RPC error:", error)
    if (isNetworkError(error)) {
      throw new Error("We could not open this shop right now. Please try again.")
    }

    try {
      return await fetchShopDetailDataDirect({
        shopId: normalizedShopId,
        userId,
      })
    } catch (fallbackError) {
      console.error("Shop detail direct fallback error:", fallbackError)
      throw fallbackError
    }
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
