import { useEffect, useState } from "react"
import { supabase } from "../lib/supabase"
import {
  getNetworkStatusSnapshot,
  isNetworkOffline,
  subscribeNetworkStatus,
} from "../lib/networkStatus"
import {
  fetchProfileByUserId,
  getSession,
  isProfileSuspended,
  stampProfileFootprint,
} from "../lib/auth"
import { clearCachedFetchStore } from "./useCachedFetch"

const PROFILE_CACHE_KEY_PREFIX = "ctmerchant_profile_cache_"
const PROFILE_CACHE_ACTIVE_USER_KEY = "ctmerchant_profile_cache_active_user"
const AUTH_SNAPSHOT_KEY = "ctmerchant_auth_snapshot_v1"

// 1. GLOBAL MEMORY CACHE
// This preserves the auth state across page navigations.
// It completely eliminates the "loading spinner flash" when hitting the back button.
let globalAuthMemory = {
  isResolved: false,
  session: null,
  user: null,
  profile: null,
  suspended: false,
  profileLoaded: false,
}

const footprintStampedUsers = new Set()

function stampSessionFootprintOnce(userId) {
  if (!userId || footprintStampedUsers.has(userId)) return

  footprintStampedUsers.add(userId)
  void stampProfileFootprint(userId).then((success) => {
    if (!success) footprintStampedUsers.delete(userId)
  })
}

function getIsOffline() {
  return isNetworkOffline()
}

function getProfileCacheKey(userId) {
  return `${PROFILE_CACHE_KEY_PREFIX}${userId}`
}

function readCachedProfile(userId) {
  if (!userId) return null
  try {
    if (typeof window !== "undefined") {
      const storage = window.localStorage
      if (storage) {
        const raw = storage.getItem(getProfileCacheKey(userId))
        return raw ? JSON.parse(raw) : null
      }
    }
  } catch (error) {
    console.warn("Storage read blocked:", error.message)
  }
  return null
}

function getWindowSessionStorage() {
  try {
    if (typeof window !== "undefined" && window.sessionStorage) {
      return window.sessionStorage
    }
  } catch {
    // Session storage may be blocked by strict privacy settings.
  }
  return null
}

function writeCachedProfile(userId, profile) {
  if (!userId || !profile) return
  try {
    if (typeof window !== "undefined") {
      const storage = window.localStorage
      if (storage) {
        storage.setItem(getProfileCacheKey(userId), JSON.stringify(profile))
      }
    }
  } catch (error) {
    console.warn("Storage write blocked:", error.message)
  }

  try {
    getWindowSessionStorage()?.setItem(PROFILE_CACHE_ACTIVE_USER_KEY, userId)
  } catch (error) {
    console.warn("Session storage write blocked:", error.message)
  }
}

function clearCachedProfile(userId) {
  try {
    if (typeof window !== "undefined") {
      const storage = window.localStorage
      if (storage) {
        if (userId) {
          storage.removeItem(getProfileCacheKey(userId))
        }

        if (!userId) {
          const keysToRemove = []
          for (let i = 0; i < storage.length; i++) {
            const key = storage.key(i)
            if (key && key.startsWith(PROFILE_CACHE_KEY_PREFIX)) {
              keysToRemove.push(key)
            }
          }
          keysToRemove.forEach((key) => storage.removeItem(key))
        }
      }
    }
  } catch (error) {
    console.warn("Storage clear blocked:", error.message)
  }

  try {
    const sessionStorage = getWindowSessionStorage()
    if (sessionStorage) {
      const activeUserId = sessionStorage.getItem(PROFILE_CACHE_ACTIVE_USER_KEY)
      if (!userId || activeUserId === userId) {
        sessionStorage.removeItem(PROFILE_CACHE_ACTIVE_USER_KEY)
      }
    }
  } catch (error) {
    console.warn("Session storage clear blocked:", error.message)
  }
}

function readAuthSnapshot() {
  try {
    const storage = getWindowSessionStorage()
    if (storage) {
      const raw = storage.getItem(AUTH_SNAPSHOT_KEY)
      if (!raw) return null
      const parsed = JSON.parse(raw)
      if (!parsed || !parsed.user?.id) return null
      return parsed
    }
  } catch (error) {
    console.warn("Auth snapshot read blocked:", error.message)
  }
  return null
}

