import { useSyncExternalStore } from "react"

let listeners = new Set()
let listenersAttached = false
let offlineConfirmationTimer = null

const OFFLINE_CONFIRMATION_MS = 2500

let snapshot = {
  isOnline: true,
  isOffline: false,
  changedAt: 0,
  lastOnlineAt: 0,
  lastOfflineAt: 0,
}

function readNavigatorOnline() {
  if (typeof navigator === "undefined") return true
  return navigator.onLine !== false
}

function buildSnapshot(isOnline) {
  const changedAt = Date.now()

  return {
    isOnline,
    isOffline: !isOnline,
    changedAt,
    lastOnlineAt: isOnline ? changedAt : snapshot.lastOnlineAt,
    lastOfflineAt: isOnline ? snapshot.lastOfflineAt : changedAt,
  }
}

function emitSnapshot(nextOnlineState) {
  if (offlineConfirmationTimer && nextOnlineState) {
    window.clearTimeout(offlineConfirmationTimer)
    offlineConfirmationTimer = null
  }

  const hasChanged = snapshot.isOnline !== nextOnlineState

  if (hasChanged) {
    snapshot = buildSnapshot(nextOnlineState)
  } else {
    snapshot = {
      ...snapshot,
      isOnline: nextOnlineState,
      isOffline: !nextOnlineState,
    }
  }

  listeners.forEach((listener) => {
    try {
      listener()
    } catch (error) {
      console.warn("Network status listener failed:", error)
    }
  })
}

function confirmOfflineAfterGracePeriod() {
  if (typeof window === "undefined") return

  if (offlineConfirmationTimer) {
    window.clearTimeout(offlineConfirmationTimer)
  }

  offlineConfirmationTimer = window.setTimeout(() => {
    offlineConfirmationTimer = null

    if (!readNavigatorOnline()) {
      emitSnapshot(false)
    }
  }, OFFLINE_CONFIRMATION_MS)
}

function ensureListeners() {
  if (typeof window === "undefined" || listenersAttached) return

  const initiallyOnline = readNavigatorOnline()
  snapshot = buildSnapshot(true)
  listenersAttached = true

  if (!initiallyOnline) {
    confirmOfflineAfterGracePeriod()
  }

  window.addEventListener("online", () => {
    emitSnapshot(true)
  })

  window.addEventListener("offline", () => {
    confirmOfflineAfterGracePeriod()
  })
}

export function getNetworkStatusSnapshot() {
  ensureListeners()
  return snapshot
}

export function getNetworkStatusServerSnapshot() {
  return {
    isOnline: true,
    isOffline: false,
    changedAt: 0,
    lastOnlineAt: 0,
    lastOfflineAt: 0,
  }
}

export function isNetworkOffline() {
  return getNetworkStatusSnapshot().isOffline
}

export function isNetworkOnline() {
  return getNetworkStatusSnapshot().isOnline
}

export function subscribeNetworkStatus(listener) {
  ensureListeners()
  listeners.add(listener)

  return () => {
    listeners.delete(listener)
  }
}

export function useNetworkStatus() {
  return useSyncExternalStore(
    subscribeNetworkStatus,
    getNetworkStatusSnapshot,
    getNetworkStatusServerSnapshot
  )
}
