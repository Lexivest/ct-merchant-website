const REPO_SEARCH_INTENT_PREFIX = "ctm_repo_search_intent:"
const REPO_SEARCH_INTENT_TTL_MS = 10 * 60 * 1000

function safeSessionStorage() {
  try {
    if (typeof window !== "undefined" && window.sessionStorage) {
      return window.sessionStorage
    }
  } catch {
    // Storage can be blocked in strict browser privacy modes.
  }
  return null
}

function normalizeRepoIntentId(value) {
  return String(value || "").trim().toUpperCase()
}

function createToken() {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  } catch {
    // Fall back below when Web Crypto is unavailable.
  }
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`
}

export function createRepoSearchIntent(repoId) {
  const storage = safeSessionStorage()
  const normalizedRepoId = normalizeRepoIntentId(repoId)
  if (!storage || !normalizedRepoId) return ""

  const token = createToken()
  const payload = {
    repoId: normalizedRepoId,
    createdAt: Date.now(),
  }

  try {
    storage.setItem(`${REPO_SEARCH_INTENT_PREFIX}${token}`, JSON.stringify(payload))
    return token
  } catch {
    return ""
  }
}

export function hasValidRepoSearchIntent(token, repoId) {
  const storage = safeSessionStorage()
  const normalizedRepoId = normalizeRepoIntentId(repoId)
  if (!storage || !token || !normalizedRepoId) return false

  try {
    const storageKey = `${REPO_SEARCH_INTENT_PREFIX}${token}`
    const payload = JSON.parse(storage.getItem(storageKey) || "null")
    const createdAt = Number(payload?.createdAt || 0)
    const expired = !createdAt || Date.now() - createdAt > REPO_SEARCH_INTENT_TTL_MS

    if (expired) {
      storage.removeItem(storageKey)
      return false
    }

    return normalizeRepoIntentId(payload?.repoId) === normalizedRepoId
  } catch {
    return false
  }
}
