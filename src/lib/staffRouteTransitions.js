import { getStaffCommentThreads } from "../pages/staff/StaffPortalShared"
import { supabase } from "./supabase"

const STAFF_ROUTE_TIMEOUT = 12000

const staffRouteLoaders = {
  "/staff-traffic": () => import("../pages/staff/StaffTraffic"),
  "/staff-users": () => import("../pages/staff/StaffUsers"),
  "/staff-community": () => import("../pages/staff/StaffCommunity"),
  "/staff-verifications": () => import("../pages/staff/StaffVerifications"),
  "/staff-products": () => import("../pages/staff/StaffProducts"),
  "/staff-shop-content": () => import("../pages/staff/StaffShopContent"),
  "/staff-announcements": () => import("../pages/staff/StaffAnnouncements"),
  "/staff-notifications": () => import("../pages/staff/StaffNotifications"),
  "/staff-payments": () => import("../pages/staff/StaffPayments"),
  "/staff-city-banners": () => import("../pages/staff/StaffFeaturedCityBanners"),
  "/staff-sponsored-products": () => import("../pages/staff/StaffSponsoredProducts"),
  "/staff-inbox": () => import("../pages/staff/StaffInbox"),
  "/staff-security-radar": () => import("../pages/staff/StaffSecurityRadar"),
  "/staff-studio": () => import("../pages/vendors/ImageOptimizer"),
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

async function prepareStaffUsersData() {
  const [citiesResult, usersResult] = await Promise.all([
    supabase
      .from("cities")
      .select("id, name, state")
      .order("state", { ascending: true })
      .order("name", { ascending: true }),
    supabase.rpc("staff_user_activity_summary", {
      p_inactive_days: 180,
      p_city_id: null,
    }),
  ])

  if (citiesResult.error) throw citiesResult.error
  if (usersResult.error) throw usersResult.error

  return {
    kind: "staff-users",
    cityOptions: citiesResult.data || [],
    selectedCityId: "all",
    inactiveDays: 180,
    userActivity: usersResult.data || [],
  }
}

async function prepareStaffCommunityData() {
  const { data: commentRows, error: commentError } = await supabase
    .from("shop_comments")
    .select("id, shop_id, product_id, user_id, parent_id, body, status, moderation_reason, created_at, updated_at")
    .order("created_at", { ascending: false })
    .limit(200)

  if (commentError) throw commentError

  const comments = commentRows || []
  const shopIds = Array.from(new Set(comments.map((item) => item.shop_id).filter(Boolean)))
  const productIds = Array.from(new Set(comments.map((item) => item.product_id).filter(Boolean)))
  const userIds = Array.from(new Set(comments.map((item) => item.user_id).filter(Boolean)))

  const [shopsResult, productsResult, profilesResult] = await Promise.allSettled([
    shopIds.length
      ? supabase.from("shops").select("id, name, unique_id, owner_id").in("id", shopIds)
      : Promise.resolve({ data: [] }),
    productIds.length
      ? supabase.from("products").select("id, name, image_url").in("id", productIds)
      : Promise.resolve({ data: [] }),
    userIds.length
      ? supabase.from("profiles").select("id, full_name, avatar_url").in("id", userIds)
      : Promise.resolve({ data: [] }),
  ])

  const shopsMap =
    shopsResult.status === "fulfilled" && !shopsResult.value.error
      ? Object.fromEntries((shopsResult.value.data || []).map((shop) => [String(shop.id), shop]))
      : {}
  const productsMap =
    productsResult.status === "fulfilled" && !productsResult.value.error
      ? Object.fromEntries((productsResult.value.data || []).map((product) => [String(product.id), product]))
      : {}
  const profilesMap =
    profilesResult.status === "fulfilled" && !profilesResult.value.error
      ? Object.fromEntries((profilesResult.value.data || []).map((profile) => [profile.id, profile]))
      : {}

  const enrichedComments = comments.map((comment) => {
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

async function prepareStaffVerificationsData() {
  const { data, error } = await supabase
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
    .order("created_at", { ascending: false })
    .limit(100)

  if (error) throw error

  return {
    kind: "staff-verifications",
    shops: data || [],
  }
}

async function prepareStaffPaymentsData() {
  const { data, error } = await supabase
    .from("offline_payment_proofs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100)

  if (error) throw error

  return {
    kind: "staff-payments",
    proofs: data || [],
  }
}

async function prepareStaffFeaturedCityBannersData() {
  const [citiesResult, bannersResult] = await Promise.all([
    supabase.from("cities").select("id, name, state").order("state").order("name"),
    supabase
      .from("featured_city_banners")
      .select("id, title, status, created_at")
      .order("created_at", { ascending: false })
      .limit(20),
  ])

  if (citiesResult.error) throw citiesResult.error
  if (bannersResult.error) throw bannersResult.error

  return {
    kind: "staff-city-banners",
    cityCount: (citiesResult.data || []).length,
    bannerCount: (bannersResult.data || []).length,
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

async function prepareStaffSponsoredProductsData() {
  const [citiesResult] = await Promise.all([
    supabase.from("cities").select("id, name, state").order("name"),
  ])

  if (citiesResult.error) throw citiesResult.error

  return {
    kind: "staff-sponsored-products",
    cityOptions: citiesResult.data || [],
  }
}

async function prepareStaffSecurityRadarData() {
  const { data, error } = await supabase.rpc("ctm_get_security_radar_insights")
  if (error) throw error

  return {
    kind: "staff-security-radar",
    insights: data || [],
  }
}

async function prepareStaffProductsData() {
  const { data, error } = await supabase
    .from("shops")
    .select(`
      id,
      name,
      unique_id,
      owner_id,
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
        created_at
      )
    `)
    .order("created_at", { ascending: false })
    .limit(50)

  if (error) throw error

  return {
    kind: "staff-products",
    shops: data || [],
  }
}

async function prepareStaffShopContentData() {
  const { data, error } = await supabase
    .from("shop_banners_news")
    .select(`
      id,
      shop_id,
      content_type,
      content_data,
      status,
      created_at,
      shops (
        id,
        name,
        unique_id,
        owner_id,
        profiles ( full_name )
      )
    `)
    .order("created_at", { ascending: false })
    .limit(100)

  if (error) throw error

  return {
    kind: "staff-shop-content",
    items: data || [],
  }
}

async function prepareStaffAnnouncementsData() {
  const [citiesRes, announcementsRes] = await Promise.all([
    supabase.from("cities").select("id, name, state").order("name"),
    supabase.from("announcements").select("*").order("created_at", { ascending: false })
  ])

  if (citiesRes.error) throw citiesRes.error
  if (announcementsRes.error) throw announcementsRes.error

  return {
    kind: "staff-announcements",
    cities: citiesRes.data || [],
    announcements: announcementsRes.data || [],
  }
}

async function prepareStaffNotificationsData() {
  const [profilesRes, notificationsRes] = await Promise.all([
    supabase.from("profiles").select("id, full_name, phone").order("full_name"),
    supabase
      .from("notifications")
      .select(`
        *,
        profiles ( full_name )
      `)
      .order("created_at", { ascending: false })
      .limit(100)
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
  "/staff-announcements": prepareStaffAnnouncementsData,
  "/staff-notifications": prepareStaffNotificationsData,
  "/staff-payments": prepareStaffPaymentsData,
  "/staff-city-banners": prepareStaffFeaturedCityBannersData,
  "/staff-sponsored-products": prepareStaffSponsoredProductsData,
  "/staff-inbox": prepareStaffInboxData,
  "/staff-security-radar": prepareStaffSecurityRadarData,
}

export async function prepareStaffRouteTransition({ path, timeoutMs = STAFF_ROUTE_TIMEOUT }) {
  const [pathname] = String(path || "").split("?")
  const routeLoader = staffRouteLoaders[pathname]
  if (!routeLoader) return null

  return runTimedPreload(
    async () => {
      const routePreparer = staffPreparers[pathname]
      if (!routePreparer) {
        await routeLoader()
        return null
      }

      const [prefetchedData] = await Promise.all([
        routePreparer(),
        routeLoader(),
      ])

      return prefetchedData
    },
    "Timed out while opening that staff page.",
    timeoutMs
  )
}
