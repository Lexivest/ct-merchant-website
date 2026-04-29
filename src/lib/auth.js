import { supabase } from "./supabase"
import {
  normalizeEmail,
  normalizePhone,
} from "./validators"
import { clearCachedFetchStore } from "../hooks/useCachedFetch"

const LOCATION_QUERY_TIMEOUT_MS = 8000

function withTimeout(promise, message, timeoutMs = LOCATION_QUERY_TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      const timerId = setTimeout(() => {
        clearTimeout(timerId)
        reject(new Error(message))
      }, timeoutMs)
    }),
  ])
}

export async function fetchOpenCities() {
  const { data, error } = await withTimeout(
    supabase
      .from("cities")
      .select("id, name")
      .eq("is_open", true)
      .order("name"),
    "City list is taking too long to load. Please retry."
  )

  if (error) throw error
  return data || []
}

export async function fetchAreasByCity(cityId) {
  const { data, error } = await withTimeout(
    supabase
      .from("areas")
      .select("id, name")
      .eq("city_id", cityId)
      .order("name"),
    "Area list is taking too long to load. Please retry."
  )

  if (error) throw error
  return data || []
}

export async function getSession() {
  try {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession()

    if (error) {
      console.warn("Session fetch blocked by browser privacy settings:", error.message)
      return null
    }
    return session
  } catch (e) {
    console.warn("Session read exception:", e.message)
    return null
  }
}

export async function stampProfileFootprint(userId, { silent = true } = {}) {
  if (!userId) return false

  try {
    const { error } = await supabase.rpc("stamp_profile_footprint", {
      p_target_user_id: userId,
    })

    if (error) throw error
    return true
  } catch (error) {
    if (!silent) throw error
    console.warn("Footprint RPC failed:", error)
    return false
  }
}

// Upgraded to act as the Global Logout & Cache Cleaner
export async function signOutUser() {
  let signOutError = null

  try {
    // 1. Invalidate session on the server
    await supabase.auth.signOut()
  } catch (error) {
    signOutError = error
    console.error("Error during logout:", error)
  }

  try {
    // 2. Wipe Local Storage safely (only our app's keys)
    if (typeof window !== "undefined") {
      const storage = window.localStorage
      if (storage) {
        const keysToRemove = []
        for (let i = 0; i < storage.length; i++) {
          const key = storage.key(i)
          if (
            key &&
            (
              key.startsWith("sb-") ||
              key.startsWith("vendor_panel_") ||
              key.startsWith("shop_detail_") ||
              key.startsWith("open_cities") ||
              key.startsWith("areas_") ||
              key.startsWith("ctmerchant_") ||
              key.includes("ctm_")
            )
          ) {
            keysToRemove.push(key)
          }
        }
        keysToRemove.forEach((key) => storage.removeItem(key))
      }
    }

    // 3. Clear session storage safely
    if (typeof window !== "undefined") {
      const sess = window.sessionStorage
      if (sess) {
        sess.clear()
      }
    }

    // 4. Clear in-memory query cache used by useCachedFetch
    clearCachedFetchStore()
  } catch (error) {
    console.error("Error during client cleanup:", error)
  }

  if (signOutError) {
    console.warn("Continuing local logout cleanup after sign-out error.")
  }
}

const LOGIN_SUSPENSION_THRESHOLD = 3
const SECURITY_HEARTBEAT_RPC = "ctm_security_heartbeat"

function isMissingRpcError(error) {
  const message = String(error?.message || "").toLowerCase()
  const code = String(error?.code || "").toLowerCase()
  return (
    code === "pgrst202" ||
    code === "42883" ||
    message.includes("could not find the function") ||
    message.includes("function") && message.includes("does not exist")
  )
}

