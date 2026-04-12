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

  if (lower.includes("permission denied") || lower.includes("row-level security")) {
    return "You do not have permission to complete this action."
  }

  if (rawMessage.includes(" | ") || rawMessage.includes("details:") || rawMessage.includes("hint:")) {
    return fallback
  }

  return rawMessage.length > 160 ? fallback : rawMessage
}
