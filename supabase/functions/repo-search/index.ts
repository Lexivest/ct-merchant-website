// Pass 12 fixed source: repo-search
// Changes vs v27:
// - Replaced select("*") on shops with SHOP_PUBLIC_COLUMNS — service_role bypasses RLS,
//   so wildcard select would expose KYC/financial columns to any caller with a unique_id.
// - Replaced select("*") on products with PRODUCT_PUBLIC_COLUMNS for same reason.
// - Added areas ( name ) to shop select for area-name display in the UI.
// Deploy with: verify_jwt: true (unchanged)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const DEFAULT_WINDOW_SECONDS = 60
const DEFAULT_MAX_REQUESTS = 15
const DEFAULT_COOLDOWN_SECONDS = 180
const DEFAULT_MAX_COOLDOWN_SECONDS = 3600
const REPO_ID_INVALID_MESSAGE = "Please enter a valid repository ID like CT-205368 or just 205368."

function jsonResponse(payload: Record<string, unknown>, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      ...extraHeaders,
      "Content-Type": "application/json",
    },
  })
}

function readPositiveInt(name: string, fallback: number) {
  const value = Number(Deno.env.get(name))
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback
}

function getClientAddress(req: Request) {
  const forwardedFor = req.headers.get("x-forwarded-for") || ""
  const firstForwardedAddress = forwardedFor.split(",")[0]?.trim()
  return (
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    firstForwardedAddress ||
    "unknown-ip"
  )
}

async function sha256Hex(value: string) {
  const encoded = new TextEncoder().encode(value)
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded)
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

function normalizeSearchTerm(value: unknown) {
  const raw = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .slice(0, 80)

  if (!raw) return ""

  const prefixedMatch = raw.match(/^CT-?(\d{2,32})$/)
  if (prefixedMatch) return `CT-${prefixedMatch[1]}`

  const digitsOnlyMatch = raw.match(/^(\d{2,32})$/)
  if (digitsOnlyMatch) return `CT-${digitsOnlyMatch[1]}`

  return ""
}

// SECURITY: With service_role (RLS bypassed), NEVER use select("*").
// Always list columns explicitly so private KYC/financial fields cannot leak.
// Excluded from SHOP_PUBLIC_COLUMNS: owner_id, cac_number, cac_certificate_url,
// id_type, id_number, id_card_url, kyc_video_url, kyc_status, kyc_submission_meta,
// rejection_reason, creation_ip, creation_device, subscription_end_date, subscription_plan.
const SHOP_PUBLIC_COLUMNS = `
  id, unique_id, name, description, category, address, phone, whatsapp,
  image_url, is_verified, is_featured, is_open, is_service, business_type,
  city_id, area_id, latitude, longitude, facebook_url, instagram_url,
  twitter_url, tiktok_url, website_url, telegram_url, storefront_url,
  created_at, cities ( name ), areas ( name ), profiles ( full_name )
`

// Excluded from PRODUCT_PUBLIC_COLUMNS: rejection_reason and any internal fields.
const PRODUCT_PUBLIC_COLUMNS = `
  id, shop_id, name, description, price, discount_price, condition,
  image_url, image_url_2, image_url_3, stock_count, category, attributes,
  is_available, is_approved, created_at,
  shops!inner ( id, status, is_open, subscription_end_date )
`

function getCooldownMessage(retryAfterSeconds: number) {
  const seconds = Math.max(1, Math.ceil(retryAfterSeconds || DEFAULT_COOLDOWN_SECONDS))
  const minutes = Math.ceil(seconds / 60)
  if (seconds < 60) return `Too many searches. Please wait ${seconds} seconds and try again.`
  return `Too many searches. Please wait about ${minutes} minute${minutes === 1 ? "" : "s"} and try again.`
}

async function fetchFirstShop(supabase: ReturnType<typeof createClient>, normalizedTerm: string) {
  const nowIso = new Date().toISOString()
  return supabase
    .from("shops")
    .select(SHOP_PUBLIC_COLUMNS)
    .eq("unique_id", normalizedTerm)
    .eq("status", "approved")
    .eq("is_open", true)
    .eq("is_suspended", false)
    .gt("subscription_end_date", nowIso)
    .limit(1)
    .maybeSingle()
}

