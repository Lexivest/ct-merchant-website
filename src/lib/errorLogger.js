const LOG_KEY = "ctm_error_log"
const MAX_ENTRIES = 50

function readLog() {
  try {
    const raw = window.localStorage.getItem(LOG_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function writeLog(entries) {
  try {
    window.localStorage.setItem(LOG_KEY, JSON.stringify(entries))
  } catch {
    // Storage full — trim to the most recent half and retry once.
    try {
      const trimmed = entries.slice(Math.floor(entries.length / 2))
      window.localStorage.setItem(LOG_KEY, JSON.stringify(trimmed))
    } catch {
      // Still blocked (private mode, permissions) — degrade silently.
    }
  }
}

/**
 * Logs an error to localStorage (capped at MAX_ENTRIES) and the in-memory
 * crash log. Swap the hook point below to forward to Sentry, Datadog, etc.
 *
 * @param {Error|unknown} error
 * @param {Record<string, unknown>} context  Extra fields merged into the entry
 */
export function logError(error, context = {}) {
  if (typeof window === "undefined") return

  const entry = {
    t: new Date().toISOString(),
    name: error?.name || "Error",
    msg: error?.message || String(error),
    stack: (error?.stack || "").slice(0, 800),
    url: window.location.href,
    ...context,
  }

  // In-memory crash log (visible in DevTools as window.__CTM_CRASH_LOG__)
  if (!window.__CTM_CRASH_LOG__) window.__CTM_CRASH_LOG__ = []
  window.__CTM_CRASH_LOG__.push(entry)

  // Persistent log across page reloads (useful for diagnosing startup crashes)
  const log = readLog()
  log.push(entry)
  if (log.length > MAX_ENTRIES) log.splice(0, log.length - MAX_ENTRIES)
  writeLog(log)

  // ─── HOOK POINT ──────────────────────────────────────────────────────────────
  // Replace or extend here to forward errors to an external service, e.g.:
  //   Sentry:  window.Sentry?.captureException(error, { extra: context })
  //   Custom:  fetch("/api/errors", { method:"POST", body:JSON.stringify(entry) }).catch(()=>{})
  // ─────────────────────────────────────────────────────────────────────────────
}

/** Returns all persisted error log entries (latest last). */
export function getErrorLog() {
  if (typeof window === "undefined") return []
  return readLog()
}

/** Wipes the persisted error log from localStorage. */
export function clearErrorLog() {
  try {
    window.localStorage.removeItem(LOG_KEY)
  } catch {
    // Best effort
  }
}
