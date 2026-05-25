import { useEffect, useRef, useState } from "react"
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
  consumeIntentionalSignOut,
  LOGOUT_SIGNAL_KEY,
} from "../lib/auth"
import { clearCachedFetchStore } from "./useCachedFetch"

function isQuotaError(error) {
  const name = String(error?.name || "")
  return (
    name === "QuotaExceededError" ||
    name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    String(error?.code || "") === "22"
  )
}

// Evicts session query-cache entries from localStorage to recover quota space.
function evictQueryCacheFromLocalStorage() {
  try {
    const storage = window.localStorage
    if (!storage) return
    const toRemove = []
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i)
      if (key && key.startsWith("ctm_cached_fetch:")) toRemove.push(key)
    }
    toRemove.forEach((key) => storage.removeItem(key))
  } catch {
    // Best effort
  }
}

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
  primedAt: 0,
}

// Skip the background network refetch in load() when a fresh prime arrived
// from the login flow this many ms ago. Eliminates the redundant duplicate
// fetch right after openDashboardWithTransition primes the cache.
const PRIME_FRESHNESS_WINDOW_MS = 10 * 1000

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
    if (isQuotaError(error)) {
      // Free up query-cache space and try once more before giving up.
      evictQueryCacheFromLocalStorage()
      try {
        window.localStorage?.setItem(getProfileCacheKey(userId), JSON.stringify(profile))
      } catch {
        // In-memory state is still intact — degrade silently.
      }
    } else {
      console.warn("Storage write blocked:", error.message)
    }
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
    if (!isQuotaError(error)) {
      console.warn("Auth snapshot write blocked:", error.message)
    }
    // Session storage quota errors are non-critical — in-memory state is intact.
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

export function clearAuthMemory() {
  globalAuthMemory = {
    isResolved: true,
    session: null,
    user: null,
    profile: null,
    suspended: false,
    profileLoaded: false,
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
    primedAt: Date.now(),
  }
}

const SUSPENSION_RECHECK_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

