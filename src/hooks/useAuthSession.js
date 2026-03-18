import { useEffect, useRef, useState } from "react"
import { supabase } from "../lib/supabase"
import {
  fetchProfileByUserId,
  getSession,
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
  const hasResolvedOnce = useRef(false)

  const [state, setState] = useState(() => {
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

  useEffect(() => {
    let mounted = true

    async function load({ preserveAuth = true } = {}) {
      try {
        const session = await getSession()
        const user = session?.user || null

        if (!mounted) return

        if (!user) {
          clearCachedProfile()

          setState({
            loading: false,
            session: null,
            user: null,
            profile: null,
            suspended: false,
            error: "",
            isOffline: !navigator.onLine,
          })

          hasResolvedOnce.current = true
          return
        }

        const prevProfile = readCachedProfile()

        setState((prev) => ({
          ...prev,
          loading: true,
          session,
          user,
          error: "",
          isOffline: !navigator.onLine,
          profile: prev.profile || prevProfile,
          suspended: isProfileSuspended(prev.profile || prevProfile),
        }))

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

          setState({
            loading: false,
            session,
            user,
            profile: profile || null,
            suspended: isProfileSuspended(profile),
            error: "",
            isOffline: !navigator.onLine,
          })
        } catch (profileError) {
          if (!mounted) return

          const cachedProfile = readCachedProfile()

          setState((prev) => ({
            ...prev,
            loading: false,
            session,
            user,
            profile: prev.profile || cachedProfile,
            suspended: isProfileSuspended(prev.profile || cachedProfile),
            error: "",
            isOffline: !navigator.onLine,
          }))
        }

        hasResolvedOnce.current = true
      } catch (error) {
        if (!mounted) return

        if (preserveAuth) {
          const cachedProfile = readCachedProfile()

          setState((prev) => ({
            ...prev,
            loading: false,
            profile: prev.profile || cachedProfile,
            suspended: isProfileSuspended(prev.profile || cachedProfile),
            error: "",
            isOffline: !navigator.onLine,
          }))
        } else {
          setState({
            loading: false,
            session: null,
            user: null,
            profile: null,
            suspended: false,
            error: error.message || "Could not load session.",
            isOffline: !navigator.onLine,
          })
        }

        hasResolvedOnce.current = true
      }
    }

    load({ preserveAuth: true })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return

      if (event === "SIGNED_OUT" || !session?.user) {
        clearCachedProfile()

        setState({
          loading: false,
          session: null,
          user: null,
          profile: null,
          suspended: false,
          error: "",
          isOffline: !navigator.onLine,
        })

        hasResolvedOnce.current = true
        return
      }

      load({ preserveAuth: true })
    })

    const handleOnline = () => {
      if (!mounted) return
      setState((prev) => ({ ...prev, isOffline: false }))
      load({ preserveAuth: true })
    }

    const handleOffline = () => {
      if (!mounted) return
      setState((prev) => ({
        ...prev,
        isOffline: true,
        loading: false,
        error: "",
      }))
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