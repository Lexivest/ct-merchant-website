import { primeCachedFetchStore, readCachedFetchStore } from "../hooks/useCachedFetch"
import { buildShopDetailCacheKey, fetchShopDetailData } from "./shopDetailData"
import { buildProductDetailCacheKey, fetchProductDetailData } from "./productDetailData"

const DETAIL_CACHE_TTL = 1000 * 60 * 5

const loadShopDetailPage = () => import("../pages/ShopDetail")
const loadProductDetailPage = () => import("../pages/ProductDetail")

function hasFreshCache(entry, ttl = DETAIL_CACHE_TTL) {
  return Boolean(entry && Date.now() - entry.timestamp <= ttl)
}

async function runTimedPreload(task, timeoutMessage, timeoutMs = 10000) {
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

export async function prepareShopDetailTransition({
  shopId,
  userId = null,
  timeoutMs = 10000,
}) {
  const cacheKey = buildShopDetailCacheKey(shopId, userId)
  const cachedEntry = readCachedFetchStore(cacheKey)

  if (hasFreshCache(cachedEntry)) {
    await loadShopDetailPage()
    return cachedEntry.data
  }

  const data = await runTimedPreload(
    async () => {
      const [prefetchedData] = await Promise.all([
        fetchShopDetailData({ shopId, userId }),
        loadShopDetailPage(),
      ])
      return prefetchedData
    },
    "Timed out while opening the shop.",
    timeoutMs
  )

  primeCachedFetchStore(cacheKey, data)
  return data
}

export async function prepareProductDetailTransition({
  productId,
  userId = null,
  timeoutMs = 10000,
}) {
  const cacheKey = buildProductDetailCacheKey(productId, userId)
  const cachedEntry = readCachedFetchStore(cacheKey)

  if (hasFreshCache(cachedEntry)) {
    await loadProductDetailPage()
    return cachedEntry.data
  }

  const data = await runTimedPreload(
    async () => {
      const prefetchedData = await fetchProductDetailData({ productId, userId })
      await loadProductDetailPage()
      return prefetchedData
    },
    "Timed out while opening the product.",
    timeoutMs
  )

  primeCachedFetchStore(cacheKey, data)
  return data
}
