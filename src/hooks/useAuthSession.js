import { useEffect, useState } from "react"
import { supabase } from "../lib/supabase"
import {
  fetchProfileByUserId,
  getSession,
  isProfileComplete,
  isProfileSuspended,
} from "../lib/auth"

const PROFILE_CACHE_KEY = "ctmerchant_profile_cache"

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
    // ignore cache write failure
  }
}

function clearCachedProfile() {
  try {
    localStorage.removeItem(PROFILE_CACHE_KEY)
  } catch {
    // ignore cache clear failure
  }
}

function useAuthSession() {
  const [state, setState] = useState({
    loading: true,
    authResolved: false,
    session: null,
    user: null,
    profile: readCachedProfile(),
    profileComplete: false,
    suspended: false,
    isOffline: !navigator.onLine,
    error: "",
  })

  useEffect(() => {
    let mounted = true

    async function load() {
      const offline = !navigator.onLine

      try {
        const session = await getSession()
        const user = session?.user || null

        if (!mounted) return

        if (!user) {
          clearCachedProfile()

          setState({
            loading: false,
            authResolved: true,
            session: null,
            user: null,
            profile: null,
            profileComplete: false,
            suspended: false,
            isOffline: offline,
            error: "",
          })
          return
        }

        setState((prev) => ({
          ...prev,
          loading: true,
          authResolved: true,
          session,
          user,
          isOffline: offline,
          error: "",
        }))

        try {
          const profile = await fetchProfileByUserId(user.id)

          if (!mounted) return

          if (profile) {
            writeCachedProfile(profile)
          }

          setState({
            loading: false,
            authResolved: true,
            session,
            user,
            profile: profile || null,
            profileComplete: isProfileComplete(profile),
            suspended: isProfileSuspended(profile),
            isOffline: !navigator.onLine,
            error: "",
          })
        } catch (profileError) {
          if (!mounted) return

          const cachedProfile = readCachedProfile()

          setState((prev) => ({
            loading: false,
            authResolved: true,
            session,
            user,
            profile: prev.profile || cachedProfile,
            profileComplete: isProfileComplete(prev.profile || cachedProfile),
            suspended: isProfileSuspended(prev.profile || cachedProfile),
            isOffline: !navigator.onLine,
            error: profileError.message || "Profile could not be refreshed.",
          }))
        }
      } catch (error) {
        if (!mounted) return

        const cachedProfile = readCachedProfile()

        setState((prev) => ({
          loading: false,
          authResolved: true,
          session: prev.session,
          user: prev.user,
          profile: prev.profile || cachedProfile,
          profileComplete: isProfileComplete(prev.profile || cachedProfile),
          suspended: isProfileSuspended(prev.profile || cachedProfile),
          isOffline: !navigator.onLine,
          error: error.message || "Could not load session.",
        }))
      }
    }

    function handleOnline() {
      if (!mounted) return

      setState((prev) => ({
        ...prev,
        isOffline: false,
      }))

      load()
    }

    function handleOffline() {
      if (!mounted) return

      setState((prev) => ({
        ...prev,
        isOffline: true,
        loading: false,
      }))
    }

    load()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      load()
    })

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