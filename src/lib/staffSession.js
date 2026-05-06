export const STAFF_SESSION_TIMEOUT_MS = 20 * 60 * 1000

const STAFF_SESSION_KEY = "ctmerchant_staff_session_v1"

const fallbackStaffSessionStore = {
  value: null,
}

let staffPortalMemory = {
  isResolved: false,
  authUser: null,
  staffData: null,
}

function now() {
  return Date.now()
}

function getSessionStorage() {
  try {
    if (typeof window !== "undefined" && window.sessionStorage) {
      return window.sessionStorage
    }
  } catch {
    // Some privacy modes block Web Storage; fall back to memory for this tab.
  }
  return null
}

function readStaffSession() {
  try {
    const storage = getSessionStorage()
    const raw = storage?.getItem(STAFF_SESSION_KEY) || fallbackStaffSessionStore.value
    if (!raw) return null
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw
    if (!parsed?.userId || !Number(parsed.expiresAt)) return null
    return parsed
  } catch {
    return null
  }
}

function writeStaffSession(meta) {
  fallbackStaffSessionStore.value = meta

  try {
    getSessionStorage()?.setItem(STAFF_SESSION_KEY, JSON.stringify(meta))
  } catch {
    // Memory fallback above is enough for this browser tab.
  }
}

export function clearStaffSessionState() {
  fallbackStaffSessionStore.value = null
  staffPortalMemory = {
    isResolved: false,
    authUser: null,
    staffData: null,
  }

  try {
    getSessionStorage()?.removeItem(STAFF_SESSION_KEY)
  } catch {
    // Best effort.
  }
}

export function startStaffSession(userId) {
  if (!userId) return null
  const startedAt = now()
  const meta = {
    userId,
    startedAt,
    lastActivityAt: startedAt,
    expiresAt: startedAt + STAFF_SESSION_TIMEOUT_MS,
  }
  writeStaffSession(meta)
  return meta
}

export function refreshStaffSessionActivity(userId) {
  const current = readStaffSession()
  if (!current || current.userId !== userId || current.expiresAt <= now()) {
    return null
  }

  const refreshedAt = now()
  const meta = {
    ...current,
    lastActivityAt: refreshedAt,
    expiresAt: refreshedAt + STAFF_SESSION_TIMEOUT_MS,
  }
  writeStaffSession(meta)
  return meta
}

export function getStaffSessionRemainingMs(userId = null) {
  const current = readStaffSession()
  if (!current) return 0
  if (userId && current.userId !== userId) return 0
  return Math.max(0, Number(current.expiresAt || 0) - now())
}

export function hasActiveStaffSession(userId = null) {
  return getStaffSessionRemainingMs(userId) > 0
}

export function primeStaffPortalMemory(authUser, staffData) {
  if (!authUser?.id || !staffData) return

  staffPortalMemory = {
    isResolved: true,
    authUser,
    staffData,
  }
}

export function readStaffPortalMemory() {
  if (
    staffPortalMemory.isResolved &&
    staffPortalMemory.authUser?.id &&
    hasActiveStaffSession(staffPortalMemory.authUser.id)
  ) {
    return staffPortalMemory
  }

  staffPortalMemory = {
    isResolved: false,
    authUser: null,
    staffData: null,
  }
  return staffPortalMemory
}
