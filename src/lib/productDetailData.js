import { supabase } from "./supabase"
import { isNetworkError } from "./friendlyErrors"

export function buildProductDetailCacheKey(productId, userId) {
  return `prod_detail_${productId}_${userId || "anon"}`
}

export async function fetchProductDetailData({ productId, userId = null }) {
  if (!productId) {
    throw new Error("Product id is required")
  }

  const { data: product, error: productError } = await supabase
    .from("products")
    .select("*")
    .eq("id", productId)
    .single()

  if (productError) {
    if (isNetworkError(productError)) {
      throw new Error("We could not open this product right now. Please try again.")
    }
    throw productError
  }

  if (!product) {
    throw new Error("This product is unavailable right now. Please try again later.")
  }

  let shop = null
  let recommendations = []
  let initialWishlist = false
  const tasks = []

  if (product.shop_id) {
    tasks.push(
      supabase
        .from("shops")
        .select("id, name, whatsapp, phone, address, city_id, areas(name), cities(name)")
        .eq("id", product.shop_id)
        .maybeSingle()
        .then((res) => {
          if (res.data) shop = res.data
        })
        .catch(() => {})
    )
  }

  if (product.category) {
    tasks.push(
      supabase
        .from("products")
        .select("id, name, price, discount_price, image_url")
        .eq("category", product.category)
        .neq("id", product.id)
        .eq("is_available", true)
        .limit(10)
        .then((res) => {
          if (res.data) recommendations = res.data
        })
        .catch(() => {})
    )
  }

  if (userId) {
    tasks.push(
      supabase
        .from("wishlist")
        .select("id")
        .eq("user_id", userId)
        .eq("product_id", productId)
        .maybeSingle()
        .then((res) => {
          initialWishlist = Boolean(res.data)
        })
        .catch(() => {})
    )
  }

  await Promise.allSettled(tasks)

  return {
    product,
    shop,
    recommendations,
    initialWishlist,
  }
}
