const NETWORK_ERROR_PATTERN =
  /(failed to fetch|networkerror|network error|load failed|fetch resource|internet connection|offline|timeout|timed out|aborterror|operation was aborted)/i

export function isNetworkError(error) {
  const rawMessage = String(error?.message || error || "").toLowerCase()
  return NETWORK_ERROR_PATTERN.test(rawMessage)
}

export function getFriendlyErrorMessage(error, fallback = "We encountered an issue. Please try again.") {
  const rawMessage = String(error?.message || error || "").trim()
  const lower = rawMessage.toLowerCase()

  if (!rawMessage) return fallback

  if (NETWORK_ERROR_PATTERN.test(rawMessage)) {
    return "Check your internet connection and try again."
  }

  if (lower.includes("unauthorized") || lower.includes("session expired")) {
    return "Your session has ended. Please sign in to continue."
  }

  if (lower.includes("database error saving new user")) {
    return "We encountered a database issue while creating your profile. Please contact support if this persists."
  }

  if (lower.includes("phone number already exists")) {
    return "This phone number is already linked to another account."
  }

  if (lower.includes("duplicate key value violates unique constraint \"idx_shops_owner_id_unique\"")) {
    return "You already have a shop registered. Each account is limited to one shop."
  }

  if (lower.includes("duplicate key value violates unique constraint \"shops_name_key\"") || lower.includes("shop name already exists")) {
    return "This shop name is already in use. Please try a different name."
  }

  if (lower.includes("duplicate key value violates unique constraint \"shops_cac_number_key\"") || lower.includes("cac number already exists")) {
    return "This RC or CAC number is already registered. Please check the details."
  }

  if (lower.includes("duplicate key value violates unique constraint \"shops_phone_key\"")) {
    return "This business phone number is already registered to another shop."
  }

  if (lower.includes("user already exists") || lower.includes("email already in use")) {
    return "An account with this email address already exists."
  }

  if (lower.includes("permission denied") || lower.includes("row-level security")) {
    return "You don't have the required permissions for this action."
  }

  if (rawMessage.includes(" | ") || rawMessage.includes("details:") || rawMessage.includes("hint:")) {
    return fallback
  }

  return rawMessage.length > 160 ? fallback : rawMessage
}
