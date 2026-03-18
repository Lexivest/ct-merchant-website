import { useEffect, useState } from "react"
import { supabase } from "../lib/supabase"
import {
  fetchProfileByUserId,
  getSession,
  isProfileSuspended,
} from "../lib/auth"

const PROFILE_CACHE_KEY = "ctmerchant_profile_cache"

// 1. GLOBAL MEMORY CACHE
// This preserves the auth state across page navigations.
// It completely eliminates the "loading spinner flash" when hitting the back button.
let globalAuthMemory = {
  isResolved: false,
  session: null,
  user: null,
  profile: null,
  suspended: false,
}

function readCachedProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeCachedProfile(profile) {
  try {
    localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile))
  } catch {
    // ignore
  }
}

function clearCachedProfile() {
  try {
    localStorage.removeItem(PROFILE_CACHE_KEY)
  } catch {
    // ignore
  }
}

function useAuthSession() {
  const [state, setState] = useState(() => {
    // 2. SYNCHRONOUS MEMORY READ
    // If the memory is warm (user is navigating back), return it instantly to bypass all loaders.
    if (globalAuthMemory.isResolved) {
      return {
        loading: false,
        session: globalAuthMemory.session,
        user: globalAuthMemory.user,
        profile: globalAuthMemory.profile,
        suspended: globalAuthMemory.suspended,
        error: "",
        isOffline: !navigator.onLine,
      }
    }

    const cachedProfile = readCachedProfile()
    return {
      loading: true,
      session: null,
      user: null,
      profile: cachedProfile,
      suspended: isProfileSuspended(cachedProfile),
      error: "",
      isOffline: !navigator.onLine,
    }
  })

  // Helper to keep React state and Global memory perfectly in sync
  function syncState(updates) {
    if (updates.loading === false) {
      globalAuthMemory = {
        ...globalAuthMemory,
        isResolved: true,
        session: updates.session !== undefined ? updates.session : globalAuthMemory.session,
        user: updates.user !== undefined ? updates.user : globalAuthMemory.user,
        profile: updates.profile !== undefined ? updates.profile : globalAuthMemory.profile,
        suspended: updates.suspended !== undefined ? updates.suspended : globalAuthMemory.suspended,
      }
    }
    setState((prev) => ({ ...prev, ...updates }))
  }

  useEffect(() => {
    let mounted = true

    async function load() {
      try {
        const session = await getSession()
        const user = session?.user || null

        if (!mounted) return

        if (!user) {
          clearCachedProfile()
          globalAuthMemory = { isResolved: true, session: null, user: null, profile: null, suspended: false }
          syncState({
            loading: false,
            session: null,
            user: null,
            profile: null,
            suspended: false,
            error: "",
          })
          return
        }

        try {
          let profile = await fetchProfileByUserId(user.id)
          
          if (!profile) {
            await new Promise((resolve) => setTimeout(resolve, 800))
            profile = await fetchProfileByUserId(user.id)
          }

          if (!mounted) return

          if (profile) {
            writeCachedProfile(profile)
          }

          syncState({
            loading: false,
            session,
            user,
            profile: profile || null,
            suspended: isProfileSuspended(profile),
            error: "",
          })
        } catch (profileError) {
          if (!mounted) return
          const cachedProfile = readCachedProfile()
          syncState({
            loading: false,
            session,
            user,
            profile: cachedProfile,
            suspended: isProfileSuspended(cachedProfile),
            error: "",
          })
        }
      } catch (error) {
        if (!mounted) return
        const cachedProfile = readCachedProfile()
        syncState({
          loading: false,
          profile: cachedProfile,
          suspended: isProfileSuspended(cachedProfile),
          error: "",
        })
      }
    }

    // Always fetch in the background to ensure session hasn't expired
    load()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return

      if (event === "SIGNED_OUT" || !session?.user) {
        clearCachedProfile()
        globalAuthMemory = { isResolved: true, session: null, user: null, profile: null, suspended: false }
        syncState({
          loading: false,
          session: null,
          user: null,
          profile: null,
          suspended: false,
          error: "",
        })
        return
      }

      load()
    })

    const handleOnline = () => {
      if (!mounted) return
      syncState({ isOffline: false })
      load()
    }

    const handleOffline = () => {
      if (!mounted) return
      syncState({ isOffline: true })
    }

    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)

    return () => {
      mounted = false
      subscription.unsubscribe()
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [])

  return state
}

export default useAuthSession