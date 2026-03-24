import { supabase } from "./supabase"
import {
  normalizeEmail,
  normalizePhone,
} from "./validators"

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

export async function isIpBanned(ip) {
  if (!ip || ip === "unknown") return false

  const { data, error } = await supabase
    .from("ip_blacklist")
    .select("ip_address")
    .eq("ip_address", ip)
    .maybeSingle()

  if (error) return false
  return Boolean(data)
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
          key.includes("ctm_")
        )
      ) {
        keysToRemove.push(key)
      }
    }

    keysToRemove.forEach((key) => localStorage.removeItem(key))

    // 3. Clear session storage
    sessionStorage.clear()
  } catch (error) {
    console.error("Error during client cleanup:", error)
  }

  if (signOutError) {
    console.warn("Continuing local logout cleanup after sign-out error.")
  }
}

export async function signInWithPassword({ email, password }) {
  const ipData = await getClientIpData()

  if (await isIpBanned(ipData.ip)) {
    throw new Error("Access denied. Your network has been restricted.")
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: normalizeEmail(email),
    password,
  })

  if (error) throw error

  return {
    auth: data,
    ipData,
  }
}

export async function signInWithGoogleIdToken(idToken) {
  const ipData = await getClientIpData()

  if (await isIpBanned(ipData.ip)) {
    throw new Error("Access denied. Your network has been restricted.")
  }

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

  if (await isIpBanned(ipData.ip)) {
    throw new Error("Access denied. Your network has been restricted.")
  }

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
