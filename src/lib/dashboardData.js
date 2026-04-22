import { primeCachedFetchStore, readCachedFetchStore } from "../hooks/useCachedFetch"
import { supabase } from "./supabase"

const DASHBOARD_CACHE_TTL = 1000 * 60 * 15
const DASHBOARD_TRANSITION_TIMEOUT = 12000

const loadUserDashboardPage = () => import("../pages/UserDashboard")

function unwrapSupabaseResult(result) {
  if (result?.error) {
    console.warn("Dashboard fetch failed/blocked. Defaulting to empty:", result.error.message)
    return null
  }

  return result?.data ?? null
}

function unwrapSupabaseCount(result) {
  if (result?.error) {
    return 0
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
      .maybeSingle()

    if (error) {
      console.warn("Dashboard profile fetch error:", error.message)
      return { city_id: 0, is_suspended: false }
    }
    if (data) currentProfile = data
  }

  if (!currentProfile?.city_id) return { city_id: 0, is_suspended: false }
  if (currentProfile.is_suspended) throw new Error("Account restricted")

  return currentProfile
}

export function buildDashboardCacheKey(userId, cityId) {
  return `dashboard_cache_${userId || "guest"}_${cityId || "none"}`
}

export async function fetchFeaturedCityBanners(cityId) {
  if (!cityId) return []

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
    .eq("city_id", cityId)
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

  if (cityId) {
    query = query.or(`city_id.is.null,city_id.eq.${cityId}`)
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

export function buildDashboardBaseCacheKey(cityId) {
  return `dashboard_base_${cityId || "none"}`
}

export function buildDashboardDynamicCacheKey(userId, cityId) {
  return `dashboard_dynamic_${userId || "guest"}_${cityId || "none"}`
}

export async function fetchDashboardBaseData(cityId) {
  const [categoriesRes, areasRes, announcementsRes] = await Promise.all([
    supabase.from("categories").select("*").order("name"),
    supabase.from("areas").select("*").eq("city_id", cityId).order("name"),
    supabase.from("announcements").select("*").order("created_at", { ascending: false }),
  ])

  return {
    categories: unwrapSupabaseResult(categoriesRes) || [],
    areas: unwrapSupabaseResult(areasRes) || [],
    announcements: unwrapSupabaseResult(announcementsRes) || [],
  }
}

export async function fetchDashboardDynamicData({ userId, cityId }) {
  const { data, error } = await supabase.rpc("get_dashboard_payload", {
    p_user_id: userId,
    p_city_id: cityId,
  })

  if (error) {
    console.error("Dashboard RPC fetch failed:", error.message)
    throw error
  }

  // The RPC returns exactly what we need in one object, but we map snake_case to camelCase
  // to maintain compatibility with the existing frontend state.
  return {
    featuredCityBanners: data.featured_city_banners || [],
    sponsoredProducts: data.sponsored_products || [],
    staffDiscoveries: data.staff_discoveries || [],
    fairlyUsedProducts: data.fairly_used_products || [],
    shops: data.shops || [],
    notifications: data.notifications || [],
    wishlistCount: data.wishlist_count || 0,
    unread: data.unread_notifications || 0,
    // Note: The RPC doesn't currently return the full 'products' list (150+ items) 
    // that the old version fetched. If the UI strictly needs that broad list for 
    // global search/suggestions, we might need to add it to the RPC or keep one 
    // separate fetch. However, most dashboard sections now have their own 
    // dedicated arrays in the RPC response.
    products: [] 
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
  const { profile: p, notifications, wishlistCount, featuredCityBanners, sponsoredProducts, staffDiscoveries, fairlyUsedProducts, shops, products, ...basePart } = data
  const dynamicPart = { notifications, wishlistCount, featuredCityBanners, sponsoredProducts, staffDiscoveries, fairlyUsedProducts, shops, products }

  primeCachedFetchStore(baseKey, basePart, Date.now(), { persist: "session" })
  primeCachedFetchStore(dynamicKey, dynamicPart, Date.now(), { persist: "session" })
  
  return data
}
