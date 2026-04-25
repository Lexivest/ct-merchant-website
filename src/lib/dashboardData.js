import { primeCachedFetchStore, readCachedFetchStore } from "../hooks/useCachedFetch"
import { supabase } from "./supabase"

const DASHBOARD_CACHE_TTL = 1000 * 60 * 15
const DASHBOARD_TRANSITION_TIMEOUT = 12000

const loadUserDashboardPage = () => import("../pages/UserDashboard")

function normalizePositiveId(value) {
  const normalized = String(value ?? "").trim()
  if (!/^\d+$/.test(normalized)) return null

  const parsed = Number(normalized)
  if (!Number.isFinite(parsed) || parsed <= 0) return null

  return parsed
}

function unwrapSupabaseResult(result) {
  if (result?.error) {
    console.warn("Dashboard fetch failed/blocked. Defaulting to empty:", result.error.message)
    return null
  }

  return result?.data ?? null
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
      .maybeSingle()

    if (error) {
      console.warn("Dashboard profile fetch error:", error.message)
      return { city_id: 0, is_suspended: false }
    }
    if (data) currentProfile = data
  }

  const resolvedCityId = normalizePositiveId(currentProfile?.city_id)

  if (!resolvedCityId) return { city_id: 0, is_suspended: false }
  if (currentProfile.is_suspended) throw new Error("Account restricted")

  return {
    ...currentProfile,
    city_id: resolvedCityId,
  }
}

export function buildDashboardCacheKey(userId, cityId) {
  return `dashboard_cache_${userId || "guest"}_${cityId || "none"}`
}

export async function fetchFeaturedCityBanners(cityId) {
  const resolvedCityId = normalizePositiveId(cityId)
  if (!resolvedCityId) return []

  const nowIso = new Date().toISOString()
  const featuredBannersRes = await supabase
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
    .eq("city_id", resolvedCityId)
    .eq("status", "published")
    .or(`starts_at.is.null,starts_at.lte.${nowIso}`)
    .or(`ends_at.is.null,ends_at.gte.${nowIso}`)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(10)

  return unwrapSupabaseResult(
    featuredBannersRes,
    "Featured shops could not be loaded right now."
  ) || []
}

export async function fetchHomeHighlights() {
  const [announcementsRes, bannersRes] = await Promise.all([
    supabase
      .from("announcements")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("featured_city_banners")
      .select("id, title, subtitle, mobile_image_url")
      .eq("status", "published")
      .limit(3)
  ])

  return {
    announcements: announcementsRes.data || [],
    banners: bannersRes.data || []
  }
}

export async function fetchSponsoredProducts(cityId) {
  const resolvedCityId = normalizePositiveId(cityId)

  let query = supabase
    .from("sponsored_products")
    .select(`
      id,
      template_key,
      sort_order,
      status,
      city_id,
      shops(id, name)
    `)
    .eq("status", "published")
    .eq("layout", "product") // Filter for the new product layout
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(15)

  if (resolvedCityId) {
    query = query.or(`city_id.is.null,city_id.eq.${resolvedCityId}`)
  } else {
    query = query.is("city_id", null)
  }

  const { data, error } = await query
  
  if (error) {
    console.warn("Sponsored products fetch failed:", error.message)
    return []
  }

  // Fetch individual product details for each sponsored banner
  const productIds = (data || []).map(b => b.template_key).filter(Boolean)
  
  if (productIds.length === 0) return []

  const { data: products, error: pError } = await supabase
    .from("products")
    .select("*, shops(id, name)")
    .in("id", productIds)
    .eq("is_available", true)

  if (pError) {
    console.warn("Sponsored products fetch failed:", pError.message)
    return []
  }

  // Map products back to banner order
  const sponsored = (data || [])
    .map(banner => {
      const product = (products || []).find(p => String(p.id) === String(banner.template_key))
      if (!product) return null
      return {
        ...banner,
        product
      }
    })
    .filter(Boolean)

  return sponsored
}

