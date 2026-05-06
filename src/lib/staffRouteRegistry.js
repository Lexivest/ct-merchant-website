import { createElement } from "react"

const staffRouteLoaders = {
  "/staff-traffic": () => import("../pages/staff/StaffTraffic"),
  "/staff-users": () => import("../pages/staff/StaffUsers"),
  "/staff-community": () => import("../pages/staff/StaffCommunity"),
  "/staff-verifications": () => import("../pages/staff/StaffVerifications"),
  "/staff-products": () => import("../pages/staff/StaffProducts"),
  "/staff-shop-content": () => import("../pages/staff/StaffShopContent"),
  "/staff-shop-identity": () => import("../pages/staff/StaffShopIdentity"),
  "/staff-announcements": () => import("../pages/staff/StaffAnnouncements"),
  "/staff-notifications": () => import("../pages/staff/StaffNotifications"),
  "/staff-payments": () => import("../pages/staff/StaffPayments"),
  "/staff-shop-analytics": () => import("../pages/staff/StaffShopAnalytics"),
  "/staff-city-banners": () => import("../pages/staff/StaffFeaturedCityBanners"),
  "/staff-sponsored-products": () => import("../pages/staff/StaffSponsoredProducts"),
  "/staff-discoveries": () => import("../pages/staff/StaffDiscoveries"),
  "/staff-inbox": () => import("../pages/staff/StaffInbox"),
  "/staff-security-radar": () => import("../pages/staff/StaffSecurityRadar"),
  "/staff-studio": () => import("../pages/vendors/ImageOptimizer"),
  "/staff-issue-id": () => import("../pages/staff/StaffIDGenerator"),
}

const staffRouteModuleCache = new Map()
const staffRoutePromiseCache = new Map()

export function normalizeStaffRoutePath(path) {
  const [pathname] = String(path || "").split("?")
  return pathname
}

export function hasStaffRouteComponent(path) {
  return Boolean(staffRouteLoaders[normalizeStaffRoutePath(path)])
}

export function preloadStaffRouteComponent(path) {
  const pathname = normalizeStaffRoutePath(path)
  const loader = staffRouteLoaders[pathname]
  if (!loader) {
    return Promise.reject(new Error(`Staff route module is not registered: ${pathname || "unknown route"}`))
  }

  const cachedModule = staffRouteModuleCache.get(pathname)
  if (cachedModule) return Promise.resolve(cachedModule)

  const cachedPromise = staffRoutePromiseCache.get(pathname)
  if (cachedPromise) return cachedPromise

  const loadPromise = loader()
    .then((loadedModule) => {
      staffRouteModuleCache.set(pathname, loadedModule)
      staffRoutePromiseCache.delete(pathname)
      return loadedModule
    })
    .catch((error) => {
      staffRoutePromiseCache.delete(pathname)
      throw error
    })

  staffRoutePromiseCache.set(pathname, loadPromise)
  return loadPromise
}

export function createPreloadableStaffRoute(path) {
  const pathname = normalizeStaffRoutePath(path)

  function PreloadableStaffRoute(props) {
    const loadedModule = staffRouteModuleCache.get(pathname)
    if (!loadedModule) {
      throw preloadStaffRouteComponent(pathname)
    }

    return createElement(loadedModule.default, props)
  }

  PreloadableStaffRoute.preload = () => preloadStaffRouteComponent(pathname)
  return PreloadableStaffRoute
}