function getSecurityHeartbeatStatus(data, fallbackEmail = "") {
  const row = data || {}
  const parsedRemaining = Number(row?.remaining ?? LOGIN_SUSPENSION_THRESHOLD)
  const remainingAttempts = Number.isFinite(parsedRemaining)
    ? parsedRemaining
    : LOGIN_SUSPENSION_THRESHOLD
  const failedAttempts = LOGIN_SUSPENSION_THRESHOLD - remainingAttempts
  return {
    email: fallbackEmail || "",
    userId: row?.user_id || null,
    failedAttempts: failedAttempts,
    attemptsRemaining: remainingAttempts,
    isSuspended: Boolean(row?.is_blocked),
    status: row?.status || "CLEAR",
  }
}

async function runSecurityHeartbeat(email, action = "CHECK", fallbackMessage) {
  const normalizedEmail = normalizeEmail(email)

  const { data, error } = await supabase.rpc(SECURITY_HEARTBEAT_RPC, {
    p_email: normalizedEmail,
    p_action: action,
  })

  if (error) {
    if (isMissingRpcError(error)) {
      throw new Error("Security check is updating. Please try again in a few seconds.")
    }
    throw new Error(fallbackMessage || "Security check failed.")
  }

  return getSecurityHeartbeatStatus(data, normalizedEmail)
}

async function ensureEmailIsNotSuspended(email, options = {}) {
  const { signOutOnSuspended = false } = options
  const status = await runSecurityHeartbeat(
    email,
    "CHECK",
    "Could not verify your account access right now. Please try again."
  )

  if (status.isSuspended) {
    if (signOutOnSuspended) {
      await signOutUser()
    }
    throw new Error("Your account is suspended. Please contact support.")
  }

  return status
}

function isLikelyCredentialFailure(error) {
  const lowerMessage = String(error?.message || "").toLowerCase()
  return (
    error?.status === 400 ||
    error?.status === 401 ||
    lowerMessage.includes("invalid") ||
    lowerMessage.includes("credentials") ||
    lowerMessage.includes("grant") ||
    lowerMessage.includes("not found")
  )
}

export async function signInWithPassword({ email, password }) {
  const normalizedEmail = normalizeEmail(email)

  await ensureEmailIsNotSuspended(normalizedEmail)

  const { data, error } = await supabase.auth.signInWithPassword({
    email: normalizedEmail,
    password,
  })

  if (error) {
    const isCreds = isLikelyCredentialFailure(error)

    if (isCreds) {
      try {
        const status = await runSecurityHeartbeat(
          normalizedEmail,
          "FAILURE",
          "Could not update login security right now."
        )

        if (status.isSuspended) {
          throw new Error("Your account is suspended due to too many failed attempts. Please contact support.")
        }

        if (status.attemptsRemaining < 3) {
          const remaining = status.attemptsRemaining
          const msg = `Invalid credentials. You have ${remaining} attempt${remaining === 1 ? "" : "s"} remaining before your account is suspended.`
          throw new Error(msg)
        }
      } catch (guardError) {
        const msg = guardError.message || ""
        if (msg.includes("suspended") || msg.includes("remaining")) {
          throw guardError
        }
        console.error("[Security] Tracking failed:", guardError)
      }
      throw new Error("Invalid credentials. Please check your email and password.")
    }
    throw error
  }

  const user = data.user || data.session?.user
  if (user) {
    const status = await runSecurityHeartbeat(
      user.email || normalizedEmail,
      "SUCCESS",
      "Could not finalize your login security check."
    )

    if (status.isSuspended) {
      await signOutUser()
      throw new Error("Your account is suspended. Please contact support.")
    }

    // Keep last-seen profile metadata fresh without blocking login.
    await stampProfileFootprint(user.id)
  }

  return { auth: data }
}