export async function fetchStaffDiscoveries() {
  const { data, error } = await supabase
    .from("staff_discoveries")
    .select("*")
    .eq("status", "published")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(12)

  if (error) {
    console.warn("Staff discoveries fetch failed:", error.message)
    return []
  }

  // FALLBACK: If no staff discoveries exist, pick some available products to show as "Staff Picks"
  if (!data || data.length === 0) {
    const { data: fallbackProducts } = await supabase
      .from("products")
      .select("id, name, price, image_url")
      .eq("is_available", true)
      .limit(6)
    
    if (fallbackProducts) {
      return fallbackProducts.map(p => ({
        id: `fallback-${p.id}`,
        title: p.name,
        price: p.price,
        image_url: p.image_url,
        status: "published"
      }))
    }
  }

  return data || []
}

const DASHBOARD_BASE_TTL = 1000 * 60 * 60 * 24 // 24 hours for categories, etc.
const DASHBOARD_DYNAMIC_TTL = 1000 * 60 * 15 // 15 mins for shops/products

function normalizeNotificationMinute(value) {
  if (!value) return ""

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return String(value).slice(0, 16)
  }

  date.setSeconds(0, 0)
  return date.toISOString()
}

export function dedupeDashboardNotifications(items = []) {
  const safeItems = Array.isArray(items) ? items : []
  const seen = new Set()
  const result = []

  for (const item of safeItems) {
    if (!item) continue

    const dedupeKey = [
      item.user_id || "",
      item.kind || "system",
      item.title || "",
      item.message || "",
      item.action_path || "",
      normalizeNotificationMinute(item.created_at),
    ].join("::")

    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)
    result.push(item)
  }

  return result
}

export function buildDashboardBaseCacheKey(cityId) {
  return `dashboard_base_${cityId || "none"}`
}

export function buildDashboardDynamicCacheKey(userId, cityId) {
  return `dashboard_dynamic_${userId || "guest"}_${cityId || "none"}`
}

export async function fetchDashboardBaseData(cityId) {
  const resolvedCityId = normalizePositiveId(cityId)
  if (!resolvedCityId) {
    return {
      categories: [],
      areas: [],
      announcements: [],
    }
  }

  const [categoriesRes, areasRes, announcementsRes] = await Promise.all([
    supabase.from("categories").select("*").order("name"),
    supabase.from("areas").select("*").eq("city_id", resolvedCityId).order("name"),
    supabase.from("announcements").select("*").order("created_at", { ascending: false }),
  ])

  return {
    categories: unwrapSupabaseResult(categoriesRes) || [],
    areas: unwrapSupabaseResult(areasRes) || [],
    announcements: unwrapSupabaseResult(announcementsRes) || [],
  }
}

