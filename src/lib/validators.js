export function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase()
}

export function normalizePhone(value) {
  return String(value || "").replace(/\s+/g, "").trim()
}

export function countWords(value) {
  return String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length
}

export function isValidEmail(value) {
  const email = normalizeEmail(value)
  return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[A-Za-z]{2,}$/.test(email)
}

export function isValidNigerianPhone(value) {
  const phone = normalizePhone(value)
  // Accept: 
  // 1. 11 digits starting with 0 (e.g. 08012345678)
  // 2. 10 digits (e.g. 8012345678, usually for +234 prefix)
  // 3. E.164 format (+ followed by 11-15 digits)
  return /^(0\d{10}|\d{10}|\+\d{11,15})$/.test(phone)
}

export function isStrongEnoughPassword(value) {
  const pwd = String(value || "")
  return (
    pwd.length >= 8 &&
    /[a-z]/.test(pwd) &&
    /[A-Z]/.test(pwd) &&
    /[0-9]/.test(pwd) &&
    /[^a-zA-Z0-9]/.test(pwd)
  )
}

export function isValidUrl(value) {
  if (!value) return true
  try {
    const url = String(value).trim()
    new URL(url.startsWith("http") ? url : `https://${url}`)
    return true
  } catch {
    return false
  }
}

export function matchesPlatformUrl(value, platform) {
  if (!value) return true

  try {
    const raw = String(value).trim()
    const parsed = new URL(raw.startsWith("http") ? raw : `https://${raw}`)
    const host = parsed.hostname.toLowerCase()

    if (platform === "twitter") {
      return host.includes("twitter.com") || host.includes("x.com")
    }

    return host.includes(`${platform}.com`)
  } catch {
    return false
  }
}

export function formatUrl(value) {
  const raw = String(value || "").trim()
  if (!raw) return ""
  return raw.startsWith("http://") || raw.startsWith("https://")
    ? raw
    : `https://${raw}`
}

export function validateSignupForm(values) {
  const errors = {}

  if (!values.fullName?.trim()) {
    errors.fullName = "Full name is required."
  } else if (values.fullName.trim().length < 2) {
    errors.fullName = "Full name must be at least 2 characters."
  }

  if (!values.phone?.trim()) {
    errors.phone = "Phone number is required."
  } else if (!isValidNigerianPhone(values.phone)) {
    errors.phone = "Enter a valid phone number, for example 08012345678."
  }

  if (!values.email?.trim()) {
    errors.email = "Email address is required."
  } else if (!isValidEmail(values.email)) {
    errors.email = "Enter a valid email address."
  }

  if (!values.cityId) {
    errors.cityId = "Please select a city."
  }

  if (!values.areaId) {
    errors.areaId = "Please select an area."
  }

  if (!values.password) {
    errors.password = "Password is required."
  } else if (!isStrongEnoughPassword(values.password)) {
    errors.password = "Password must be at least 8 characters and include upper/lower case, a digit, and a symbol."
  }

  if (!values.confirmPassword) {
    errors.confirmPassword = "Please confirm your password."
  } else if (values.password !== values.confirmPassword) {
    errors.confirmPassword = "Passwords do not match."
  }

  return errors
}

export function validateCompleteProfileForm(values) {
  const errors = {}

  if (!values.phone?.trim()) {
    errors.phone = "Phone number is required."
  } else if (!isValidNigerianPhone(values.phone)) {
    errors.phone = "Enter a valid phone number."
  }

  if (!values.cityId) {
    errors.cityId = "Please select a city."
  }

  if (!values.areaId) {
    errors.areaId = "Please select an area."
  }

  return errors
}

export function validateResetRequestForm(values) {
  const errors = {}

  if (!values.email?.trim()) {
    errors.email = "Email address is required."
  } else if (!isValidEmail(values.email)) {
    errors.email = "Enter a valid email address."
  }

  return errors
}

export function validateResetPasswordForm(values) {
  const errors = {}

  if (!values.token?.trim()) {
    errors.token = "Recovery code is required."
  } else if (!/^\d{6}$/.test(values.token.trim())) {
    errors.token = "Enter the 6-digit recovery code."
  }

  if (!values.newPassword) {
    errors.newPassword = "New password is required."
  } else if (!isStrongEnoughPassword(values.newPassword)) {
    errors.newPassword = "Password must be at least 8 characters and include upper/lower case, a digit, and a symbol."
  }

  if (!values.confirmPassword) {
    errors.confirmPassword = "Please confirm the new password."
  } else if (values.newPassword !== values.confirmPassword) {
    errors.confirmPassword = "Passwords do not match."
  }

  return errors
}