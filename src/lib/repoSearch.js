import { supabase } from "./supabase"

export const REPO_SEARCH_PREFIX = "CT-"
export const REPO_SEARCH_DIGIT_LIMIT = 7
export const REPO_SEARCH_INVALID_MESSAGE =
  `Enter a valid repository ID like CT-2053684 or just 2053684. Maximum ${REPO_SEARCH_DIGIT_LIMIT} digits.`

export function extractRepoSearchDigits(value) {
  const raw = String(value || "").trim().toUpperCase()
  if (!raw) return ""

  return raw
    .replace(/^CT-?/, "")
    .replace(/\D/g, "")
    .slice(0, REPO_SEARCH_DIGIT_LIMIT)
}

export function normalizeRepoSearchId(value) {
  const raw = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")

  if (!raw) return ""

  const directIdMatch = raw.match(new RegExp(`^CT-?(\\d{2,${REPO_SEARCH_DIGIT_LIMIT}})$`))
  if (directIdMatch) {
    return `${REPO_SEARCH_PREFIX}${directIdMatch[1]}`
  }

  const plainDigitsMatch = raw.match(new RegExp(`^(\\d{2,${REPO_SEARCH_DIGIT_LIMIT}})$`))
  if (plainDigitsMatch) {
    return `${REPO_SEARCH_PREFIX}${plainDigitsMatch[1]}`
  }

  return ""
}

async function readFunctionErrorPayload(error) {
  const response = error?.context
  if (!response || typeof response.clone !== "function") return null

  try {
    return await response.clone().json()
  } catch {
    return null
  }
}

export function getRepoSearchCooldownMessage(payload) {
  if (payload?.message) return payload.message

  const seconds = Math.max(1, Number(payload?.retry_after_seconds || 180))
  if (seconds < 60) {
    return `Too many searches. Please wait ${seconds} seconds and try again.`
  }

  const minutes = Math.ceil(seconds / 60)
  return `Too many searches. Please wait about ${minutes} minute${minutes === 1 ? "" : "s"} and try again.`
}

export async function invokeRepoSearch(merchantId, skipRateLimit = false) {
  const normalizedMerchantId = normalizeRepoSearchId(merchantId)
  const result = await supabase.functions.invoke("repo-search", {
    body: { merchantId: normalizedMerchantId || merchantId, skipRateLimit },
  })

  if (!result.error) return result

  const payload = await readFunctionErrorPayload(result.error)
  const status = result.error?.context?.status

  if (status === 429 || payload?.rate_limited) {
    return {
      data: {
        rate_limited: true,
        retry_after_seconds: payload?.retry_after_seconds || 180,
        message: getRepoSearchCooldownMessage(payload),
      },
      error: null,
    }
  }

  if (payload?.error) {
    return {
      data: payload,
      error: result.error,
    }
  }

  return result
}

export function buildRepoSearchQuerySuffix(repoRef) {
  if (!repoRef) return ""
  return `&repo_public=1&repo_ref=${encodeURIComponent(repoRef)}`
}

export function buildShopDetailPrefetchFromRepoSearch(result) {
  const shop = result?.shop
  if (!shop?.id) return null
  const detailReady = result?.detail_ready === true
  if (!detailReady) return null

  const cityName =
    shop?.cities?.name ||
    shop?.city_name ||
    "Local"

  const areaName =
    shop?.areas?.name ||
    shop?.area_name ||
    ""

  return {
    shop: {
      ...shop,
      cities: {
        ...(typeof shop.cities === "object" && shop.cities ? shop.cities : {}),
        name: cityName,
      },
      areas: {
        ...(typeof shop.areas === "object" && shop.areas ? shop.areas : {}),
        name: areaName,
      },
    },
    products: Array.isArray(result?.products) ? result.products : [],
    likeCount: Number(result?.likeCount || result?.like_count || 0),
    approvedNews: Array.isArray(result?.approvedNews)
      ? result.approvedNews
      : Array.isArray(result?.approved_news)
        ? result.approved_news
        : [],
    shopBanner: result?.shopBanner || result?.shop_banner || "",
    hasLiked: false,
    ownerProfile: result?.ownerProfile || result?.profile || null,
    __repoSearchDetailReady: detailReady,
    __publicRepoMode: true,
    __repoRef: shop?.unique_id || null,
    __repoSource: "repo-search",
  }
}

export function buildProductDetailPrefetchFromRepoPayload(payload, productId) {
  const shop = payload?.shop || null
  const products = Array.isArray(payload?.products) ? payload.products : []
  const targetProduct = products.find((item) => String(item?.id) === String(productId)) || null

  if (!shop?.id || !targetProduct) return null

  const recommendations = products
    .filter((item) => String(item?.id) !== String(targetProduct.id))
    .filter((item) => {
      if (!targetProduct?.category) return true
      return String(item?.category || "").toLowerCase() === String(targetProduct.category || "").toLowerCase()
    })
    .slice(0, 10)
    .map((item) => ({
      id: item.id,
      name: item.name,
      price: item.price,
      discount_price: item.discount_price,
      image_url: item.image_url,
    }))

  return {
    product: targetProduct,
    shop,
    recommendations,
    initialWishlist: false,
    __publicRepoMode: true,
    __repoRef: payload?.__repoRef || shop?.unique_id || null,
    __repoSource: "repo-search",
  }
}

export async function fetchPublicRepoShopDetail({ repoRef, shopId = null }) {
  if (!repoRef) {
    throw new Error("Public repository reference is missing.")
  }

  // If shopId is present, this is internal navigation (not a fresh search from the gateway)
  const skipRateLimit = !!shopId;
  const { data, error } = await invokeRepoSearch(repoRef, skipRateLimit)

  if (error) {
    throw new Error("We could not open this shop right now. Please try again.")
  }

  if (data?.rate_limited) {
    throw new Error(getRepoSearchCooldownMessage(data))
  }

  const detail = buildShopDetailPrefetchFromRepoSearch(data)
  if (!detail?.shop?.id) {
    throw new Error("This shop is unavailable right now. Please try again later.")
  }

  if (shopId && String(detail.shop.id) !== String(shopId)) {
    throw new Error("This shop is unavailable right now. Please try again later.")
  }

  return {
    ...detail,
    __repoRef: detail.__repoRef || repoRef,
  }
}

export async function fetchPublicRepoProductDetail({
  repoRef,
  productId,
  shopId = null,
}) {
  const shopDetail = await fetchPublicRepoShopDetail({ repoRef, shopId })
  const productDetail = buildProductDetailPrefetchFromRepoPayload(shopDetail, productId)

  if (!productDetail?.product?.id) {
    throw new Error("This product is unavailable right now. Please try again later.")
  }

  return {
    ...productDetail,
    __repoRef: productDetail.__repoRef || repoRef,
  }
}