export async function fetchDashboardDynamicData({ userId, cityId }) {
  const resolvedCityId = normalizePositiveId(cityId)
  if (!resolvedCityId) {
    return {
      featuredCityBanners: [],
      sponsoredProducts: [],
      staffDiscoveries: [],
      fairlyUsedProducts: [],
      shops: [],
      notifications: [],
      wishlistCount: 0,
      unread: 0,
      products: [],
    }
  }

  const { data, error } = await supabase.rpc("get_dashboard_payload", {
    p_user_id: userId,
    p_city_id: resolvedCityId,
  })

  if (error) {
    console.error("Dashboard RPC fetch failed:", error.message)
    throw error
  }

  const notifications = dedupeDashboardNotifications(data.notifications || [])
  const rawFeaturedCityBanners =
    data.featured_city_banners || data.featured_banners || []
  const rawSponsoredProducts = data.sponsored_products || []
  const rawShops = Array.isArray(data.shops) ? data.shops : []
  const rawProducts = Array.isArray(data.products) ? data.products : []
  const rawFairlyUsedProducts = Array.isArray(data.fairly_used_products)
    ? data.fairly_used_products
    : []

  if (!Array.isArray(data.shops) || !Array.isArray(data.products)) {
    console.warn("[dashboard-rpc:market-shape]", {
      cityId: resolvedCityId,
      keys: Object.keys(data || {}),
      shopsType: typeof data?.shops,
      productsType: typeof data?.products,
    })
  }

  if (rawShops.length === 0 || rawProducts.length === 0) {
    console.info("[dashboard-rpc:market-empty]", {
      cityId: resolvedCityId,
      shops: rawShops.length,
      products: rawProducts.length,
      featuredBanners: Array.isArray(rawFeaturedCityBanners) ? rawFeaturedCityBanners.length : 0,
      sponsoredProducts: Array.isArray(rawSponsoredProducts) ? rawSponsoredProducts.length : 0,
    })
  }

  const featuredCityBanners = (
    Array.isArray(rawFeaturedCityBanners) && rawFeaturedCityBanners.length > 0
      ? rawFeaturedCityBanners
      : []
  )
    .filter(Boolean)

  const sponsoredProducts = (
    Array.isArray(rawSponsoredProducts) && rawSponsoredProducts.length > 0
      ? rawSponsoredProducts
      : []
  )
    .map((item) => {
      if (!item) return null
      if (item.product) return item

      const shopName =
        item.shop_name ||
        item.shops?.name ||
        item.product?.shops?.name ||
        ""

      return {
        ...item,
        product: {
          id: item.product_id || item.template_key || item.id,
          name: item.product_name || item.name || "Sponsored Product",
          price: item.price ?? item.product_price ?? 0,
          image_url: item.image_url || "",
          image_url_2: item.image_url_2 || null,
          image_url_3: item.image_url_3 || null,
          shops: shopName ? { name: shopName } : item.shops || null,
        },
      }
    })
    .filter(Boolean)

  // The RPC returns exactly what we need in one object, but we map snake_case to camelCase
  // to maintain compatibility with the existing frontend state.
  return {
    featuredCityBanners,
    sponsoredProducts,
    staffDiscoveries: data.staff_discoveries || [],
    fairlyUsedProducts: rawFairlyUsedProducts,
    shops: rawShops,
    notifications,
    wishlistCount: data.wishlist_count || 0,
    unread: notifications.filter((item) => !item.is_read).length,
    products: rawProducts,
  }
}
export async function fetchDashboardData({ userId, profile = null }) {
  if (!userId) throw new Error("Authentication required")

  const currentProfile = await resolveDashboardProfile({ userId, profile })
  const cityId = currentProfile.city_id

  const [base, dynamic] = await Promise.all([
    fetchDashboardBaseData(cityId),
    fetchDashboardDynamicData({ userId, cityId }),
  ])

  return {
    profile: currentProfile,
    ...base,
    ...dynamic,
    unread: dynamic.notifications.filter((item) => !item.is_read).length,
  }
}

export async function prepareDashboardTransition({
  userId,
  profile = null,
  timeoutMs = DASHBOARD_TRANSITION_TIMEOUT,
}) {
  if (!userId) throw new Error("Authentication required")

  const resolvedProfile = await resolveDashboardProfile({ userId, profile })
  const baseKey = buildDashboardBaseCacheKey(resolvedProfile.city_id)
  const dynamicKey = buildDashboardDynamicCacheKey(userId, resolvedProfile.city_id)
  
  const cachedBase = readCachedFetchStore(baseKey)
  const cachedDynamic = readCachedFetchStore(dynamicKey)

  // Amazon-style "Stale-While-Revalidate" Navigation:
  // If we have ANY cache (even if stale), return it immediately so the next page 
  // can render instantly while useCachedFetch handles the background sync.
  if (cachedBase?.data && cachedDynamic?.data) {
    // Start preloading the code without blocking
    void loadUserDashboardPage()
    
    return {
      profile: resolvedProfile,
      ...cachedBase.data,
      ...cachedDynamic.data,
      unread: (cachedDynamic.data.notifications || []).filter((item) => !item.is_read).length,
    }
  }

  // ONLY block if we have absolutely no cache to show
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

  // Split and prime
  const { profile: cachedProfile, notifications, wishlistCount, featuredCityBanners, sponsoredProducts, staffDiscoveries, fairlyUsedProducts, shops, products, ...basePart } = data
  void cachedProfile
  const dynamicPart = { notifications, wishlistCount, featuredCityBanners, sponsoredProducts, staffDiscoveries, fairlyUsedProducts, shops, products }

  primeCachedFetchStore(baseKey, basePart, Date.now(), { persist: "session" })
  primeCachedFetchStore(dynamicKey, dynamicPart, Date.now(), { persist: "session" })
  
  return data
}