function useAuthSession() {
  const lastNetworkFetchAt = useRef(0)
  // Holds the timer ID for the debounced SIGNED_OUT grace period.
  // Cleared immediately whenever a real authenticated session event arrives.
  const pendingSignOutTimerRef = useRef(null)
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

    // If we have both a cached session user AND a cached profile, start with
    // loading: false so protected routes render immediately from cache.
    // The background load() still runs to validate the JWT — if the session
    // has expired it will clear state and redirect via onAuthStateChange.
    // This is the same optimistic pattern large SPAs use (show cached content
    // instantly, correct silently if the server disagrees).
    const hasCachedSession = Boolean(authSnapshot?.user?.id && cachedProfile)

    return {
      loading: !hasCachedSession,
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
        // Race the session fetch against a 6-second safety timeout.
        // If Supabase is unreachable, we resolve with null rather than
        // spinning forever — the offline/cached fallback below takes over.
        const session = await Promise.race([
          getSession(),
          new Promise((resolve) => setTimeout(() => resolve(null), 6000)),
        ])
        const user = session?.user || null

        if (!mounted) return

        if (!user) {
          // getSession() returned null. Two possible causes:
          //   (a) The session genuinely expired / was revoked.
          //   (b) Our 6 s safety timeout fired first on a slow/flaky connection.
          //
          // For case (b) we must NOT clear auth state immediately — doing so
          // triggers the dashboard → home → login redirect loop the user sees on
          // a poor network. Instead, preserve the cached session and rely on
          // onAuthStateChange to deliver the authoritative SIGNED_OUT event if
          // the session is truly gone. Only clear when we are provably offline
          // (getSession() would always fail) or when there was no cached session
          // to begin with (user was never logged in this browser).
          const hadPreviousSession = Boolean(globalAuthMemory.user?.id)

          if (hadPreviousSession && !isOfflineNow) {
            // Likely a timeout on a poor network — keep current cached state.
            // onAuthStateChange will fire SIGNED_OUT when the session is truly gone.
            return
          }

          // No prior session, or we know we're offline — safe to clear.
          clearCachedProfile()
          clearAuthSnapshot()
          if (hadPreviousSession) {
            clearCachedFetchStore()
          }
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

        // If the auth flow just primed us with a fresh profile (within the
        // freshness window), skip the duplicate background refetch. forceNetwork
        // bypasses this — used by visibility-change re-checks and explicit refreshes.
        const wasRecentlyPrimed =
          cachedProfileForUser &&
          globalAuthMemory.primedAt > 0 &&
          Date.now() - globalAuthMemory.primedAt < PRIME_FRESHNESS_WINDOW_MS
        if (wasRecentlyPrimed && !forceNetwork) {
          stampSessionFootprintOnce(user.id)
          return
        }

        stampSessionFootprintOnce(user.id)

        try {
          let profile = await fetchProfileByUserId(user.id)

          if (!profile) {
            await new Promise((resolve) => setTimeout(resolve, 500))
            profile = await fetchProfileByUserId(user.id)
          }

          if (!mounted) return

          lastNetworkFetchAt.current = Date.now()

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

    // Applies a clean sign-out: wipes caches, resets global memory, and pushes
    // null state to React. Called either immediately (intentional logout) or
    // after the debounce grace period (network-induced SIGNED_OUT confirmed).
    function applySignOut(hadSession, isBySignedOutEvent) {
      clearCachedProfile()
      clearAuthSnapshot()
      // Only wipe the public-page fetch cache when the user was previously
      // authenticated or the event was an explicit SIGNED_OUT.
      if (isBySignedOutEvent || hadSession) {
        clearCachedFetchStore()
      }
      globalAuthMemory = {
        isResolved: true,
        session: null,
        user: null,
        profile: null,
        suspended: false,
        profileLoaded: false,
      }
      if (mounted) {
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

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return

      // Any real authenticated event cancels a pending debounced sign-out.
      if (session?.user && pendingSignOutTimerRef.current) {
        clearTimeout(pendingSignOutTimerRef.current)
        pendingSignOutTimerRef.current = null
      }

      if (event === "SIGNED_OUT" || !session?.user) {
        const isIntentional = consumeIntentionalSignOut()
        const hadSession = Boolean(globalAuthMemory.user?.id)
        const isBySignedOutEvent = event === "SIGNED_OUT"

        // Network-induced SIGNED_OUT (e.g. JWT refresh failure on a poor
        // connection): instead of immediately clearing auth and bouncing the
        // user back to the home screen, wait 4 s then re-check the session.
        //
        // If the token refresh succeeded within that window the debounce timer
        // gets cancelled above (by the TOKEN_REFRESHED / SIGNED_IN event that
        // arrives with a real user). If after 4 s the session is still gone, we
        // apply the sign-out for real.
        //
        // Skip the grace period for intentional logouts (signOutUser() sets the
        // flag), for the offline case (no point waiting — there's no network),
        // and for visitors who were never logged in.
        if (!isIntentional && hadSession && !getIsOffline()) {
          if (pendingSignOutTimerRef.current) clearTimeout(pendingSignOutTimerRef.current)
          pendingSignOutTimerRef.current = setTimeout(() => {
            if (!mounted) return
            pendingSignOutTimerRef.current = null

            Promise.race([
              getSession(),
              new Promise((resolve) => setTimeout(() => resolve(null), 4000)),
            ]).then((verifiedSession) => {
              if (!mounted) return
              if (verifiedSession?.user) {
                // Session recovered — SIGNED_OUT was a transient network glitch.
                const cachedProfile = readCachedProfile(verifiedSession.user.id)
                syncState({
                  loading: false,
                  session: verifiedSession,
                  user: verifiedSession.user,
                  profile: cachedProfile || globalAuthMemory.profile || null,
                  suspended: isProfileSuspended(cachedProfile || globalAuthMemory.profile),
                  profileLoaded: Boolean(cachedProfile || globalAuthMemory.profile),
                  error: "",
                })
                return
              }
              // Session is still gone after grace period — apply sign-out for real.
              applySignOut(hadSession, isBySignedOutEvent)
            }).catch(() => {
              if (mounted) applySignOut(hadSession, isBySignedOutEvent)
            })
          }, 4000)
          return
        }

        // Intentional logout, offline, or no previous session — clear immediately.
        applySignOut(hadSession, isBySignedOutEvent)
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

      // TOKEN_REFRESHED only rotates the session JWT — profile data is unchanged.
      // Skip the network refetch to save one round-trip per hour-ish per session.
      if (event === "TOKEN_REFRESHED") return

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

    // Suspension re-check: when the user returns to this tab after being away
    // for SUSPENSION_RECHECK_INTERVAL_MS or longer, re-fetch the profile to
    // catch suspension changes that happened while the tab was in the background.
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible" || !mounted) return
      if (Date.now() - lastNetworkFetchAt.current < SUSPENSION_RECHECK_INTERVAL_MS) return
      load({ forceNetwork: true })
    }

    // Cross-tab logout: when another tab calls signOutUser() it writes the
    // LOGOUT_SIGNAL_KEY to localStorage, which fires this storage event here.
    const handleStorageLogout = (event) => {
      if (event.key !== LOGOUT_SIGNAL_KEY || !event.newValue) return
      if (!mounted) return

      // A cross-tab explicit logout overrides any pending debounced sign-out.
      if (pendingSignOutTimerRef.current) {
        clearTimeout(pendingSignOutTimerRef.current)
        pendingSignOutTimerRef.current = null
      }

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
    }

    const unsubscribeNetworkStatus = subscribeNetworkStatus(handleNetworkStatusChange)
    window.addEventListener("storage", handleStorageLogout)
    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      mounted = false
      subscription.unsubscribe()
      if (pendingSignOutTimerRef.current) {
        clearTimeout(pendingSignOutTimerRef.current)
        pendingSignOutTimerRef.current = null
      }
      unsubscribeNetworkStatus()
      window.removeEventListener("storage", handleStorageLogout)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [])

  return state
}

export default useAuthSession
