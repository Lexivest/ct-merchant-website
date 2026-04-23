import { supabase } from "./supabase"

export const STAFF_AUTH_TIMEOUT_MS = 12000

export function withStaffAuthTimeout(
  promise,
  message = "Staff verification is taking too long. Please check your connection and try again.",
  timeoutMs = STAFF_AUTH_TIMEOUT_MS
) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      const timerId = window.setTimeout(() => {
        window.clearTimeout(timerId)
        reject(new Error(message))
      }, timeoutMs)
    }),
  ])
}

function normalizeRole(role, source) {
  const rawRole = String(role || "").trim()
  if (rawRole === "director") return "super_admin"
  if (rawRole) return rawRole
  return source === "staff_profiles" ? "staff" : "city_admin"
}

function normalizeStaffRow(row, source) {
  if (!row) return null

  return {
    id: row.id || null,
    role: normalizeRole(row.role, source),
    city_id: row.city_id || null,
    full_name: row.full_name || "",
    source,
  }
}

function getSettledResponse(result) {
  if (result.status === "fulfilled") return result.value
  return { data: null, error: result.reason }
}

export async function resolveStaffAccess(userId) {
  if (!userId) return null

  const [adminResult, staffResult] = await Promise.allSettled([
    withStaffAuthTimeout(
      supabase
        .from("admins")
        .select("id, role, city_id, full_name")
        .eq("id", userId)
        .maybeSingle(),
      "Admin verification is taking too long. Please retry."
    ),
    withStaffAuthTimeout(
      supabase
        .from("staff_profiles")
        .select("id, role, city_id, full_name")
        .eq("id", userId)
        .maybeSingle(),
      "Staff verification is taking too long. Please retry."
    ),
  ])

  const adminResponse = getSettledResponse(adminResult)
  const staffResponse = getSettledResponse(staffResult)

  if (adminResponse.data) {
    return normalizeStaffRow(adminResponse.data, "admins")
  }

  if (staffResponse.data) {
    return normalizeStaffRow(staffResponse.data, "staff_profiles")
  }

  if (adminResponse.error && staffResponse.error) {
    throw adminResponse.error
  }

  return null
}

export function buildStaffAuthProfile(user, staffAccess) {
  if (!user?.id || !staffAccess) return null

  return {
    id: user.id,
    full_name:
      staffAccess.full_name ||
      user.user_metadata?.full_name ||
      user.email ||
      "Staff",
    phone: user.user_metadata?.phone || "",
    avatar_url: user.user_metadata?.avatar_url || "",
    is_suspended: false,
    city_id: staffAccess.city_id || null,
    area_id: null,
    role: staffAccess.role,
    created_at: user.created_at || null,
  }
}
