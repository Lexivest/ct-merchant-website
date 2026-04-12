import { supabase } from "./supabase"

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

export async function invokeRepoSearch(merchantId) {
  const result = await supabase.functions.invoke("repo-search", {
    body: { merchantId },
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

export function buildShopDetailPrefetchFromRepoSearch(result) {
  const shop = result?.shop
  if (!shop?.id) return null
  const detailReady = result?.detail_ready === true

  const cityName =
    shop?.cities?.name ||
    shop?.city_name ||
    "Local"

  return {
    shop: {
      ...shop,
      cities: {
        ...(typeof shop.cities === "object" && shop.cities ? shop.cities : {}),
        name: cityName,
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
  }
}
