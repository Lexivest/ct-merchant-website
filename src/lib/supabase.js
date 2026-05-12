import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

const isMissingConfig = !SUPABASE_URL || !SUPABASE_ANON_KEY

if (isMissingConfig) {
  console.error("Critical Error: Supabase environment variables (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY) are missing.")
}

const memoryAuthStorage = new Map()
const AUTH_WINDOW_ID_KEY = "ctmerchant_auth_window_id"
const AUTH_WINDOW_NAME_PREFIX = "ctmerchant-auth-window:"
const AUTH_STORAGE_KEY_PREFIX = "ctmerchant-auth-"

function createWindowAuthId() {
  try {
    if (globalThis.crypto?.randomUUID) {
      return globalThis.crypto.randomUUID()
    }
  } catch {
    // Fall back below when Web Crypto is unavailable.
  }
  return `${Date.now()}_${Math.random().toString(36).slice(2, 12)}`
}

function readWindowNameAuthId() {
  try {
    if (typeof window === "undefined") return ""
    const value = String(window.name || "")
    if (!value.startsWith(AUTH_WINDOW_NAME_PREFIX)) return ""
    return value.slice(AUTH_WINDOW_NAME_PREFIX.length)
  } catch {
    return ""
  }
}

function writeWindowNameAuthId(windowId) {
  try {
    if (typeof window !== "undefined" && windowId) {
      window.name = `${AUTH_WINDOW_NAME_PREFIX}${windowId}`
    }
  } catch {
    // Ignore window.name failures.
  }
}

function getWindowAuthStorageKey() {
  const fallbackKey = "ctmerchant-auth-memory"

  try {
    if (typeof window !== "undefined" && window.sessionStorage) {
      let windowId = window.sessionStorage.getItem(AUTH_WINDOW_ID_KEY)
      if (!windowId) {
        windowId = readWindowNameAuthId() || createWindowAuthId()
        window.sessionStorage.setItem(AUTH_WINDOW_ID_KEY, windowId)
      }
      writeWindowNameAuthId(windowId)
      return `${AUTH_STORAGE_KEY_PREFIX}${windowId}`
    }
  } catch {
    // Some privacy modes can block Web Storage; use memory for this window.
  }

  if (!memoryAuthStorage.has(AUTH_WINDOW_ID_KEY)) {
    memoryAuthStorage.set(
      AUTH_WINDOW_ID_KEY,
      readWindowNameAuthId() || createWindowAuthId()
    )
  }
  const windowId = memoryAuthStorage.get(AUTH_WINDOW_ID_KEY) || fallbackKey
  writeWindowNameAuthId(windowId)
  return `${AUTH_STORAGE_KEY_PREFIX}${windowId}`
}

const authStorageKey = getWindowAuthStorageKey()
export const currentAuthStorageKey = authStorageKey

// Each window allocates its own auth storage key. When a window closes, its
// sessionStorage is wiped but the localStorage entry survives. Without
// cleanup these accumulate forever. Sweep keys with an expired session on
// startup. Errors are swallowed (storage may be blocked by privacy settings).
function sweepExpiredAuthStorageKeys() {
  try {
    if (typeof window === "undefined" || !window.localStorage) return
    const storage = window.localStorage
    const nowSeconds = Math.floor(Date.now() / 1000)
    const toRemove = []

    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i)
      if (!key || !key.startsWith(AUTH_STORAGE_KEY_PREFIX)) continue
      if (key === authStorageKey) continue

      try {
        const raw = storage.getItem(key)
        if (!raw) {
          toRemove.push(key)
          continue
        }
        const parsed = JSON.parse(raw)
        const expiresAt = parsed?.expires_at ?? parsed?.currentSession?.expires_at
        if (!expiresAt || Number(expiresAt) < nowSeconds) {
          toRemove.push(key)
        }
      } catch {
        toRemove.push(key)
      }
    }

    toRemove.forEach((key) => storage.removeItem(key))
  } catch {
    // Best-effort cleanup only
  }
}

sweepExpiredAuthStorageKeys()

const perWindowAuthStorage = {
  getItem(key) {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        const persistedValue = window.localStorage.getItem(key)
        if (persistedValue !== null) return persistedValue

        const sessionValue = window.sessionStorage?.getItem(key)
        if (sessionValue !== null && sessionValue !== undefined) {
          window.localStorage.setItem(key, sessionValue)
          return sessionValue
        }
      }
    } catch {
      // Some privacy modes can block Web Storage; use memory for this window.
    }
    return memoryAuthStorage.get(key) || null
  },
  setItem(key, value) {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(key, value)
        window.sessionStorage?.setItem(key, value)
        return
      }
    } catch {
      // Some privacy modes can block Web Storage; use memory for this window.
    }
    memoryAuthStorage.set(key, value)
  },
  removeItem(key) {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.removeItem(key)
        window.sessionStorage?.removeItem(key)
      }
    } catch {
      // Some privacy modes can block Web Storage; use memory for this window.
    }
    memoryAuthStorage.delete(key)
  },
}

// Create a proxy that throws a helpful error if any property is accessed 
// when the configuration is missing. This prevents the top-level crash.
const createMockSupabase = () => {
  return new Proxy({}, {
    get: (_, prop) => {
      if (prop === 'auth') {
        return new Proxy({}, {
          get: (_, authProp) => {
            if (authProp === 'onAuthStateChange') {
              return () => ({ data: { subscription: { unsubscribe: () => {} } } })
            }
            if (authProp === 'getSession') {
              return async () => ({ data: { session: null }, error: null })
            }
            return () => { throw new Error("Supabase is not configured. Please check your .env file.") }
          }
        })
      }
      return () => {
        throw new Error("Supabase is not configured. Please check your .env file.")
      }
    }
  })
}

export const supabase = isMissingConfig 
  ? createMockSupabase()
  : createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: authStorageKey,
        storage: perWindowAuthStorage,
      },
    })