export async function signInWithGoogleIdToken(idToken) {
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: "google",
    token: idToken,
  })

  if (error) throw error

  const signedInUser = data.user || data.session?.user
  const userEmail = signedInUser?.email ? normalizeEmail(signedInUser.email) : ""

  if (userEmail) {
    const status = await runSecurityHeartbeat(
      userEmail,
      "SUCCESS",
      "Could not verify your account access right now."
    )

    if (status.isSuspended) {
      await signOutUser()
      throw new Error("Your account is suspended. Please contact support.")
    }

    if (signedInUser?.id) {
      // Keep last-seen profile metadata fresh without blocking login.
      await stampProfileFootprint(signedInUser.id)
    }
  }

  return { auth: data }
}

export async function signUpWithEmail({
  fullName,
  phone,
  email,
  password,
  cityId,
  areaId,
}) {
  const normalizedEmail = normalizeEmail(email)
  const normalizedPhone = normalizePhone(phone)

  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: normalizedEmail,
    password,
    options: {
      data: {
        full_name: fullName.trim(),
        phone: normalizedPhone,
        city_id: Number(cityId),
        area_id: Number(areaId),
      },
    },
  })

  if (authError) {
    throw authError
  }
  
  if (!authData?.user) {
    throw new Error("Account could not be created.")
  }

  // Keep signup profile metadata fresh without blocking account creation.
  await stampProfileFootprint(authData.user.id)

  return {
    auth: authData,
    user: authData.user
  }
}

