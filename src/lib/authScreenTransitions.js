import { fetchOpenCities } from "./auth"
import { getFriendlyErrorMessage } from "./friendlyErrors"
import { primeCachedFetchStore, readCachedFetchStore } from "../hooks/useCachedFetch"
import { primeAuthSessionState } from "../hooks/useAuthSession"

const OPEN_CITIES_CACHE_KEY = "open_cities"
const OPEN_CITIES_TTL = 1000 * 60 * 60 * 24

function hasFreshCachedEntry(entry, ttl) {
  return Boolean(entry && Date.now() - entry.timestamp <= ttl)
}

export async function preloadCreateAccountScreen() {
  const cachedCities = readCachedFetchStore(OPEN_CITIES_CACHE_KEY)
  const tasks = [import("../pages/CreateAccount")]

  if (!hasFreshCachedEntry(cachedCities, OPEN_CITIES_TTL)) {
    tasks.push(
      fetchOpenCities().then((cities) => {
        primeCachedFetchStore(OPEN_CITIES_CACHE_KEY, cities)
      })
    )
  }

  await Promise.all(tasks)
}

export async function preloadDashboardScreen({
  session = null,
  user,
  profile = null,
  suspended = false,
  profileLoaded = true,
}) {
  primeAuthSessionState({
    session,
    user,
    profile,
    suspended,
    profileLoaded,
  })

  await import("../pages/UserDashboard")
}

export function getAuthScreenTransitionMessage(
  error,
  fallback = "We could not open that screen right now. Please try again."
) {
  return getFriendlyErrorMessage(error, fallback)
}
