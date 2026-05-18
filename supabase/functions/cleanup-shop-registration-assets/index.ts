import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const ALLOWED_BUCKETS = new Set([
  "storefronts",
  "brand-assets",
  "id-documents",
  "cac-documents",
])

class HttpError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

type CleanupAsset = {
  bucket?: string
  path?: string
}

type CleanupRequest = {
  shopId?: number | string
  assets?: CleanupAsset[]
}

type ShopRecord = {
  id: number
  owner_id: string
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

function getEnvStrict(name: string) {
  const value = Deno.env.get(name)
  if (value && value.trim()) return value.trim()
  throw new HttpError(500, `Missing required server configuration: ${name}`)
}

function toPositiveInt(value: unknown) {
  const raw = Number(value)
  if (!Number.isFinite(raw) || raw <= 0) return null
  return Math.trunc(raw)
}

function normalizeAssets(input: unknown) {
  if (!Array.isArray(input)) return []

  return input
    .map((item) => ({
      bucket: String((item as CleanupAsset)?.bucket || "").trim(),
      path: String((item as CleanupAsset)?.path || "").trim().replace(/^\/+/, ""),
    }))
    .filter((item) => item.bucket && item.path)
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405)

  try {
    const payload = (await req.json()) as CleanupRequest
    const shopId = toPositiveInt(payload?.shopId)
    const assets = normalizeAssets(payload?.assets)

    if (!shopId) throw new HttpError(400, "shopId is required.")
    if (!assets.length) return jsonResponse({ success: true, removed: [] })
    if (assets.length > 12) throw new HttpError(400, "Too many asset cleanup requests.")

    for (const asset of assets) {
      if (!ALLOWED_BUCKETS.has(asset.bucket)) {
        throw new HttpError(400, `Unsupported cleanup bucket: ${asset.bucket}`)
      }
    }

    const authHeader = req.headers.get("Authorization")
    if (!authHeader) throw new HttpError(401, "Missing Authorization header.")

    const supabaseUrl = getEnvStrict("SUPABASE_URL")
    const serviceRoleKey = getEnvStrict("SUPABASE_SERVICE_ROLE_KEY")
    const anonKey = getEnvStrict("SUPABASE_ANON_KEY")

    const adminClient = createClient(supabaseUrl, serviceRoleKey)
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser()
    if (authError || !user) throw new HttpError(401, "Unauthorized.")

    const { data: shop, error: shopError } = await adminClient
      .from("shops")
      .select("id, owner_id")
      .eq("id", shopId)
      .eq("owner_id", user.id)
      .maybeSingle<ShopRecord>()

    if (shopError) throw new HttpError(500, `Failed to validate shop ownership: ${shopError.message}`)
    if (!shop) throw new HttpError(403, "Shop not found or access denied.")

    const assetsByBucket = new Map<string, string[]>()
    for (const asset of assets) {
      if (!assetsByBucket.has(asset.bucket)) {
        assetsByBucket.set(asset.bucket, [])
      }
      assetsByBucket.get(asset.bucket)?.push(asset.path)
    }

    const removed: Array<{ bucket: string; paths: string[] }> = []

    for (const [bucket, paths] of assetsByBucket.entries()) {
      const uniquePaths = [...new Set(paths)].filter(Boolean)
      if (!uniquePaths.length) continue

      const { error: removeError } = await adminClient.storage.from(bucket).remove(uniquePaths)
      if (removeError) {
        throw new HttpError(500, `Failed to remove ${bucket} asset(s): ${removeError.message}`)
      }

      removed.push({ bucket, paths: uniquePaths })
    }

    return jsonResponse({
      success: true,
      removed,
    })
  } catch (error) {
    console.log("[cleanup-shop-registration-assets] failed", error)
    if (error instanceof HttpError) {
      return jsonResponse({ error: error.message }, error.status)
    }

    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unexpected server error." },
      500,
    )
  }
})