function writeAuthSnapshot(snapshot) {
  if (!snapshot?.user?.id) return
  try {
    const storage = getWindowSessionStorage()
    if (storage) {
      const payload = {
        session: snapshot.session || null,
        user: snapshot.user,
        profile: snapshot.profile || null,
        suspended: Boolean(snapshot.suspended),
        updatedAt: Date.now(),
      }
      storage.setItem(AUTH_SNAPSHOT_KEY, JSON.stringify(payload))
    }
  } catch (error) {
    console.warn("Auth snapshot write blocked:", error.message)
  }
}

function clearAuthSnapshot() {
  try {
    const storage = getWindowSessionStorage()
    if (storage) {
      storage.removeItem(AUTH_SNAPSHOT_KEY)
    }
  } catch (error) {
    console.warn("Auth snapshot clear blocked:", error.message)
  }
}

function getSnapshotWithCachedProfile() {
  const snapshot = readAuthSnapshot()
  if (!snapshot?.user?.id) return null
  const cachedProfile = readCachedProfile(snapshot.user.id)
  return {
    ...snapshot,
    profile: cachedProfile || snapshot.profile || null,
  }
}

export function primeAuthSessionState({
  session = null,
  user = null,
  profile = null,
  suspended = false,
  profileLoaded = true,
}) {
  if (!user?.id) return

  if (profile) {
    writeCachedProfile(user.id, profile)
  }

  writeAuthSnapshot({
    session,
    user,
    profile,
    suspended: suspended || isProfileSuspended(profile),
    profileLoaded,
  })

  globalAuthMemory = {
    isResolved: true,
    session,
    user,
    profile,
    suspended: suspended || isProfileSuspended(profile),
    profileLoaded,
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
        profileLoaded: globalAuthMemory.profileLoaded,
        error: "",
        isOffline: getIsOffline(),
      }
    }

    const authSnapshot = getSnapshotWithCachedProfile()
    
    let activeCachedUserId = authSnapshot?.user?.id || null
    if (!activeCachedUserId) {
      try {
        activeCachedUserId = getWindowSessionStorage()?.getItem(PROFILE_CACHE_ACTIVE_USER_KEY) || null
      } catch {
        // ignore
      }
    }

    const cachedProfile =
      authSnapshot?.profile || readCachedProfile(activeCachedUserId)
    return {
      loading: true,
      session: authSnapshot?.session || null,
      user: authSnapshot?.user || null,
      profile: cachedProfile || null,
      suspended:
        isProfileSuspended(cachedProfile) || Boolean(authSnapshot?.suspended),
      profileLoaded: Boolean(cachedProfile),
      error: "",
      isOffline: getIsOffline(),
    }
  })

  // Helper to keep React state and Global memory perfectly in sync
  function syncState(updates) {
    globalAuthMemory = {
      ...globalAuthMemory,
      session: updates.session !== undefined ? updates.session : globalAuthMemory.session,
      user: updates.user !== undefined ? updates.user : globalAuthMemory.user,
      profile: updates.profile !== undefined ? updates.profile : globalAuthMemory.profile,
      suspended: updates.suspended !== undefined ? updates.suspended : globalAuthMemory.suspended,
      profileLoaded:
        updates.profileLoaded !== undefined
          ? updates.profileLoaded
          : globalAuthMemory.profileLoaded,
      isResolved: updates.loading === false ? true : globalAuthMemory.isResolved,
    }

    if (updates.loading === false) {
      const finalUser = updates.user !== undefined ? updates.user : globalAuthMemory.user
      if (finalUser?.id) {
        const finalSession =
          updates.session !== undefined ? updates.session : globalAuthMemory.session
        const finalProfile =
          updates.profile !== undefined ? updates.profile : globalAuthMemory.profile
        const finalSuspended =
          updates.suspended !== undefined
            ? updates.suspended
            : globalAuthMemory.suspended

        writeAuthSnapshot({
          session: finalSession,
          user: finalUser,
          profile: finalProfile,
          suspended: finalSuspended,
          profileLoaded:
            updates.profileLoaded !== undefined
              ? updates.profileLoaded
              : globalAuthMemory.profileLoaded,
        })
      }
    }

    setState((prev) => ({ ...prev, ...updates }))
  }

  useEffect(() => {
    let mounted = true

    async function load(options = {}) {
      const { forceNetwork = false } = options
      const isOfflineNow = getIsOffline()
      const snapshot = getSnapshotWithCachedProfile()

      try {
        const session = await getSession()
        const user = session?.user || null

        if (!mounted) return

        if (!user) {
          clearCachedProfile()
          clearCachedFetchStore()
          clearAuthSnapshot()
          globalAuthMemory = {
            isResolved: true,
            session: null,
            user: null,
            profile: null,
            suspended: false,
          }
          syncState({
            loading: false,
            session: null,
            user: null,
            profile: null,
            suspended: false,
            profileLoaded: false,
            error: "",
          })
          return
        }

        const previousUserId = globalAuthMemory.user?.id || snapshot?.user?.id || null
        if (previousUserId && previousUserId !== user.id) {
          clearCachedProfile(previousUserId)
          clearCachedFetchStore()
          clearAuthSnapshot()
        }

        const cachedProfileForUser =
          readCachedProfile(user.id) ||
          (snapshot?.user?.id === user.id ? snapshot.profile : null)

        // Unblock UI fast with cached profile (if any), then refresh in background.
        syncState({
          loading: false,
          session,
          user,
          profile: cachedProfileForUser || null,
          suspended: isProfileSuspended(cachedProfileForUser),
          profileLoaded: Boolean(cachedProfileForUser),
          error: "",
        })

        if (isOfflineNow && !forceNetwork) return
        stampSessionFootprintOnce(user.id)

        try {
          let profile = await fetchProfileByUserId(user.id)
          
          if (!profile) {
            await new Promise((resolve) => setTimeout(resolve, 500))
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
            profile: profile || cachedProfileForUser || null,
            suspended: isProfileSuspended(profile || cachedProfileForUser),
            profileLoaded: true,
            error: "",
          })
        } catch {
          if (!mounted) return
          const fallbackProfile = readCachedProfile(user.id) || cachedProfileForUser
          syncState({
            loading: false,
            session,
            user,
            profile: fallbackProfile || null,
            suspended: isProfileSuspended(fallbackProfile),
            profileLoaded: true,
            error: "",
          })
        }
      } catch {
        if (!mounted) return
        const offlineSnapshot = getSnapshotWithCachedProfile()
        const memUser = globalAuthMemory.user

        if (offlineSnapshot?.user || memUser) {
          const fallbackSession = offlineSnapshot?.session || globalAuthMemory.session || null
          const fallbackProfile = offlineSnapshot?.profile || globalAuthMemory.profile || null

          syncState({
            loading: false,
            session: fallbackSession,
            user: offlineSnapshot?.user || memUser,
            profile: fallbackProfile,
            suspended:
              isProfileSuspended(fallbackProfile) || Boolean(offlineSnapshot?.suspended || globalAuthMemory.suspended),
            profileLoaded: Boolean(fallbackProfile),
            error: "",
          })
          return
        }

        syncState({
          loading: false,
          session: null,
          user: null,
          profile: null,
          suspended: false,
          profileLoaded: false,
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
        clearAuthSnapshot()
        globalAuthMemory = {
          isResolved: true,
          session: null,
          user: null,
          profile: null,
          suspended: false,
          profileLoaded: false,
        }
        syncState({
          loading: false,
          session: null,
          user: null,
          profile: null,
          suspended: false,
          profileLoaded: false,
          error: "",
        })
        return
      }

      const cachedProfile = readCachedProfile(session.user.id)
      syncState({
        loading: false,
        session,
        user: session.user,
        profile: cachedProfile || null,
        suspended: isProfileSuspended(cachedProfile),
        profileLoaded: Boolean(cachedProfile),
        error: "",
      })

      load({ forceNetwork: true })
    })

    const handleNetworkStatusChange = () => {
      if (!mounted) return

      const { isOffline } = getNetworkStatusSnapshot()
      syncState({ isOffline })

      if (!isOffline) {
        load({ forceNetwork: true })
      }
    }

    const unsubscribeNetworkStatus = subscribeNetworkStatus(handleNetworkStatusChange)

    return () => {
      mounted = false
      subscription.unsubscribe()
      unsubscribeNetworkStatus()
    }
  }, [])

  return state
}

export default useAuthSession
