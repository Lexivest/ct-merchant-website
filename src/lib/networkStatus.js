import { useSyncExternalStore } from "react"

let listeners = new Set()
let listenersAttached = false

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

function ensureListeners() {
  if (typeof window === "undefined" || listenersAttached) return

  snapshot = buildSnapshot(readNavigatorOnline())
  listenersAttached = true

  window.addEventListener("online", () => {
    emitSnapshot(true)
  })

  window.addEventListener("offline", () => {
    emitSnapshot(false)
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
