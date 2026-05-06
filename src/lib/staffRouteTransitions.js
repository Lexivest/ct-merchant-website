import { getStaffCommentThreads } from "../pages/staff/StaffPortalShared"
import { fetchContactSecurityRadar, fetchStaffShopAnalytics } from "./shopAnalytics"
import { fetchStaffCommissionsOverview } from "./staffCommissionsData"
import { fetchStaffPaymentsOverview } from "./staffPaymentsData"
import { hasStaffRouteComponent, normalizeStaffRoutePath, preloadStaffRouteComponent } from "./staffRouteRegistry"
import { supabase } from "./supabase"

const STAFF_ROUTE_TIMEOUT = 12000

function getStaffRouteScope(staffContext = {}) {
  const cityId = Number(staffContext.staffCityId)

  return {
    isSuperAdmin: staffContext.isSuperAdmin === true,
    staffCityId: Number.isFinite(cityId) && cityId > 0 ? cityId : null,
  }
}

function scopeByStaffCity(query, staffContext = {}, column = "city_id") {
  const { isSuperAdmin, staffCityId } = getStaffRouteScope(staffContext)
  return !isSuperAdmin && staffCityId ? query.eq(column, staffCityId) : query
}

function runTimedPreload(task, timeoutMessage, timeoutMs = STAFF_ROUTE_TIMEOUT) {
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

async function prepareStaffTrafficData() {
  const [visitStats, topPages] = await Promise.all([
    supabase.rpc("staff_site_visit_daily", { p_days: 30 }),
    supabase.rpc("staff_site_visit_top_pages", { p_days: 30, p_limit: 8 }),
  ])

  if (visitStats.error) throw visitStats.error
  if (topPages.error) throw topPages.error

  return {
    kind: "staff-traffic",
    visitWindow: 30,
    visitStats: visitStats.data || [],
    topPages: topPages.data || [],
  }
}

async function prepareStaffUsersData(staffContext = {}) {
  const { isSuperAdmin, staffCityId } = getStaffRouteScope(staffContext)
  const [citiesResult, usersResult] = await Promise.all([
    supabase
      .from("cities")
      .select("id, name, state")
      .order("state", { ascending: true })
      .order("name", { ascending: true }),
    supabase.rpc("staff_user_activity_summary", {
      p_inactive_days: 180,
      p_city_id: isSuperAdmin ? null : staffCityId,
    }),
  ])

  if (citiesResult.error) throw citiesResult.error
  if (usersResult.error) throw usersResult.error

  return {
    kind: "staff-users",
    cityOptions: citiesResult.data || [],
    selectedCityId: isSuperAdmin ? "all" : staffCityId ? String(staffCityId) : "all",
    inactiveDays: 180,
    userActivity: usersResult.data || [],
  }
}

async function prepareStaffCommunityData(staffContext = {}) {
  const { isSuperAdmin, staffCityId } = getStaffRouteScope(staffContext)
  const { data: commentRows, error: commentError } = await supabase
    .from("shop_comments")
    .select("id, shop_id, product_id, user_id, parent_id, body, status, moderation_reason, created_at, updated_at")
    .order("created_at", { ascending: false })
    .limit(200)

  if (commentError) throw commentError

  const comments = commentRows || []
  const shopIds = Array.from(new Set(comments.map((item) => item.shop_id).filter(Boolean)))
  let shopsQuery = shopIds.length
    ? supabase.from("shops").select("id, name, unique_id, owner_id, city_id").in("id", shopIds)
    : null

  if (shopsQuery && !isSuperAdmin && staffCityId) {
    shopsQuery = shopsQuery.eq("city_id", staffCityId)
  }

  const shopsResult = shopsQuery
    ? await shopsQuery
    : { data: [], error: null }

  if (shopsResult.error) throw shopsResult.error

  const validShopIds = new Set((shopsResult.data || []).map((shop) => shop.id))
  const visibleComments = comments.filter((comment) => validShopIds.has(comment.shop_id))
  const productIds = Array.from(new Set(visibleComments.map((item) => item.product_id).filter(Boolean)))
  const userIds = Array.from(new Set(visibleComments.map((item) => item.user_id).filter(Boolean)))

  const [productsResult, profilesResult] = await Promise.allSettled([
    productIds.length
      ? supabase.from("products").select("id, name, image_url").in("id", productIds)
      : Promise.resolve({ data: [] }),
    userIds.length
      ? supabase.from("profiles").select("id, full_name, avatar_url").in("id", userIds)
      : Promise.resolve({ data: [] }),
  ])

  const shopsMap = Object.fromEntries((shopsResult.data || []).map((shop) => [String(shop.id), shop]))
  const productsMap =
    productsResult.status === "fulfilled" && !productsResult.value.error
      ? Object.fromEntries((productsResult.value.data || []).map((product) => [String(product.id), product]))
      : {}
  const profilesMap =
    profilesResult.status === "fulfilled" && !profilesResult.value.error
      ? Object.fromEntries((profilesResult.value.data || []).map((profile) => [profile.id, profile]))
      : {}

  const enrichedComments = visibleComments.map((comment) => {
    const shop = shopsMap[String(comment.shop_id)] || null
    const product = comment.product_id ? productsMap[String(comment.product_id)] || null : null
    const profile = profilesMap[comment.user_id] || null
    return {
      ...comment,
      shop_name: shop?.name || "Unknown Shop",
      shop_unique_id: shop?.unique_id || "",
      shop_owner_id: shop?.owner_id || null,
      product_name: product?.name || "",
      product_image_url: product?.image_url || "",
      author_name: profile?.full_name || "CTMerchant User",
      author_avatar_url: profile?.avatar_url || "",
      is_owner_comment: Boolean(shop?.owner_id && shop.owner_id === comment.user_id),
    }
  })

  const commentThreads = getStaffCommentThreads(enrichedComments)
  const moderationDrafts = {}
  commentThreads.forEach((thread) => {
    thread.comments.forEach((comment) => {
      moderationDrafts[comment.id] = comment.moderation_reason || ""
    })
  })

  return {
    kind: "staff-community",
    commentThreads,
    moderationDrafts,
  }
}

async function prepareStaffVerificationsData(staffContext = {}) {
  let query = supabase
    .from("shops")
    .select(`
      id,
      name,
      unique_id,
      business_type,
      category,
      address,
      phone,
      whatsapp,
      status,
      rejection_reason,
      image_url,
      storefront_url,
      id_type,
      id_number,
      id_card_url,
      cac_number,
      cac_certificate_url,
      kyc_status,
      kyc_video_url,
      kyc_submission_meta,
      id_issued,
      created_at,
      owner_id,
      profiles ( full_name, avatar_url, phone ),
      cities ( name, state )
    `)

  query = scopeByStaffCity(query, staffContext)

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(100)

  if (error) throw error

  return {
    kind: "staff-verifications",
    shops: data || [],
  }
}

async function prepareStaffPaymentsData() {
  const overview = await fetchStaffPaymentsOverview()
  return {
    kind: "staff-payments",
    ...overview,
  }
}

async function prepareStaffCommissionsData() {
  const overview = await fetchStaffCommissionsOverview()
  return {
    kind: "staff-commissions",
    ...overview,
  }
}

async function prepareStaffShopAnalyticsData(staffContext = {}) {
  const { isSuperAdmin, staffCityId } = getStaffRouteScope(staffContext)
  const [rows, citiesResult] = await Promise.all([
    fetchStaffShopAnalytics({
      days: 30,
      cityId: isSuperAdmin ? null : staffCityId,
      limit: 100,
    }),
    supabase.from("cities").select("id, name, state").order("state").order("name"),
  ])

  if (citiesResult.error) throw citiesResult.error

  return {
    kind: "staff-shop-analytics",
    rows: rows || [],
    days: 30,
    selectedCityId: isSuperAdmin ? "all" : staffCityId ? String(staffCityId) : "all",
    cityOptions: citiesResult.data || [],
  }
}

async function loadFeaturedCityBannerPayload(staffContext = {}) {
  const { isSuperAdmin, staffCityId } = getStaffRouteScope(staffContext)
  const selectedCityId = isSuperAdmin ? "" : staffCityId ? String(staffCityId) : ""
  let bannersQuery = supabase
    .from("featured_city_banners")
    .select("*, cities(name, state), shops(name, category, address, image_url)")

  if (!isSuperAdmin && staffCityId) {
    bannersQuery = bannersQuery.eq("city_id", staffCityId)
  }

  const citiesResult = await supabase
    .from("cities")
    .select("id, name, state")
    .order("state")
    .order("name")

  if (citiesResult.error) throw citiesResult.error

  const { data: bannerRows, error: bannerError } = await bannersQuery
    .order("created_at", { ascending: false })
    .limit(100)

  if (bannerError) throw bannerError

  const safeCities = citiesResult.data || []
  const effectiveCityId =
    selectedCityId || (safeCities[0]?.id ? String(safeCities[0].id) : "")

  let shops = []
  let productsByShopId = {}
  let profilesById = {}

  if (effectiveCityId) {
    const { data: shopRows, error: shopsError } = await supabase
      .from("shops")
      .select("id, owner_id, name, category, address, image_url, is_open, status, subscription_end_date")
      .eq("city_id", Number(effectiveCityId))
      .order("name", { ascending: true })
      .limit(120)

    if (shopsError) throw shopsError

    shops = shopRows || []
    const shopIds = shops.map((shop) => shop.id)
    const ownerIds = Array.from(new Set(shops.map((shop) => shop.owner_id).filter(Boolean)))
    const [productsResult, profilesResult] = await Promise.all([
      shopIds.length
        ? supabase
            .from("products")
            .select("id, shop_id, image_url, is_available")
            .in("shop_id", shopIds)
            .eq("is_available", true)
            .not("image_url", "is", null)
            .order("id", { ascending: true })
            .limit(600)
        : Promise.resolve({ data: [], error: null }),
      ownerIds.length
        ? supabase.rpc("get_public_profiles", { profile_ids: ownerIds })
        : Promise.resolve({ data: [], error: null }),
    ])

    if (productsResult.error) throw productsResult.error
    if (profilesResult.error) throw profilesResult.error

    ;(productsResult.data || []).forEach((product) => {
      if (!product.shop_id || !product.image_url) return
      const key = String(product.shop_id)
      if (!productsByShopId[key]) productsByShopId[key] = []
      if (productsByShopId[key].length < 5) productsByShopId[key].push(product)
    })

    ;(profilesResult.data || []).forEach((profile) => {
      profilesById[profile.id] = profile
    })
  }

  return {
    kind: "staff-city-banners",
    cities: safeCities,
    banners: bannerRows || [],
    shops,
    productsByShopId,
    profilesById,
    selectedCityId: effectiveCityId,
    selectedShopId: shops[0]?.id ? String(shops[0].id) : "",
  }
}

async function prepareStaffFeaturedCityBannersData(staffContext = {}) {
  return loadFeaturedCityBannerPayload(staffContext)
}

async function prepareStaffDiscoveriesData() {
  const { data, error } = await supabase
    .from("staff_discoveries")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(100)

  if (error) throw error

  return {
    kind: "staff-discoveries",
    discoveries: data || [],
  }
}

async function prepareStaffInboxData() {
  const { data, error } = await supabase
    .from("contact_messages")
    .select("*")
    .order("created_at", { ascending: false })

  if (error) throw error

  return {
    kind: "staff-inbox",
    activeTab: "contact",
    items: (data || []).map((item) => ({ ...item, _type: "contact" })),
  }
}

async function prepareStaffSponsoredProductsData(staffContext = {}) {
  const { isSuperAdmin, staffCityId } = getStaffRouteScope(staffContext)
  const selectedCityId = isSuperAdmin ? "" : staffCityId ? String(staffCityId) : ""
  let bannersQuery = supabase.from("sponsored_products").select("*, cities(name), shops(name)")
  let productsQuery = supabase
    .from("products")
    .select(`
      id,
      name,
      price,
      image_url,
      image_url_2,
      image_url_3,
      shop_id,
      shops!inner(id, name, status, city_id)
    `)
    .eq("shops.status", "approved")
    .eq("is_available", true)
    .order("created_at", { ascending: false })
    .limit(50)

  if (!isSuperAdmin && staffCityId) {
    bannersQuery = bannersQuery.eq("city_id", staffCityId)
    productsQuery = productsQuery.eq("shops.city_id", staffCityId)
  }

  const [citiesResult, bannersResult, productsResult] = await Promise.all([
    supabase.from("cities").select("id, name, state").order("name"),
    bannersQuery.order("sort_order", { ascending: true }).order("created_at", { ascending: false }),
    productsQuery,
  ])

  if (citiesResult.error) throw citiesResult.error
  if (bannersResult.error) throw bannersResult.error
  if (productsResult.error) throw productsResult.error

  const enrichedBanners = await Promise.all((bannersResult.data || []).map(async (banner) => {
    if (!banner.template_key) return banner
    const { data: product } = await supabase
      .from("products")
      .select("id, name, price, image_url, image_url_2, image_url_3, shops(name)")
      .eq("id", banner.template_key)
      .maybeSingle()
    return { ...banner, product }
  }))

  return {
    kind: "staff-sponsored-products",
    cityOptions: citiesResult.data || [],
    cities: citiesResult.data || [],
    banners: enrichedBanners,
    availableProducts: productsResult.data || [],
    selectedCityId,
  }
}

async function prepareStaffSecurityRadarData(staffContext = {}) {
  const { isSuperAdmin, staffCityId } = getStaffRouteScope(staffContext)
  const cityId = isSuperAdmin ? null : staffCityId
  const [contactRadar, legacyResult, citiesResult] = await Promise.all([
    fetchContactSecurityRadar({
      days: 30,
      cityId,
    }),
    isSuperAdmin ? supabase.rpc("ctm_get_security_radar_insights") : Promise.resolve({ data: [], error: null }),
    supabase.from("cities").select("id, name, state").order("state").order("name"),
  ])
  if (legacyResult.error) throw legacyResult.error
  if (citiesResult.error) throw citiesResult.error

  return {
    kind: "staff-security-radar",
    contactRadar: contactRadar || [],
    insights: legacyResult.data || [],
    days: 30,
    selectedCityId: isSuperAdmin ? "all" : staffCityId ? String(staffCityId) : "all",
    cityOptions: citiesResult.data || [],
  }
}

async function prepareStaffProductsData(staffContext = {}) {
  let query = supabase
    .from("shops")
    .select(`
      id,
      name,
      unique_id,
      owner_id,
      city_id,
      profiles ( full_name ),
      products (
        id,
        name,
        description,
        price,
        discount_price,
        category,
        image_url,
        image_url_2,
        image_url_3,
        is_approved,
        rejection_reason,
        created_at,
        updated_at
      )
    `)

  query = scopeByStaffCity(query, staffContext)

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(100)

  if (error) throw error

  return {
    kind: "staff-products",
    shops: data || [],
  }
}

async function prepareStaffShopContentData(staffContext = {}) {
  let query = supabase
    .from("shop_banners_news")
    .select(`
      id,
      shop_id,
      content_type,
      content_data,
      status,
      created_at,
      shops!inner (
        id,
        name,
        unique_id,
        owner_id,
        city_id,
        profiles ( full_name )
      )
    `)

  const { isSuperAdmin, staffCityId } = getStaffRouteScope(staffContext)
  if (!isSuperAdmin && staffCityId) {
    query = query.eq("shops.city_id", staffCityId)
  }

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(100)

  if (error) throw error

  return {
    kind: "staff-shop-content",
    items: data || [],
  }
}

async function prepareStaffShopIdentityData() {
  const { data, error } = await supabase
    .from("shops")
    .select(`
      id,
      name,
      unique_id,
      owner_id,
      city_id,
      status,
      is_verified,
      is_open,
      phone,
      whatsapp,
      address,
      created_at,
      subscription_end_date,
      profiles ( full_name, phone ),
      cities ( name, state )
    `)
    .order("created_at", { ascending: false })
    .limit(60)

  if (error) throw error

  return {
    kind: "staff-shop-identity",
    shops: data || [],
  }
}

async function prepareStaffAnnouncementsData(staffContext = {}) {
  const { isSuperAdmin, staffCityId } = getStaffRouteScope(staffContext)
  let announcementsQuery = supabase.from("announcements").select("*").order("created_at", { ascending: false })
  if (!isSuperAdmin && staffCityId) {
    announcementsQuery = announcementsQuery.eq("city_id", staffCityId)
  }

  const [citiesRes, announcementsRes] = await Promise.all([
    supabase.from("cities").select("id, name, state").order("name"),
    announcementsQuery
  ])

  if (citiesRes.error) throw citiesRes.error
  if (announcementsRes.error) throw announcementsRes.error

  return {
    kind: "staff-announcements",
    cities: citiesRes.data || [],
    announcements: announcementsRes.data || [],
  }
}

async function prepareStaffNotificationsData(staffContext = {}) {
  const { isSuperAdmin, staffCityId } = getStaffRouteScope(staffContext)
  let profilesQuery = supabase.from("profiles").select("id, full_name, phone, city_id").order("full_name")
  let notificationsQuery = supabase
    .from("notifications")
    .select(`
      *,
      profiles!inner ( full_name, city_id )
    `)
    .order("created_at", { ascending: false })
    .limit(100)

  if (!isSuperAdmin && staffCityId) {
    profilesQuery = profilesQuery.eq("city_id", staffCityId)
    notificationsQuery = notificationsQuery.eq("profiles.city_id", staffCityId)
  }

  const [profilesRes, notificationsRes] = await Promise.all([
    profilesQuery,
    notificationsQuery
  ])

  if (profilesRes.error) throw profilesRes.error
  if (notificationsRes.error) throw notificationsRes.error

  return {
    kind: "staff-notifications",
    profiles: profilesRes.data || [],
    notifications: notificationsRes.data || [],
  }
}

const staffPreparers = {
  "/staff-traffic": prepareStaffTrafficData,
  "/staff-users": prepareStaffUsersData,
  "/staff-community": prepareStaffCommunityData,
  "/staff-verifications": prepareStaffVerificationsData,
  "/staff-products": prepareStaffProductsData,
  "/staff-shop-content": prepareStaffShopContentData,
  "/staff-shop-identity": prepareStaffShopIdentityData,
  "/staff-commissions": prepareStaffCommissionsData,
  "/staff-announcements": prepareStaffAnnouncementsData,
  "/staff-notifications": prepareStaffNotificationsData,
  "/staff-payments": prepareStaffPaymentsData,
  "/staff-shop-analytics": prepareStaffShopAnalyticsData,
  "/staff-city-banners": prepareStaffFeaturedCityBannersData,
  "/staff-sponsored-products": prepareStaffSponsoredProductsData,
  "/staff-discoveries": prepareStaffDiscoveriesData,
  "/staff-inbox": prepareStaffInboxData,
  "/staff-security-radar": prepareStaffSecurityRadarData,
}

export async function prepareStaffRouteTransition({
  path,
  timeoutMs = STAFF_ROUTE_TIMEOUT,
  staffContext = {},
}) {
  const pathname = normalizeStaffRoutePath(path)
  if (!hasStaffRouteComponent(pathname)) {
    throw new Error(`Staff route is not registered: ${pathname || "unknown route"}`)
  }

  return runTimedPreload(
    async () => {
      const routePreparer = staffPreparers[pathname]
      if (!routePreparer) {
        await preloadStaffRouteComponent(pathname)
        return null
      }

      const [prefetchedData] = await Promise.all([
        routePreparer(staffContext),
        preloadStaffRouteComponent(pathname),
      ])

      return prefetchedData
    },
    "Timed out while opening that staff page.",
    timeoutMs
  )
}
