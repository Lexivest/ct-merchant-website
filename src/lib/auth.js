import { supabase } from "./supabase"
import {
  normalizeEmail,
  normalizePhone,
} from "./validators"
import { clearCachedFetchStore } from "../hooks/useCachedFetch"

export async function getClientIpData() {
  try {
    // Calling the secure Server-Side RPC instead of the Cloudflare trace
    const { data, error } = await supabase.rpc('get_network_info')
    
    if (error) throw error

    return {
      ip: data?.ip || "unknown",
      country: data?.country || "unknown",
    }
  } catch (error) {
    console.error("Failed to fetch secure network info:", error.message)
    return {
      ip: "unknown",
      country: "unknown",
    }
  }
}

export async function fetchOpenCities() {
  const { data, error } = await supabase
    .from("cities")
    .select("id, name")
    .eq("is_open", true)
    .order("name")

  if (error) throw error
  return data || []
}

export async function fetchAreasByCity(cityId) {
  const { data, error } = await supabase
    .from("areas")
    .select("id, name")
    .eq("city_id", cityId)
    .order("name")

  if (error) throw error
  return data || []
}

export async function getSession() {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession()

  if (error) throw error
  return session
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
    const keysToRemove = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
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

    keysToRemove.forEach((key) => localStorage.removeItem(key))

    // 3. Clear session storage
    sessionStorage.clear()

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
    // If login fails with invalid credentials, record the failed attempt
    const msg = error.message.toLowerCase()
    if (msg.includes("invalid") || msg.includes("credential")) {
      const { data: attempts, error: rpcError } = await supabase.rpc('record_failed_login', { p_email: normalizedEmail })
      
      if (!rpcError && typeof attempts === 'number') {
        if (attempts >= 4) {
          throw new Error("Your account is suspended. Please contact support.")
        } else if (attempts > 0) {
          const remaining = 4 - attempts
          throw new Error(`Invalid credentials. You have ${remaining} attempt${remaining === 1 ? '' : 's'} remaining before your account is suspended.`)
        }
      } else if (rpcError) {
        console.error("Failed to record login attempt:", rpcError)
      }
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
      console.error("Profile fetch error during login:", profileError)
    }

    if (profile?.is_suspended) {
      await supabase.auth.signOut()
      clearCachedFetchStore()
      throw new Error("Your account is suspended. Please contact support.")
    }

    // Success! Reset the failed login counter
    if (profile?.failed_login_attempts > 0) {
      await supabase.rpc('reset_failed_login')
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

  const { error: profileError } = await supabase.from("profiles").insert({
    id: authData.user.id,
    full_name: fullName.trim(),
    phone: normalizePhone(phone),
    city_id: Number(cityId),
    area_id: Number(areaId),
    registration_ip: ipData.ip,
    last_active_ip: ipData.ip,
    ip_country: ipData.country,
  })

  if (profileError) throw profileError

  return {
    user: authData.user,
    ipData,
  }
}

export async function fetchProfileByUserId(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("*, cities(name)")
    .eq("id", userId)
    .maybeSingle()

  if (error) throw error
  return data
}

export function isProfileComplete(profile) {
  return Boolean(profile && profile.city_id && profile.area_id)
}

export function isProfileSuspended(profile) {
  return Boolean(profile?.is_suspended === true)
}

export async function updateLastActiveIp(userId, ip) {
  if (!userId || !ip || ip === "unknown") return

  await supabase
    .from("profiles")
    .update({ last_active_ip: ip })
    .eq("id", userId)
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
