import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

const isMissingConfig = !SUPABASE_URL || !SUPABASE_ANON_KEY

if (isMissingConfig) {
  console.error("Critical Error: Supabase environment variables (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY) are missing.")
}

const memoryAuthStorage = new Map()

const perWindowAuthStorage = {
  getItem(key) {
    try {
      if (typeof window !== "undefined" && window.sessionStorage) {
        return window.sessionStorage.getItem(key)
      }
    } catch {
      // Some privacy modes can block Web Storage; use memory for this window.
    }
    return memoryAuthStorage.get(key) || null
  },
  setItem(key, value) {
    try {
      if (typeof window !== "undefined" && window.sessionStorage) {
        window.sessionStorage.setItem(key, value)
        return
      }
    } catch {
      // Some privacy modes can block Web Storage; use memory for this window.
    }
    memoryAuthStorage.set(key, value)
  },
  removeItem(key) {
    try {
      if (typeof window !== "undefined" && window.sessionStorage) {
        window.sessionStorage.removeItem(key)
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
        storage: perWindowAuthStorage,
      },
    })
