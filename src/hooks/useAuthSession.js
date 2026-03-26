import { useEffect, useState } from "react"
import { supabase } from "../lib/supabase"
import {
  fetchProfileByUserId,
  getSession,
  isProfileSuspended,
} from "../lib/auth"
import { clearCachedFetchStore } from "./useCachedFetch"

const PROFILE_CACHE_KEY_PREFIX = "ctmerchant_profile_cache_"
const PROFILE_CACHE_ACTIVE_USER_KEY = "ctmerchant_profile_cache_active_user"

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

function getProfileCacheKey(userId) {
  return `${PROFILE_CACHE_KEY_PREFIX}${userId}`
}

function readCachedProfile(userId) {
  if (!userId) return null
  try {
    const raw = localStorage.getItem(getProfileCacheKey(userId))
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeCachedProfile(userId, profile) {
  if (!userId || !profile) return
  try {
    localStorage.setItem(getProfileCacheKey(userId), JSON.stringify(profile))
    localStorage.setItem(PROFILE_CACHE_ACTIVE_USER_KEY, userId)
  } catch {
    // ignore
  }
}

function clearCachedProfile(userId) {
  try {
    if (userId) {
      localStorage.removeItem(getProfileCacheKey(userId))
      const activeUserId = localStorage.getItem(PROFILE_CACHE_ACTIVE_USER_KEY)
      if (activeUserId === userId) {
        localStorage.removeItem(PROFILE_CACHE_ACTIVE_USER_KEY)
      }
      return
    }

    const keysToRemove = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith(PROFILE_CACHE_KEY_PREFIX)) {
        keysToRemove.push(key)
      }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key))
    localStorage.removeItem(PROFILE_CACHE_ACTIVE_USER_KEY)
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

    const activeCachedUserId = localStorage.getItem(PROFILE_CACHE_ACTIVE_USER_KEY)
    const cachedProfile = readCachedProfile(activeCachedUserId)
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
          clearCachedFetchStore()
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

        const previousUserId = globalAuthMemory.user?.id || null
        if (previousUserId && previousUserId !== user.id) {
          clearCachedProfile(previousUserId)
          clearCachedFetchStore()
        }

        const cachedProfileForUser = readCachedProfile(user.id)

        try {
          let profile = await fetchProfileByUserId(user.id)
          
          if (!profile) {
            await new Promise((resolve) => setTimeout(resolve, 800))
            profile = await fetchProfileByUserId(user.id)
          }

          if (!mounted) return

          if (profile) {
            writeCachedProfile(user.id, profile)
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
          const cachedProfile = cachedProfileForUser
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
        const activeCachedUserId = localStorage.getItem(PROFILE_CACHE_ACTIVE_USER_KEY)
        const cachedProfile = readCachedProfile(activeCachedUserId)
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
        clearCachedFetchStore()
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
