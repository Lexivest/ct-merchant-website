import { supabase } from "./supabase"
import { isNetworkError } from "./friendlyErrors"

export function buildShopDetailCacheKey(shopId, userId) {
  return `shop_detail_${shopId}_${userId || "anon"}`
}

export async function fetchShopDetailData({
  shopId,
  userId = null,
  recordView = false,
}) {
  if (!shopId) {
    throw new Error("Shop id is required")
  }

  const { data: shopData, error: shopError } = await supabase
    .from("shops")
    .select("*")
    .eq("id", shopId)
    .maybeSingle()

  if (shopError) {
    if (isNetworkError(shopError)) {
      throw new Error("We could not open this shop right now. Please try again.")
    }
    throw shopError
  }

  if (!shopData) {
    throw new Error("This shop is unavailable right now. Please try again later.")
  }

  let cityName = "Local"
  let fetchedProducts = []
  let fetchedLikeCount = 0
  let fetchedApprovedNews = []
  let fetchedShopBanner = ""
  let fetchedHasLiked = false
  let fetchedOwnerProfile = null
  const tasks = []

  if (shopData.city_id) {
    tasks.push(
      supabase
        .from("cities")
        .select("name")
        .eq("id", shopData.city_id)
        .maybeSingle()
        .then((res) => {
          if (res.data?.name) cityName = res.data.name
        })
        .catch(() => {})
    )
  }

  if (shopData.owner_id) {
    tasks.push(
      supabase
        .rpc("get_public_profiles", { profile_ids: [shopData.owner_id] })
        .then((res) => {
          if (!res.error) {
            fetchedOwnerProfile = Array.isArray(res.data) ? res.data[0] || null : null
          }
        })
        .catch(() => {})
    )
  }

  tasks.push(
    supabase
      .from("products")
      .select("*")
      .eq("shop_id", shopId)
      .eq("is_available", true)
      .order("id", { ascending: true })
      .limit(100)
      .then((res) => {
        if (!res.error) fetchedProducts = res.data || []
      })
      .catch(() => {})
  )

  tasks.push(
    supabase
      .from("shop_likes")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", shopId)
      .then((res) => {
        if (!res.error) fetchedLikeCount = res.count || 0
      })
      .catch(() => {})
  )

  tasks.push(
    supabase
      .from("shop_banners_news")
      .select("content_type, content_data")
      .eq("shop_id", shopId)
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .then((res) => {
        if (res.error) return

        const rows = res.data || []
        fetchedApprovedNews = rows
          .filter((item) => item.content_type === "news")
          .map((item) => item.content_data)
          .filter(Boolean)

        const banners = rows.filter((item) => item.content_type === "banner")
        if (banners.length > 0) {
          fetchedShopBanner = banners[0]?.content_data || ""
        }
      })
      .catch(() => {})
  )

  if (userId) {
    tasks.push(
      supabase
        .from("shop_likes")
        .select("id")
        .eq("shop_id", shopId)
        .eq("user_id", userId)
        .maybeSingle()
        .then((res) => {
          fetchedHasLiked = Boolean(res.data)
        })
        .catch(() => {})
    )

    if (recordView && userId !== shopData.owner_id) {
      tasks.push(
        supabase
          .from("shop_views")
          .insert({ shop_id: shopId, viewer_id: userId })
          .then(() => {})
          .catch(() => {})
      )
    }
  }

  await Promise.allSettled(tasks)

  return {
    shop: { ...shopData, cities: { name: cityName } },
    products: fetchedProducts,
    likeCount: fetchedLikeCount,
    approvedNews: fetchedApprovedNews,
    shopBanner: fetchedShopBanner,
    hasLiked: fetchedHasLiked,
    ownerProfile: fetchedOwnerProfile,
  }
}
