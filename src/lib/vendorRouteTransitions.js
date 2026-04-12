import { primeCachedFetchStore } from "../hooks/useCachedFetch"
import { getProfileDisplayName } from "./featuredBannerEngine"
import { loadProductCategoryRows } from "./productCategories"
import { supabase } from "./supabase"

const VENDOR_TRANSITION_TIMEOUT = 12000
const MAX_PRODUCTS_LIMIT = 30

const vendorRouteLoaders = {
  "/shop-registration": () => import("../pages/ShopRegistration"),
  "/vendor-panel": () => import("../pages/VendorsPanel"),
  "/merchant-add-product": () => import("../pages/vendors/AddProduct"),
  "/merchant-edit-product": () => import("../pages/vendors/EditProduct"),
  "/merchant-products": () => import("../pages/vendors/MerchantProducts"),
  "/merchant-banner": () => import("../pages/vendors/MerchantBanner"),
  "/merchant-settings": () => import("../pages/vendors/MerchantSettings"),
  "/merchant-news": () => import("../pages/vendors/MerchantNews"),
  "/merchant-promo-banner": () => import("../pages/vendors/MerchantPromoBanner"),
  "/merchant-analytics": () => import("../pages/vendors/MerchantAnalytics"),
  "/merchant-video-kyc": () => import("../pages/vendors/MerchantVideoKYC"),
  "/remita": () => import("../pages/vendors/MerchantPayment"),
  "/service-fee": () => import("../pages/vendors/MerchantServiceFee"),
}

