const NETWORK_ERROR_PATTERN =
  /(failed to fetch|networkerror|network error|load failed|fetch resource|internet connection|offline|timeout|timed out|aborterror|operation was aborted)/i

export function isNetworkError(error) {
  const rawMessage = String(error?.message || error || "").toLowerCase()
  return NETWORK_ERROR_PATTERN.test(rawMessage)
}

export function getFriendlyErrorMessage(error, fallback = "Something went wrong. Please retry.") {
  const rawMessage = String(error?.message || error || "").trim()
  const lower = rawMessage.toLowerCase()

  if (!rawMessage) return fallback

  if (NETWORK_ERROR_PATTERN.test(rawMessage)) {
    return "Network unavailable. Retry."
  }

  if (lower.includes("unauthorized") || lower.includes("session expired")) {
    return "Session expired. Please sign in again."
  }

  if (lower.includes("database error saving new user") || lower.includes("phone number already exists")) {
    return "This phone number is already registered to another account."
  }

  if (lower.includes("duplicate key value violates unique constraint \"idx_shops_owner_id_unique\"")) {
    return "You already have a shop registered. You can only manage one shop per account."
  }

  if (lower.includes("duplicate key value violates unique constraint \"shops_name_key\"") || lower.includes("shop name already exists")) {
    return "A shop with this name is already registered. Please choose a unique name."
  }

  if (lower.includes("duplicate key value violates unique constraint \"shops_cac_number_key\"") || lower.includes("cac number already exists")) {
    return "This RC / CAC number is already registered to another shop."
  }

  if (lower.includes("duplicate key value violates unique constraint \"shops_phone_key\"")) {
    return "This business phone number is already registered to another shop."
  }

  if (lower.includes("user already exists") || lower.includes("email already in use")) {
    return "An account with this email already exists."
  }

  if (lower.includes("permission denied") || lower.includes("row-level security")) {
    return "You do not have permission to complete this action."
  }

  if (rawMessage.includes(" | ") || rawMessage.includes("details:") || rawMessage.includes("hint:")) {
    return fallback
  }

  return rawMessage.length > 160 ? fallback : rawMessage
}
