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

function normalizeStaffRole(role) {
  const rawRole = String(role || "").trim()
  return rawRole || "staff"
}

function normalizeAdminRole(role) {
  const rawRole = String(role || "").trim()
  return rawRole || null
}

function normalizeStaffAccess(staffRow, adminRow) {
  if (!staffRow) return null

  const staffCityId = staffRow.city_id || null
  const adminCityId = adminRow?.city_id || null
  const adminRole = normalizeAdminRole(adminRow?.role)

  return {
    id: staffRow.id || null,
    role: "staff",
    staff_role: normalizeStaffRole(staffRow.role),
    admin_role: adminRole,
    city_id: adminCityId || staffCityId,
    staff_city_id: staffCityId,
    admin_city_id: adminCityId,
    full_name: staffRow.full_name || adminRow?.full_name || "",
    department: staffRow.department || "",
    employment_date: staffRow.created_at || adminRow?.created_at || null,
    source: "staff_profiles",
    has_admin_role: Boolean(adminRole),
    staff_portal_access: true,
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
        .select("id, role, city_id, full_name, created_at")
        .eq("id", userId)
        .maybeSingle(),
      "Admin verification is taking too long. Please retry."
    ),
    withStaffAuthTimeout(
      supabase
        .from("staff_profiles")
        .select("id, role, city_id, full_name, department, created_at")
        .eq("id", userId)
        .maybeSingle(),
      "Staff verification is taking too long. Please retry."
    ),
  ])

  const adminResponse = getSettledResponse(adminResult)
  const staffResponse = getSettledResponse(staffResult)

  if (staffResponse.data) {
    return normalizeStaffAccess(staffResponse.data, adminResponse.data)
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
    staff_city_id: staffAccess.staff_city_id || null,
    admin_city_id: staffAccess.admin_city_id || null,
    area_id: null,
    role: "staff",
    staff_role: staffAccess.staff_role || "staff",
    admin_role: staffAccess.admin_role || null,
    department: staffAccess.department || "",
    employment_date: staffAccess.employment_date || null,
    has_admin_role: Boolean(staffAccess.admin_role),
    staff_portal_access: true,
    created_at: user.created_at || null,
  }
}
