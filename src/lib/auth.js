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

export async function getClientIpData() {
  // TEMPORARILY DISABLED: Firefox Enhanced Tracking Protection (ETP) strictly flags endpoints 
  // that fetch IP addresses as "Trackers" and instantly blocks the entire database domain.
  /*
  const { data, error } = await supabase.rpc('get_network_info')
  if (error) throw error
  return {
    ip: data?.ip || "unknown",
    country: data?.country || "unknown",
  }
  */
  return {
    ip: "unknown",
    country: "unknown",
  }
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

export async function signInWithPassword({ email, password }) {
  const ipData = await getClientIpData()
  const normalizedEmail = normalizeEmail(email)

  const { data, error } = await supabase.auth.signInWithPassword({
    email: normalizedEmail,
    password,
  })

  if (error) {
    const rawMessage = String(error?.message || "")
    const lowerMessage = rawMessage.toLowerCase()
    const authStatus = Number(error?.status || 0)
    const authCode = String(error?.code || "").toLowerCase()
    const isInvalidCredentialsError =
      authStatus === 400 ||
      authCode === "invalid_grant" ||
      lowerMessage.includes("invalid") ||
      lowerMessage.includes("credential") ||
      lowerMessage.includes("password") ||
      lowerMessage.includes("grant")

    if (isInvalidCredentialsError) {
      try {
        const { data: attempts, error: rpcError } = await supabase.rpc("record_failed_login", {
          p_email: normalizedEmail,
        })

        if (!rpcError && typeof attempts === "number") {
          if (attempts >= 4) {
            throw new Error(
              "Your account is suspended due to too many failed login attempts. Please contact support."
            )
          }

          if (attempts > 0) {
            const remaining = 4 - attempts
            throw new Error(
              `Invalid credentials. You have ${remaining} attempt${remaining === 1 ? "" : "s"} remaining before your account is suspended.`
            )
          }
        }
      } catch (trackingError) {
        if (trackingError instanceof Error && trackingError.message) {
          throw trackingError
        }
        console.warn("Failed to record login attempt:", trackingError?.message || trackingError)
      }

      throw new Error("Invalid credentials. Please try again.")
    }

    throw error
  }

  const user = data.user || data.session?.user
  if (user) {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("is_suspended, failed_login_attempts")
      .eq("id", user.id)
      .maybeSingle()

    if (profileError) {
      console.error("Profile check failed during login:", profileError)
    }

    if (profile?.is_suspended) {
      await supabase.auth.signOut()
      clearCachedFetchStore()
      throw new Error("Your account is suspended. Please contact support.")
    }

    if (profile?.failed_login_attempts > 0) {
      try {
        await supabase.rpc("reset_failed_login")
      } catch (e) {
        console.warn("Failed to reset login attempts:", e.message)
      }
    }
  }


  return {
    auth: data,
    ipData,
  }
}

export async function signInWithGoogleIdToken(idToken) {
  const ipData = await getClientIpData()

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: "google",
    token: idToken,
  })

  if (error) throw error

  return {
    auth: data,
    ipData,
  }
}

export async function signUpWithEmail({
  fullName,
  phone,
  email,
  password,
  cityId,
  areaId,
}) {
  const ipData = await getClientIpData()

  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: normalizeEmail(email),
    password,
    options: {
      data: {
        full_name: fullName.trim(),
      },
    },
  })

  if (authError) throw authError
  if (!authData?.user) {
    throw new Error("Account could not be created.")
  }

  let profileError = null
  for (let attempt = 1; attempt <= 3; attempt++) {
    const { error } = await supabase.from("profiles").upsert({
      id: authData.user.id,
      full_name: fullName.trim(),
      phone: normalizePhone(phone),
      city_id: Number(cityId),
      area_id: Number(areaId),
      registration_ip: ipData.ip,
      last_active_ip: ipData.ip,
      ip_country: ipData.country,
    })
    
    if (!error) {
      profileError = null
      break
    }
    profileError = error
    if (attempt < 3) await new Promise(r => setTimeout(r, 1000 * attempt))
  }

  if (profileError) {
    console.error("Profile creation failed after retries:", profileError)
  }

  return {
    auth: authData,
    user: authData.user,
    ipData,
  }
}

export async function fetchProfileByUserId(userId) {
  // 1. Try to fetch regular profile
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*, cities(name)")
    .eq("id", userId)
    .maybeSingle()

  if (profileError) throw profileError

  // 2. Check if this user is staff
  const { data: staff, error: staffError } = await supabase
    .from("staff_profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle()

  if (staffError) {
    console.warn("Staff check failed:", staffError.message)
  }

  // 3. Return combined profile with role
  if (profile) {
    return {
      ...profile,
      role: staff ? "staff" : "user"
    }
  }

  if (staff) {
    return {
      ...staff,
      role: "staff"
    }
  }

  return null
}

export function isProfileComplete(profile) {
  return Boolean(profile && profile.city_id && profile.area_id)
}

export function isProfileSuspended(profile) {
  return Boolean(profile?.is_suspended === true)
}

export async function updateLastActiveIp(userId, ip) {
  if (!userId || !ip || ip === "unknown") return

  try {
    await supabase
      .from("profiles")
      .update({ last_active_ip: ip })
      .eq("id", userId)
  } catch {
    // Silently ignore background tracking updates blocked by browser privacy settings
  }
}

export async function completeProfileSetup({
  userId,
  fullName,
  phone,
  cityId,
  areaId,
}) {
  const ipData = await getClientIpData()

  const { error } = await supabase.from("profiles").upsert({
    id: userId,
    full_name: fullName?.trim() || "",
    phone: normalizePhone(phone),
    city_id: Number(cityId),
    area_id: Number(areaId),
    registration_ip: ipData.ip,
    last_active_ip: ipData.ip,
    ip_country: ipData.country,
  })

  if (error) throw error

  return { ipData }
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
