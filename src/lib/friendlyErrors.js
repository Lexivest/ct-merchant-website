import { isNetworkOffline } from "./networkStatus"

const NETWORK_ERROR_PATTERN =
  /(failed to fetch|networkerror|network error|load failed|fetch resource|internet connection|offline|timeout|timed out|aborterror|operation was aborted)/i

export const ErrorCategory = {
  NETWORK: "network",
  AUTH: "auth",
  PERMISSION: "permission",
  VALIDATION: "validation",
  CONFLICT: "conflict",
  SERVER: "server",
  UNKNOWN: "unknown",
}

export const ErrorCode = {
  OFFLINE: "CTM-001",
  SESSION_EXPIRED: "CTM-002",
  PERMISSION_DENIED: "CTM-003",
  DUPLICATE_SHOP: "CTM-004",
  DUPLICATE_NAME: "CTM-005",
  DUPLICATE_CAC: "CTM-006",
  DUPLICATE_PHONE: "CTM-007",
  DUPLICATE_EMAIL: "CTM-008",
  DATABASE_SAVE_FAILED: "CTM-009",
  REQUEST_TIMEOUT: "CTM-010",
  RATE_LIMITED: "CTM-011",
  INTERNAL_SERVER_ERROR: "",
}

export function isNetworkError(error) {
  if (isNetworkOffline()) return true
  const rawMessage = String(error?.message || error || "").toLowerCase()
  return NETWORK_ERROR_PATTERN.test(rawMessage)
}

/**
 * Maps technical errors to user-friendly messages and metadata.
 * Inspired by Amazon's clear, actionable error patterns.
 */
export function getFriendlyError(error, fallback = "We encountered an unexpected issue. Please try again.") {
  const rawMessage = String(error?.message || error || "").trim()
  const lower = rawMessage.toLowerCase()

  const result = {
    message: fallback,
    category: ErrorCategory.UNKNOWN,
    code: ErrorCode.INTERNAL_SERVER_ERROR,
    retryable: true,
    action: "Please refresh the page or try again in a moment.",
  }

  if (!rawMessage) return result

  // --- NETWORK ERRORS ---
  if (isNetworkError(error)) {
    result.message = lower.includes("timed out") || lower.includes("timeout")
      ? "This request took too long to complete."
      : "Connectivity issue detected. We can't reach our servers right now."
    result.category = ErrorCategory.NETWORK
    result.code =
      lower.includes("timed out") || lower.includes("timeout")
        ? ErrorCode.REQUEST_TIMEOUT
        : ErrorCode.OFFLINE
    result.action =
      result.code === ErrorCode.REQUEST_TIMEOUT
        ? "Please wait a moment and try again."
        : "Check your internet connection or Wi-Fi settings and try again."
    return result
  }

  // --- AUTH ERRORS ---
  if (
    lower.includes("unauthorized") ||
    lower.includes("session expired") ||
    lower.includes("jwt expired") ||
    lower.includes("invalid refresh token") ||
    lower.includes("refresh token not found")
  ) {
    result.message = "Your session has ended. To protect your account, please sign in again."
    result.category = ErrorCategory.AUTH
    result.code = ErrorCode.SESSION_EXPIRED
    result.retryable = false
    result.action = "Sign in to continue accessing your dashboard."
    return result
  }

  // --- PERMISSION ERRORS ---
  if (
    lower.includes("permission denied") ||
    lower.includes("row-level security") ||
    lower.includes("insufficient_privileges") ||
    lower.includes("access denied")
  ) {
    result.message = "Access restricted. You don't have the required permissions for this action."
    result.category = ErrorCategory.PERMISSION
    result.code = ErrorCode.PERMISSION_DENIED
    result.retryable = false
    result.action = "If you believe this is an error, please contact your administrator."
    return result
  }

  if (lower.includes("rate limit") || lower.includes("too many requests")) {
    result.message = "Too many requests were sent in a short time."
    result.category = ErrorCategory.SERVER
    result.code = ErrorCode.RATE_LIMITED
    result.action = "Please wait a moment before trying again."
    return result
  }

  if (lower.includes("digitally approved") || lower.includes("digital approval")) {
    result.message = rawMessage
      .replace(/digitally approved/gi, "approved")
      .replace(/digital approval/gi, "application review")
      .replace(/^Shop must be approved/i, "Business application must be approved")
      .replace(/^Your shop must be approved/i, "Your business application must be approved")
    result.category = ErrorCategory.VALIDATION
    result.retryable = false
    result.action = "Wait for staff approval, then try this step again."
    return result
  }

  // --- CONFLICT / DUPLICATE ERRORS ---
  if (lower.includes("idx_shops_owner_id_unique")) {
    result.message = "A shop is already registered to this account."
    result.category = ErrorCategory.CONFLICT
    result.code = ErrorCode.DUPLICATE_SHOP
    result.retryable = false
    result.action = "Each account is limited to one shop listing."
    return result
  }

  if (lower.includes("shops_name_key") || lower.includes("shop name already exists")) {
    result.message = "This business name is already in use by another merchant."
    result.category = ErrorCategory.CONFLICT
    result.code = ErrorCode.DUPLICATE_NAME
    result.action = "Please choose a unique name for your shop."
    return result
  }

  if (lower.includes("shops_cac_number_key") || lower.includes("cac number already exists")) {
    result.message = "This registration number (RC/CAC) is already in our system."
    result.category = ErrorCategory.CONFLICT
    result.code = ErrorCode.DUPLICATE_CAC
    result.retryable = false
    result.action = "Verify your CAC number or contact support if you believe this is a mistake."
    return result
  }

  if (lower.includes("user already exists") || lower.includes("email already in use")) {
    result.message = "An account with this email address already exists."
    result.category = ErrorCategory.CONFLICT
    result.code = ErrorCode.DUPLICATE_EMAIL
    result.retryable = false
    result.action = "Try signing in or use a different email address to register."
    return result
  }

  // --- SERVER / DATABASE ERRORS ---
  if (lower.includes("database error saving new user")) {
    result.message = "We encountered a technical issue while setting up your profile."
    result.category = ErrorCategory.SERVER
    result.code = ErrorCode.DATABASE_SAVE_FAILED
    result.action = "We have been notified. Please try again in a few minutes."
    return result
  }

  // Fallback for simple short messages that are likely user-friendly enough
  if (rawMessage.length < 100 && !rawMessage.includes("|") && !rawMessage.includes("details:") && !rawMessage.includes("hint:")) {
    result.message = rawMessage
  }

  return result
}

// Keep the old function name for backward compatibility during transition
export function getFriendlyErrorMessage(error, fallback) {
  return getFriendlyError(error, fallback).message
}