export async function fetchProfileByUserId(userId) {
  const { data: profile, error } = await supabase
    .from("vw_user_profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle()

  if (!error) {
    return profile
  }

  const isPermissionError =
    String(error?.code || "") === "42501" ||
    String(error?.message || "").toLowerCase().includes("permission denied")

  if (!isPermissionError) {
    console.error("Error fetching unified profile:", error)
    throw error
  }

  console.warn("Unified profile view unavailable, falling back to base profile query:", error.message)

  const { data: baseProfile, error: baseProfileError } = await supabase
    .from("profiles")
    .select(`
      id,
      full_name,
      phone,
      avatar_url,
      is_suspended,
      city_id,
      area_id,
      created_at,
      cities (
        name
      ),
      areas (
        name
      )
    `)
    .eq("id", userId)
    .maybeSingle()

  if (baseProfileError) {
    console.error("Error fetching base profile fallback:", baseProfileError)
    throw baseProfileError
  }

  if (!baseProfile) {
    return null
  }

  const [adminResult, staffResult] = await Promise.allSettled([
    supabase
      .from("admins")
      .select("role, city_id")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("staff_profiles")
      .select("role, city_id")
      .eq("id", userId)
      .maybeSingle(),
  ])

  const adminRow =
    adminResult.status === "fulfilled" && !adminResult.value.error
      ? adminResult.value.data
      : null

  const staffRow =
    staffResult.status === "fulfilled" && !staffResult.value.error
      ? staffResult.value.data
      : null

  const hasStaffProfile = Boolean(staffRow)
  const adminRole = hasStaffProfile ? adminRow?.role || null : null
  const staffRole = hasStaffProfile ? staffRow?.role || "staff" : null

  return {
    id: baseProfile.id,
    full_name: baseProfile.full_name,
    phone: baseProfile.phone,
    avatar_url: baseProfile.avatar_url,
    is_suspended: Boolean(baseProfile.is_suspended),
    city_id: baseProfile.city_id,
    city_name: baseProfile.cities?.name || "",
    area_id: baseProfile.area_id,
    area_name: baseProfile.areas?.name || "",
    role: hasStaffProfile ? "staff" : "user",
    staff_role: staffRole,
    admin_role: adminRole,
    staff_city_id: staffRow?.city_id || null,
    admin_city_id: adminRole ? adminRow?.city_id || null : null,
    has_admin_role: Boolean(adminRole),
    staff_portal_access: hasStaffProfile,
    created_at: baseProfile.created_at,
  }
}

export function isProfileComplete(profile) {
  return Boolean(profile && profile.city_id && profile.area_id)
}

export function isProfileSuspended(profile) {
  return Boolean(profile?.is_suspended === true)
}

async function fetchProfileSetupRow(userId) {
  return fetchProfileByUserId(userId)
}

async function fetchCompletedProfileSnapshot(userId, fallbackProfile = null) {
  try {
    return (await fetchProfileByUserId(userId)) || fallbackProfile
  } catch (error) {
    console.warn("Could not refresh completed profile snapshot:", error)
    return fallbackProfile
  }
}

function parseProfileSetupLocation({ cityId, areaId }) {
  const nextCityId = Number(cityId)
  const nextAreaId = Number(areaId)

  if (
    !Number.isInteger(nextCityId) ||
    nextCityId <= 0 ||
    !Number.isInteger(nextAreaId) ||
    nextAreaId <= 0
  ) {
    throw new Error("Please select a valid city and area.")
  }

  return { cityId: nextCityId, areaId: nextAreaId }
}

export async function completeProfileSetup({
  userId,
  fullName,
  phone,
  cityId,
  areaId,
}) {
  if (!userId) throw new Error("Profile owner is missing.")

  const { cityId: nextCityId, areaId: nextAreaId } = parseProfileSetupLocation({
    cityId,
    areaId,
  })
  const normalizedPhone = normalizePhone(phone)
  const trimmedName = fullName?.trim() || ""
  const existingProfile = await fetchProfileSetupRow(userId)

  if (isProfileComplete(existingProfile)) {
    await stampProfileFootprint(userId)
    return fetchCompletedProfileSnapshot(userId, existingProfile)
  }

  if (existingProfile) {
    const updatePayload = {
      phone: normalizedPhone,
      city_id: nextCityId,
      area_id: nextAreaId,
    }

    if (!String(existingProfile.full_name || "").trim() && trimmedName) {
      updatePayload.full_name = trimmedName
    }

    const { error } = await supabase
      .from("profiles")
      .update(updatePayload)
      .eq("id", userId)

    if (error) throw error

    await stampProfileFootprint(userId)
    return fetchCompletedProfileSnapshot(userId, { ...existingProfile, ...updatePayload })
  }

  const insertPayload = {
    id: userId,
    full_name: trimmedName,
    phone: normalizedPhone,
    city_id: nextCityId,
    area_id: nextAreaId,
  }

  const { error } = await supabase
    .from("profiles")
    .insert(insertPayload)

  if (error) {
    const duplicateProfile = String(error?.code || "") === "23505"
    if (!duplicateProfile) throw error

    const latestProfile = await fetchProfileSetupRow(userId)
    if (isProfileComplete(latestProfile)) {
      await stampProfileFootprint(userId)
      return fetchCompletedProfileSnapshot(userId, latestProfile)
    }

    const updatePayload = {
      phone: normalizedPhone,
      city_id: nextCityId,
      area_id: nextAreaId,
    }

    if (!String(latestProfile?.full_name || "").trim() && trimmedName) {
      updatePayload.full_name = trimmedName
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .update(updatePayload)
      .eq("id", userId)

    if (updateError) throw updateError

    await stampProfileFootprint(userId)
    return fetchCompletedProfileSnapshot(
      userId,
      { ...(latestProfile || { id: userId }), ...updatePayload }
    )
  }

  await stampProfileFootprint(userId)
  return fetchCompletedProfileSnapshot(userId, insertPayload)
}

export async function sendPasswordResetCode(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(
    normalizeEmail(email)
  )

  if (error) throw error
}

export async function verifyRecoveryCodeAndResetPassword({
  email,
  token,
  newPassword,
}) {
  const { error: verifyError } = await supabase.auth.verifyOtp({
    email: normalizeEmail(email),
    token: token.trim(),
    type: "recovery",
  })

  if (verifyError) throw verifyError

  const { error: updateError } = await supabase.auth.updateUser({
    password: newPassword,
  })

  if (updateError) throw updateError
}
