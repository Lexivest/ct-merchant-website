import { supabase } from "./supabase"
import { isNetworkError } from "./friendlyErrors"

export function buildProductDetailCacheKey(productId, userId) {
  return `prod_detail_${productId}_${userId || "anon"}`
}

function normalizeRecordId(value) {
  const trimmedValue = String(value || "").trim()
  if (/^\d+$/.test(trimmedValue)) {
    const numericValue = Number(trimmedValue)
    if (Number.isSafeInteger(numericValue)) {
      return numericValue
    }
  }
  return trimmedValue
}

async function fetchProductDetailDataDirect({ productId, userId = null }) {
  const normalizedProductId = normalizeRecordId(productId)

  const { data: product, error: productError } = await supabase
    .from("products")
    .select(`
      *,
      shops (
        id,
        name,
        whatsapp,
        phone,
        address,
        city_id,
        area_id,
        areas (
          name
        ),
        cities (
          name
        )
      )
    `)
    .eq("id", normalizedProductId)
    .maybeSingle()

  if (productError) {
    throw productError
  }

  if (!product) {
    throw new Error("This product is unavailable right now. Please try again later.")
  }

  const shop = Array.isArray(product.shops) ? product.shops[0] || null : product.shops || null
  const nowIso = new Date().toISOString()

  const [recommendationsResult, wishlistResult] = await Promise.allSettled([
    product.category
      ? supabase
          .from("products")
          .select(`
            id,
            shop_id,
            name,
            price,
            discount_price,
            image_url,
            shops!inner (
              id,
              status,
              is_verified,
              is_open,
              subscription_end_date
            )
          `)
          .eq("category", product.category)
          .neq("id", normalizedProductId)
          .eq("is_available", true)
          .eq("is_approved", true)
          .eq("shops.status", "approved")
          .eq("shops.is_verified", true)
          .eq("shops.is_open", true)
          .gt("shops.subscription_end_date", nowIso)
          .order("created_at", { ascending: false })
          .limit(10)
      : Promise.resolve({ data: [], error: null }),
    userId
      ? supabase
          .from("wishlist")
          .select("id")
          .eq("user_id", userId)
          .eq("product_id", normalizedProductId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])

  const recommendations =
    recommendationsResult.status === "fulfilled" && !recommendationsResult.value.error
      ? (recommendationsResult.value.data || []).map((item) => {
          const cleanItem = { ...item }
          delete cleanItem.shops
          return cleanItem
        })
      : []

  const initialWishlist =
    wishlistResult.status === "fulfilled" && !wishlistResult.value.error
      ? Boolean(wishlistResult.value.data)
      : false

  return {
    product,
    shop,
    recommendations,
    initialWishlist,
  }
}

export async function fetchProductDetailData({ productId, userId = null }) {
  if (!productId) {
    throw new Error("Product id is required")
  }

  const cleanId = normalizeRecordId(productId)

  const { data, error } = await supabase.rpc("get_product_detail_payload", {
    p_product_id: cleanId,
    p_user_id: userId,
  })

  if (error) {
    console.error("Product detail RPC error:", error)
    if (isNetworkError(error)) {
      throw new Error("We could not open this product right now. Please try again.")
    }

    try {
      return await fetchProductDetailDataDirect({
        productId: cleanId,
        userId,
      })
    } catch (fallbackError) {
      console.error("Product detail direct fallback error:", fallbackError)
      throw fallbackError
    }
  }

  if (!data || !data.product) {
    throw new Error("This product is unavailable right now. Please try again later.")
  }

  return {
    product: data.product,
    shop: data.product.shops,
    recommendations: data.recommendations || [],
    initialWishlist: data.initial_wishlist || false,
  }
}
