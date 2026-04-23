import { useEffect } from "react"
import { isNetworkOffline } from "../lib/networkStatus"

const warmedGroups = new Set()
const INTER_ROUTE_DELAY_MS = 70

const routeWarmupGroups = {
  landing: [
    () => import("../pages/CreateAccount"),
    () => import("../pages/UserDashboard"),
    () => import("../pages/Search"),
    () => import("../pages/ShopDetail"),
  ],
  market: [
    () => import("../pages/Area"),
    () => import("../pages/Cat"),
    () => import("../pages/ShopIndex"),
    () => import("../pages/ShopDetail"),
    () => import("../pages/ProductDetail"),
    () => import("../pages/VendorsPanel"),
  ],
  vendor: [
    () => import("../pages/VendorsPanel"),
    () => import("../pages/ShopRegistration"),
    () => import("../pages/vendors/AddProduct"),
    () => import("../pages/vendors/MerchantProducts"),
    () => import("../pages/vendors/MerchantBanner"),
    () => import("../pages/vendors/MerchantSettings"),
  ],
  staff: [
    () => import("../pages/StaffDashboard"),
    () => import("../pages/staff/StaffUsers"),
    () => import("../pages/staff/StaffVerifications"),
    () => import("../pages/staff/StaffPayments"),
  ],
}

function getWarmupGroup(pathname) {
  if (!pathname) return ""

  if (pathname.startsWith("/staff")) {
    return "staff"
  }

  if (
    pathname === "/vendor-panel" ||
    pathname === "/shop-registration" ||
    pathname === "/remita" ||
    pathname === "/service-fee" ||
    pathname.startsWith("/merchant-")
  ) {
    return "vendor"
  }

  if (
    pathname === "/user-dashboard" ||
    pathname === "/search" ||
    pathname === "/area" ||
    pathname === "/cat" ||
    pathname === "/shop-index" ||
    pathname === "/shop-detail" ||
    pathname === "/product-detail" ||
    pathname === "/reposearch" ||
    pathname === "/discovery"
  ) {
    return "market"
  }

  return "landing"
}

function canWarmRoutes() {
  if (typeof navigator === "undefined" || isNetworkOffline()) return false

  const connection =
    navigator.connection || navigator.mozConnection || navigator.webkitConnection

  if (!connection) return true
  if (connection.saveData) return false

  const effectiveType = String(connection.effectiveType || "").toLowerCase()
  return effectiveType !== "slow-2g" && effectiveType !== "2g"
}

function pauseBetweenImports() {
  return new Promise((resolve) => {
    window.setTimeout(resolve, INTER_ROUTE_DELAY_MS)
  })
}

export default function useRouteWarmup({ pathname = "" }) {
  useEffect(() => {
    if (typeof window === "undefined" || !canWarmRoutes()) {
      return undefined
    }

    const group = getWarmupGroup(pathname)
    const loaders = routeWarmupGroups[group]

    if (!group || !Array.isArray(loaders) || warmedGroups.has(group)) {
      return undefined
    }

    let cancelled = false

    const warmRoutes = async () => {
      warmedGroups.add(group)

      try {
        for (const loadRoute of loaders) {
          if (cancelled) return
          await loadRoute()
          if (cancelled) return
          await pauseBetweenImports()
        }
      } catch (error) {
        warmedGroups.delete(group)
        console.warn("Route warmup failed:", error)
      }
    }

    if ("requestIdleCallback" in window) {
      const idleId = window.requestIdleCallback(() => {
        void warmRoutes()
      }, { timeout: 2200 })

      return () => {
        cancelled = true
        if ("cancelIdleCallback" in window) {
          window.cancelIdleCallback(idleId)
        }
      }
    }

    const timerId = window.setTimeout(() => {
      void warmRoutes()
    }, 700)

    return () => {
      cancelled = true
      window.clearTimeout(timerId)
    }
  }, [pathname])
}