async function fetchShopDetailPayload(supabase: ReturnType<typeof createClient>, shop: Record<string, unknown>) {
  const shopId = shop?.id
  if (!shopId) {
    return { products: [], approvedNews: [], shopBanner: "", likeCount: 0 }
  }

  const [productsResult, bannerNewsResult, likesResult] = await Promise.all([
    supabase
      .from("products")
      .select(PRODUCT_PUBLIC_COLUMNS)
      .eq("shop_id", shopId)
      .eq("is_available", true)
      .eq("is_approved", true)
      .eq("shops.status", "approved")
      .eq("shops.is_open", true)
      .gt("shops.subscription_end_date", new Date().toISOString())
      .order("id", { ascending: true })
      .limit(100),
    supabase
      .from("shop_banners_news")
      .select("content_type, content_data")
      .eq("shop_id", shopId)
      .eq("status", "approved")
      .order("created_at", { ascending: false }),
    supabase
      .from("shop_likes")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", shopId),
  ])

  if (productsResult.error) console.warn("[DETAIL PRODUCTS WARNING]", productsResult.error.message)
  if (bannerNewsResult.error) console.warn("[DETAIL BANNER WARNING]", bannerNewsResult.error.message)
  if (likesResult.error) console.warn("[DETAIL LIKES WARNING]", likesResult.error.message)

  const rows = bannerNewsResult.data || []
  const banners = rows.filter((item) => item.content_type === "banner")

  return {
    products: (productsResult.data || []).map(({ shops: _ignored, ...product }) => product),
    approvedNews: rows
      .filter((item) => item.content_type === "news")
      .map((item) => item.content_data)
      .filter(Boolean),
    shopBanner: banners[0]?.content_data || "",
    likeCount: likesResult.count || 0,
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    const requestBody = await req.json().catch(() => ({}))
    const rawTerm = normalizeSearchTerm(requestBody?.merchantId)
    // Rate-limit bypass (`skipRateLimit`) removed — it allowed any caller to
    // opt out of throttling by passing one extra field.

    if (!rawTerm) return jsonResponse({ error: REPO_ID_INVALID_MESSAGE }, 400)

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false, autoRefreshToken: false } },
    )

    const clientAddress = getClientAddress(req)
    const userAgent = (req.headers.get("user-agent") || "unknown-agent").slice(0, 180)

    // Bot detection (user-agent heuristic). Easily bypassable but blocks lazy scrapers.
    // Real protection is the rate-limit RPC below.
    const lowerUA = userAgent.toLowerCase()
    const isBot =
      userAgent === "unknown-agent" ||
      userAgent.length < 20 ||
      lowerUA.includes("bot") ||
      lowerUA.includes("crawler") ||
      lowerUA.includes("spider") ||
      lowerUA.includes("scraper") ||
      lowerUA.includes("headless") ||
      lowerUA.includes("python") ||
      lowerUA.includes("curl") ||
      lowerUA.includes("wget")

    if (isBot) {
      console.warn("[BOT DETECTED]", { userAgent, clientAddress })
      return jsonResponse({ error: "Access denied. Please use a standard web browser." }, 403)
    }

    // Rate limit is now always enforced — no bypass.
    const keyHash = await sha256Hex(`${clientAddress}|${userAgent}`)
    const termHash = await sha256Hex(rawTerm.toLowerCase())

    const windowSeconds = readPositiveInt("REPO_SEARCH_WINDOW_SECONDS", DEFAULT_WINDOW_SECONDS)
    const maxRequests = readPositiveInt("REPO_SEARCH_MAX_REQUESTS", DEFAULT_MAX_REQUESTS)
    const cooldownSeconds = readPositiveInt("REPO_SEARCH_COOLDOWN_SECONDS", DEFAULT_COOLDOWN_SECONDS)
    const maxCooldownSeconds = readPositiveInt("REPO_SEARCH_MAX_COOLDOWN_SECONDS", DEFAULT_MAX_COOLDOWN_SECONDS)

    const { data: limitData, error: limitError } = await supabase
      .rpc("check_repo_search_rate_limit", {
        p_key_hash: keyHash,
        p_term_hash: termHash,
        p_window_seconds: windowSeconds,
        p_max_requests: maxRequests,
        p_cooldown_seconds: cooldownSeconds,
        p_max_cooldown_seconds: maxCooldownSeconds,
      })
      .single()

    if (limitError) {
      console.error("[RATE LIMIT ERROR]", limitError)
      return jsonResponse({ error: "Search is temporarily unavailable. Please try again soon." }, 503)
    }

    if (!limitData?.allowed) {
      const retryAfterSeconds = Number(limitData?.retry_after_seconds || cooldownSeconds)
      console.warn("[RATE LIMITED]", {
        retryAfterSeconds,
        requestCount: limitData?.request_count,
        violationCount: limitData?.violation_count,
      })
      return jsonResponse(
        {
          rate_limited: true,
          retry_after_seconds: retryAfterSeconds,
          message: getCooldownMessage(retryAfterSeconds),
        },
        429,
        { "Retry-After": String(Math.max(1, Math.ceil(retryAfterSeconds))) },
      )
    }

    console.log(`[SEARCH] Incoming term: "${rawTerm}"`)

    const { data, error } = await fetchFirstShop(supabase, rawTerm)
    if (error) {
      console.error("[DB ERROR]", error)
      return jsonResponse({ error: "Search is temporarily unavailable. Please try again." }, 500)
    }

    if (!data) {
      console.log(`[NOT FOUND] No match for: ${rawTerm}`)
      return jsonResponse({ not_found: true })
    }

    console.log(`[SUCCESS] Found: ${data.name} (${data.unique_id})`)

    const profileName = data.profiles
      ? Array.isArray(data.profiles)
        ? data.profiles[0]?.full_name
        : data.profiles.full_name
      : null
    const detailPayload = await fetchShopDetailPayload(supabase, data)

    return jsonResponse({
      shop: data,
      profile: { full_name: profileName || "Verified Merchant" },
      ownerProfile: { full_name: profileName || "Verified Merchant", avatar_url: null },
      products: detailPayload.products,
      approvedNews: detailPayload.approvedNews,
      shopBanner: detailPayload.shopBanner,
      likeCount: detailPayload.likeCount,
      detail_ready: true,
    })
  } catch (error) {
    console.error("[FATAL]", error)
    return jsonResponse({ error: "Search could not be completed. Please try again." }, 400)
  }
})
