import { getDeviceFingerprint } from "./deviceFingerprint"
import { supabase } from "./supabase"

function getNavigatorUserAgent() {
  if (typeof navigator === "undefined") return ""
  return navigator.userAgent || ""
}

export async function logShopAnalyticsEvent({
  shopId,
  eventType,
  productId = null,
  eventSource = "shop_detail",
  contactStatus = null,
  repoRef = null,
  metadata = {},
}) {
  if (!shopId || !eventType) return { logged: false }

  try {
    const deviceFingerprint = await getDeviceFingerprint().catch(() => "")
    const { data, error } = await supabase.rpc("log_shop_analytics_event", {
      p_shop_id: Number(shopId),
      p_event_type: eventType,
      p_product_id: productId ? Number(productId) : null,
      p_event_source: eventSource,
      p_contact_status: contactStatus,
      p_repo_ref: repoRef || null,
      p_device_fingerprint: deviceFingerprint || null,
      p_user_agent: getNavigatorUserAgent(),
      p_metadata: metadata || {},
    })

    if (error) {
      console.warn("Shop analytics event logging failed:", error)
      return { logged: false, error }
    }

    return data || { logged: true }
  } catch (error) {
    console.warn("Shop analytics event logging failed:", error)
    return { logged: false, error }
  }
}

export async function fetchMerchantShopAnalytics({ shopId, days = 30 }) {
  const { data, error } = await supabase.rpc("ctm_get_shop_analytics_summary", {
    p_shop_id: Number(shopId),
    p_days: Number(days) || 30,
  })

  if (error) throw error
  return data || null
}

export async function fetchStaffShopAnalytics({ days = 30, cityId = null, limit = 50 }) {
  const { data, error } = await supabase.rpc("ctm_get_staff_shop_analytics", {
    p_days: Number(days) || 30,
    p_city_id: cityId ? Number(cityId) : null,
    p_limit: Number(limit) || 50,
  })

  if (error) throw error
  return data || []
}

export async function fetchContactSecurityRadar({ days = 30, cityId = null }) {
  const { data, error } = await supabase.rpc("ctm_get_contact_security_radar", {
    p_days: Number(days) || 30,
    p_city_id: cityId ? Number(cityId) : null,
  })

  if (error) throw error
  return data || []
}

export async function purgeOldShopAnalyticsData({ keepDays = 365 } = {}) {
  const { data, error } = await supabase.rpc("ctm_purge_old_shop_analytics_data", {
    p_keep_days: Number(keepDays) || 365,
  })

  if (error) throw error
  return data || null
}
