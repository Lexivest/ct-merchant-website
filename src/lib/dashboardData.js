import { primeCachedFetchStore, readCachedFetchStore } from "../hooks/useCachedFetch"
import { supabase } from "./supabase"

const DASHBOARD_CACHE_TTL = 1000 * 60 * 15
const DASHBOARD_TRANSITION_TIMEOUT = 12000

const loadUserDashboardPage = () => import("../pages/UserDashboard")

function unwrapSupabaseResult(result) {
  if (result?.error) {
    throw result.error
  }

  return result?.data ?? null
}

function unwrapSupabaseCount(result) {
  if (result?.error) {
    throw result.error
  }

  return result?.count ?? 0
}

function hasFreshCache(entry, ttl = DASHBOARD_CACHE_TTL) {
  return Boolean(entry && Date.now() - entry.timestamp <= ttl)
}

function runTimedPreload(task, timeoutMessage, timeoutMs = DASHBOARD_TRANSITION_TIMEOUT) {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error(timeoutMessage))
    }, timeoutMs)

    task()
      .then((result) => {
        window.clearTimeout(timeoutId)
        resolve(result)
      })
      .catch((error) => {
        window.clearTimeout(timeoutId)
        reject(error)
      })
  })
}

async function resolveDashboardProfile({ userId, profile = null }) {
  let currentProfile = profile

  if (!currentProfile?.city_id) {
    const { data, error } = await supabase
      .from("profiles")
      .select("*, cities(name)")
      .eq("id", userId)
      .single()

    if (error) throw error
    currentProfile = data
  }

  if (!currentProfile?.city_id) throw new Error("Profile not completed")
  if (currentProfile.is_suspended) throw new Error("Account restricted")

  return currentProfile
}

export function buildDashboardCacheKey(userId, cityId) {
  return `dashboard_cache_${userId || "guest"}_${cityId || "none"}`
}

export async function fetchDashboardData({ userId, profile = null }) {
  if (!userId) throw new Error("Authentication required")

  const currentProfile = await resolveDashboardProfile({ userId, profile })
  const cityId = currentProfile.city_id

  const [
    featuredBannersRes,
    announcementsRes,
    categoriesRes,
    areasRes,
    shopsRes,
    notificationsRes,
    wishlistRes,
  ] = await Promise.all([
    supabase
      .from("featured_city_banners")
      .select(`
        id,
        city_id,
        shop_id,
        title,
        subtitle,
        desktop_image_url,
        mobile_image_url,
        sort_order,
        status,
        starts_at,
        ends_at,
        shops (
          id,
          name,
          category,
          address,
          image_url,
          is_verified,
          is_open,
          status,
          subscription_end_date
        )
      `)
      .eq("city_id", cityId)
      .eq("status", "published")
      .or(`starts_at.is.null,starts_at.lte.${new Date().toISOString()}`)
      .or(`ends_at.is.null,ends_at.gte.${new Date().toISOString()}`)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(10),
    supabase.from("announcements").select("*").order("created_at", { ascending: false }),
    supabase.from("categories").select("*").order("name"),
    supabase.from("areas").select("*").eq("city_id", cityId).order("name"),
    supabase
      .from("shops")
      .select("*")
      .eq("city_id", cityId)
      .order("is_featured", { ascending: false })
      .order("is_verified", { ascending: false })
      .limit(200),
    supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase.from("wishlist").select("*", { count: "exact", head: true }).eq("user_id", userId),
  ])

  const featuredCityBanners = unwrapSupabaseResult(
    featuredBannersRes,
    "Featured shops could not be loaded right now."
  ) || []
  const announcements = unwrapSupabaseResult(
    announcementsRes,
    "Announcements could not be loaded right now."
  ) || []
  const categories = unwrapSupabaseResult(
    categoriesRes,
    "Categories could not be loaded right now."
  ) || []
  const areas = unwrapSupabaseResult(
    areasRes,
    "Areas could not be loaded right now."
  ) || []
  const shops = unwrapSupabaseResult(
    shopsRes,
    "Marketplace shops could not be loaded right now."
  ) || []
  const notifications = unwrapSupabaseResult(
    notificationsRes,
    "Notifications could not be loaded right now."
  ) || []
  const wishlistCount = unwrapSupabaseCount(
    wishlistRes,
    "Wishlist status could not be loaded right now."
  )

  let products = []
  const shopIds = shops.map((shop) => shop.id)

  if (shopIds.length > 0) {
    const productsRes = await supabase
      .from("products")
      .select("*")
      .in("shop_id", shopIds)
      .eq("is_available", true)
      .limit(400)
      .order("id", { ascending: true })

    products = unwrapSupabaseResult(
      productsRes,
      "Products could not be loaded right now."
    ) || []
  }

  return {
    profile: currentProfile,
    promos: [],
    featuredCityBanners,
    announcements,
    categories,
    areas,
    shops,
    products,
    notifications,
    wishlistCount,
    unread: notifications.filter((item) => !item.is_read).length,
  }
}

export async function prepareDashboardTransition({
  userId,
  profile = null,
  timeoutMs = DASHBOARD_TRANSITION_TIMEOUT,
}) {
  if (!userId) throw new Error("Authentication required")

  const resolvedProfile = await resolveDashboardProfile({ userId, profile })
  const cacheKey = buildDashboardCacheKey(userId, resolvedProfile.city_id)
  const cachedEntry = readCachedFetchStore(cacheKey)

  if (hasFreshCache(cachedEntry)) {
    await loadUserDashboardPage()
    return cachedEntry.data
  }

  const data = await runTimedPreload(
    async () => {
      const prefetchedData = await fetchDashboardData({
        userId,
        profile: resolvedProfile,
      })
      await loadUserDashboardPage()
      return prefetchedData
    },
    "Timed out while opening the dashboard.",
    timeoutMs
  )

  primeCachedFetchStore(cacheKey, data, Date.now(), { persist: "session" })
  return data
}
