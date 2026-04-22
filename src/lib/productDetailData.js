import { supabase } from "./supabase"
import { isNetworkError } from "./friendlyErrors"

export function buildProductDetailCacheKey(productId, userId) {
  return `prod_detail_${productId}_${userId || "anon"}`
}

export async function fetchProductDetailData({ productId, userId = null }) {
  if (!productId) {
    throw new Error("Product id is required")
  }

  // Sanitize ID
  const cleanId = String(productId).trim()

  const { data, error } = await supabase.rpc("get_product_detail_payload", {
    p_product_id: cleanId,
    p_user_id: userId,
  })

  if (error) {
    console.error("Product detail RPC error:", error)
    if (isNetworkError(error)) {
      throw new Error("We could not open this product right now. Please try again.")
    }
    throw error
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
