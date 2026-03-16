import { useEffect, useState } from "react"
import { supabase } from "../lib/supabase"
import {
  fetchProfileByUserId,
  getSession,
  isProfileComplete,
  isProfileSuspended,
} from "../lib/auth"

function useAuthSession() {
  const [state, setState] = useState({
    loading: true,
    session: null,
    user: null,
    profile: null,
    profileComplete: false,
    suspended: false,
    error: "",
  })

  useEffect(() => {
    let mounted = true

    async function load() {
      try {
        const session = await getSession()
        const user = session?.user || null

        if (!user) {
          if (!mounted) return
          setState({
            loading: false,
            session: null,
            user: null,
            profile: null,
            profileComplete: false,
            suspended: false,
            error: "",
          })
          return
        }

        const profile = await fetchProfileByUserId(user.id)

        if (!mounted) return

        setState({
          loading: false,
          session,
          user,
          profile,
          profileComplete: isProfileComplete(profile),
          suspended: isProfileSuspended(profile),
          error: "",
        })
      } catch (error) {
        if (!mounted) return
        setState({
          loading: false,
          session: null,
          user: null,
          profile: null,
          profileComplete: false,
          suspended: false,
          error: error.message || "Could not load session.",
        })
      }
    }

    load()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      load()
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  return state
}

export default useAuthSession