function runTimedPreload(task, timeoutMessage, timeoutMs = VENDOR_TRANSITION_TIMEOUT) {
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

async function fetchProfileSuspension(userId) {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("is_suspended")
    .eq("id", userId)
    .maybeSingle()

  if (error) throw error
  if (profile?.is_suspended) {
    throw new Error("Account restricted.")
  }
}

async function resolveOwnedShopId(userId, shopId = null) {
  if (shopId) return String(shopId)

  const { data: shop, error } = await supabase
    .from("shops")
    .select("id")
    .eq("owner_id", userId)
    .maybeSingle()

  if (error || !shop?.id) {
    throw new Error("Shop not found.")
  }

  return String(shop.id)
}

async function fetchOwnedShop(userId, shopId, select) {
  const resolvedShopId = await resolveOwnedShopId(userId, shopId)

  const { data: shop, error } = await supabase
    .from("shops")
    .select(select)
    .eq("id", resolvedShopId)
    .eq("owner_id", userId)
    .maybeSingle()

  if (error || !shop) {
    throw new Error("Shop not found or access denied.")
  }

  return shop
}

async function prepareMerchantProductsData({ userId, shopId }) {
  await fetchProfileSuspension(userId)
  const shop = await fetchOwnedShop(userId, shopId, "id, is_open")

  if (shop.is_open === false) {
    throw new Error("Shop is suspended.")
  }

  const { data: products, error } = await supabase
    .from("products")
    .select("*")
    .eq("shop_id", shop.id)
    .order("created_at", { ascending: false })

  if (error) throw error

  const cacheKey = `merchant_products_${String(shop.id)}`
  primeCachedFetchStore(cacheKey, products || [])

  return {
    kind: "merchant-products",
    shopId: String(shop.id),
  }
}

async function prepareVendorPanelData({ userId }) {
  await fetchProfileSuspension(userId)

  const { data: shopData, error: shopError } = await supabase
    .from("shops")
    .select("*, is_subscription_active")
    .eq("owner_id", userId)
    .maybeSingle()

  if (shopError) throw shopError
  if (!shopData) {
    throw new Error("SHOP_NOT_FOUND")
  }

  if (shopData.status === "rejected" && shopData.kyc_status !== "rejected") {
    throw new Error(
      "Your shop application was rejected. Please contact support."
    )
  }

  const { count, error: rejectedCountError } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("shop_id", shopData.id)
    .eq("is_approved", false)
    .not("rejection_reason", "is", null)

  if (rejectedCountError) throw rejectedCountError

  const { data: paymentRecord, error: paymentError } = await supabase
    .from("physical_verification_payments")
    .select("id")
    .eq("merchant_id", userId)
    .eq("status", "success")
    .maybeSingle()

  if (paymentError) throw paymentError

  const payload = {
    shop: shopData,
    rejectedProductCount: count || 0,
    hasPaidFee: Boolean(paymentRecord),
  }

  primeCachedFetchStore(`vendor_panel_${userId}`, payload)
  return payload
}

async function prepareShopRegistrationData({ userId, cityId, shopId = null }) {
  if (!cityId) {
    throw new Error("Profile not fully configured.")
  }

  const tasks = [
    supabase.from("categories").select("name").order("name"),
    supabase.from("areas").select("id, name").eq("city_id", cityId).order("name"),
    supabase.from("cities").select("id, name, is_open").eq("id", cityId).maybeSingle(),
  ]

  const isEdit = Boolean(shopId)
  if (isEdit) {
    tasks.push(
      supabase
        .from("shops")
        .select("*")
        .eq("id", shopId)
        .eq("owner_id", userId)
        .maybeSingle()
    )
  }

  const results = await Promise.all(tasks)

  if (results[0].error) throw results[0].error
  if (results[1].error) throw results[1].error
  if (results[2].error) throw results[2].error

  let existingShop = null
  if (isEdit) {
    if (results[3].error) throw results[3].error
    existingShop = results[3].data
    if (!existingShop) {
      throw new Error("Shop not found or access denied.")
    }
  }

  const payload = {
    categories: results[0].data || [],
    areas: results[1].data || [],
    cityData: results[2].data || null,
    shop: existingShop,
  }

  const cacheKey = isEdit
    ? `shop_reg_edit_${userId}_${shopId}`
    : `shop_reg_new_${userId}_${cityId}`

  primeCachedFetchStore(cacheKey, payload)
  return payload
}

async function prepareAddProductData({ userId, shopId }) {
  await fetchProfileSuspension(userId)
  const shop = await fetchOwnedShop(userId, shopId, "id, is_open")

  if (shop.is_open === false) {
    throw new Error("Shop is suspended.")
  }

  const [productCountResult, discountCountResult, categoryRows] = await Promise.all([
    supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", shop.id),
    supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", shop.id)
      .not("discount_price", "is", null),
    loadProductCategoryRows(supabase),
  ])

  if (productCountResult.error) throw productCountResult.error
  if (discountCountResult.error) throw discountCountResult.error

  return {
    kind: "merchant-add-product",
    shopId: String(shop.id),
    limitReached: (productCountResult.count || 0) >= MAX_PRODUCTS_LIMIT,
    activeOffersCount: discountCountResult.count || 0,
    categoryRows,
  }
}

async function prepareEditProductData({ userId, shopId, search = "" }) {
  const productId = new URLSearchParams(search).get("id")

  if (!productId) {
    throw new Error("Product ID missing.")
  }

  await fetchProfileSuspension(userId)

  const [{ data: product, error: productError }, categoryRows] = await Promise.all([
    supabase
      .from("products")
      .select("*")
      .eq("id", productId)
      .maybeSingle(),
    loadProductCategoryRows(supabase),
  ])

  if (productError) throw productError
  if (!product) {
    throw new Error("Product not found.")
  }

  const shop = await fetchOwnedShop(userId, product.shop_id, "id, is_open")
  if (shopId && String(shop.id) !== String(shopId)) {
    throw new Error("Access denied to this product's shop.")
  }
  if (shop.is_open === false) {
    throw new Error("Shop is suspended.")
  }

  const { count, error: offerCountError } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("shop_id", shop.id)
    .not("discount_price", "is", null)
    .neq("id", productId)

  if (offerCountError) throw offerCountError

  return {
    kind: "merchant-edit-product",
    productId: String(product.id),
    shopId: String(shop.id),
    productData: product,
    activeOffersCount: count || 0,
    categoryRows,
  }
}

async function prepareMerchantBannerData({ userId, shopId }) {
  await fetchProfileSuspension(userId)
  const shop = await fetchOwnedShop(
    userId,
    shopId,
    "id, owner_id, name, category, address, image_url, cities(name)"
  )

  const [bannerResult, productResult, profileResult] = await Promise.all([
    supabase
      .from("shop_banners_news")
      .select("*")
      .eq("shop_id", shop.id)
      .eq("content_type", "banner")
      .order("created_at", { ascending: false }),
    supabase
      .from("products")
      .select("id, shop_id, image_url, is_available")
      .eq("shop_id", shop.id)
      .eq("is_available", true)
      .not("image_url", "is", null)
      .order("id", { ascending: true })
      .limit(5),
    shop.owner_id
      ? supabase.rpc("get_public_profiles", { profile_ids: [shop.owner_id] })
      : Promise.resolve({ data: [], error: null }),
  ])

  if (bannerResult.error) throw bannerResult.error
  if (productResult.error) throw productResult.error
  if (profileResult.error) throw profileResult.error

  return {
    kind: "merchant-banner",
    shopId: String(shop.id),
    shopData: shop,
    products: productResult.data || [],
    proprietorName: getProfileDisplayName(profileResult.data?.[0]),
    existingBanners: bannerResult.data || [],
    previewUrl: bannerResult.data?.[0]?.content_data || "",
    status: bannerResult.data?.[0]?.status || "",
  }
}

async function prepareMerchantSettingsData({ userId, shopId }) {
  await fetchProfileSuspension(userId)
  const shop = await fetchOwnedShop(userId, shopId, "*")

  return {
    kind: "merchant-settings",
    shopId: String(shop.id),
    form: {
      name: shop.name || "",
      desc: shop.description || "",
      address: shop.address || "",
      phone: shop.phone || "",
      whatsapp: shop.whatsapp || "",
      website: shop.website_url || "",
      facebook: shop.facebook_url || "",
      instagram: shop.instagram_url || "",
      twitter: shop.twitter_url || "",
      tiktok: shop.tiktok_url || "",
    },
    isLocked: shop.status === "approved",
  }
}

async function prepareMerchantNewsData({ userId, shopId }) {
  await fetchProfileSuspension(userId)
  const shop = await fetchOwnedShop(userId, shopId, "id")

  const { data: newsData, error } = await supabase
    .from("shop_banners_news")
    .select("content_data, status")
    .eq("shop_id", shop.id)
    .eq("content_type", "news")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error

  return {
    kind: "merchant-news",
    shopId: String(shop.id),
    newsText: newsData?.content_data || "",
    status: newsData?.status || "",
  }
}

async function prepareMerchantAnalyticsData({ userId, shopId }) {
  await fetchProfileSuspension(userId)
  const shop = await fetchOwnedShop(userId, shopId, "id")

  const safeCountFetch = async (table) => {
    try {
      const { count, error } = await supabase
        .from(table)
        .select("*", { count: "exact", head: true })
        .eq("shop_id", shop.id)

      if (error) throw error
      return count || 0
    } catch (error) {
      console.warn(`Failed to fetch ${table} count during preload:`, error)
      return 0
    }
  }

  const [views, clicks, likes] = await Promise.all([
    safeCountFetch("shop_views"),
    safeCountFetch("whatsapp_clicks"),
    safeCountFetch("shop_likes"),
  ])

  return {
    kind: "merchant-analytics",
    shopId: String(shop.id),
    stats: {
      views,
      clicks,
      likes,
      conversion: views > 0 ? `${((clicks / views) * 100).toFixed(1)}%` : "0.0%",
    },
  }
}

async function prepareMerchantPromoBannerData({ userId, shopId }) {
  await fetchProfileSuspension(userId)
  const shop = await fetchOwnedShop(
    userId,
    shopId,
    "id, name, unique_id, category, is_verified, address, image_url, cities(name)"
  )

  if (!shop.is_verified) {
    throw new Error(
      "Access denied. Your shop must be physically verified before you can generate a promo banner."
    )
  }

  const { data: products, error } = await supabase
    .from("products")
    .select("id, name, price, discount_price, condition, image_url")
    .eq("shop_id", shop.id)
    .eq("is_approved", true)
    .limit(4)

  if (error) throw error

  const fallbackProduct = {
    id: "fallback",
    name: "Featured Product",
    price: null,
    image_url:
      "https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?q=80&w=800&auto=format&fit=crop",
  }

  const availableProducts = (products || []).filter((product) => product.image_url)
  const finalProducts = availableProducts.length
    ? Array.from({ length: 4 }, (_, index) => availableProducts[index % availableProducts.length])
    : Array(4).fill(fallbackProduct)

  return {
    kind: "merchant-promo-banner",
    shopData: shop,
    products: finalProducts,
  }
}

async function prepareMerchantVideoKYCData({ userId }) {
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("full_name, avatar_url, is_suspended, city_id")
    .eq("id", userId)
    .maybeSingle()

  if (profileError) throw profileError
  if (profile?.is_suspended) {
    throw new Error("Account restricted.")
  }

  const shop = await fetchOwnedShop(
    userId,
    null,
    "id, name, unique_id, address, city_id, is_verified, kyc_status, kyc_video_url, rejection_reason, cities(name)"
  )

  let cityName = ""
  const resolvedCityId = shop?.city_id || profile?.city_id
  if (resolvedCityId) {
    const { data: city, error: cityError } = await supabase
      .from("cities")
      .select("name")
      .eq("id", resolvedCityId)
      .maybeSingle()

    if (cityError) throw cityError
    cityName = city?.name || ""
  }

  return {
    kind: "merchant-video-kyc",
    shopData: shop,
    profileName: profile?.full_name || "Merchant",
    profileAvatar: profile?.avatar_url || "",
    cityName,
  }
}

async function prepareMerchantPaymentData({ userId, shopId }) {
  const shop = await fetchOwnedShop(userId, shopId, "*")

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("full_name, cities(name)")
    .eq("id", userId)
    .single()

  if (profileError || !profile) {
    throw new Error("Profile not found")
  }

  return {
    kind: "merchant-payment",
    shopDetails: {
      merchantName: profile.full_name || "Merchant",
      shopName: shop.name,
      cityName: profile.cities?.name || "Unknown City",
      shopAddress: shop.address || "Address not provided",
    },
  }
}

async function prepareMerchantServiceFeeData({ userId, shopId }) {
  const shop = await fetchOwnedShop(
    userId,
    shopId,
    "id, name, subscription_end_date, subscription_plan, is_verified, kyc_status"
  )

  return {
    kind: "merchant-service-fee",
    shopData: shop,
  }
}

const vendorRoutePreparers = {
  "/merchant-add-product": prepareAddProductData,
  "/merchant-edit-product": prepareEditProductData,
  "/merchant-products": prepareMerchantProductsData,
  "/merchant-banner": prepareMerchantBannerData,
  "/merchant-settings": prepareMerchantSettingsData,
  "/merchant-news": prepareMerchantNewsData,
  "/merchant-promo-banner": prepareMerchantPromoBannerData,
  "/merchant-analytics": prepareMerchantAnalyticsData,
  "/merchant-video-kyc": prepareMerchantVideoKYCData,
  "/remita": prepareMerchantPaymentData,
  "/service-fee": prepareMerchantServiceFeeData,
}

export async function prepareVendorRouteTransition({
  path,
  userId,
  shopId = null,
  timeoutMs = VENDOR_TRANSITION_TIMEOUT,
}) {
  const [pathname, search = ""] = String(path || "").split("?")
  const routeLoader = vendorRouteLoaders[pathname]
  const routePreparer = vendorRoutePreparers[pathname]

  if (!routeLoader) {
    return null
  }

  return runTimedPreload(
    async () => {
      if (!routePreparer) {
        await routeLoader()
        return null
      }

      const [prefetchedData] = await Promise.all([
        routePreparer({ userId, shopId, path, search }),
        routeLoader(),
      ])

      return prefetchedData
    },
    "Timed out while opening that merchant page.",
    timeoutMs
  )
}

export async function prepareVendorDashboardEntryTransition({
  path,
  userId,
  cityId = null,
  shopId = null,
  timeoutMs = VENDOR_TRANSITION_TIMEOUT,
}) {
  const [pathname, search = ""] = String(path || "").split("?")
  const routeLoader = vendorRouteLoaders[pathname]

  if (!routeLoader) {
    return null
  }

  return runTimedPreload(
    async () => {
      if (pathname === "/vendor-panel") {
        await Promise.all([
          prepareVendorPanelData({ userId }),
          routeLoader(),
        ])
        return null
      }

      if (pathname === "/shop-registration") {
        const searchParams = new URLSearchParams(search)
        const editShopId = shopId || searchParams.get("id")

        await Promise.all([
          prepareShopRegistrationData({
            userId,
            cityId,
            shopId: editShopId,
          }),
          routeLoader(),
        ])
        return null
      }

      await routeLoader()
      return null
    },
    "Timed out while opening that page.",
    timeoutMs
  )
}
