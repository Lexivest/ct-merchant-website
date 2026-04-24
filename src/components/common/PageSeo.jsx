import { useEffect } from "react"

const SITE_NAME = "CTMerchant"
const SITE_ORIGIN = "https://www.ctmerchant.com.ng"
const DEFAULT_TITLE = "CTMerchant | Repository of Shops, Products and Services"
const DEFAULT_DESCRIPTION =
  "CTMerchant is a trusted repository of verified physical shops, products, and services. Discover local merchants, browse city directories, and manage your storefront."
const DEFAULT_IMAGE = "/ctm-logo.jpg"

function setMeta(selector, attributes = {}) {
  if (typeof document === "undefined") return

  let tag = document.head.querySelector(selector)
  if (!tag) {
    tag = document.createElement("meta")
    document.head.appendChild(tag)
  }

  Object.entries(attributes).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      tag.setAttribute(key, String(value))
    }
  })
}

function setLink(selector, attributes = {}) {
  if (typeof document === "undefined") return

  let tag = document.head.querySelector(selector)
  if (!tag) {
    tag = document.createElement("link")
    document.head.appendChild(tag)
  }

  Object.entries(attributes).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      tag.setAttribute(key, String(value))
    }
  })
}

function resolveCanonical(canonicalPath) {
  if (typeof window === "undefined") return canonicalPath || ""
  const value = canonicalPath || window.location.pathname + window.location.search
  try {
    return new URL(value, window.location.origin).toString()
  } catch {
    return window.location.href
  }
}

function resolveAbsoluteUrl(value, fallback = "") {
  if (!value) return fallback

  try {
    if (typeof window !== "undefined") {
      return new URL(value, window.location.origin).toString()
    }
    return new URL(value, SITE_ORIGIN).toString()
  } catch {
    return fallback
  }
}

function PageSeo({
  title,
  description,
  canonicalPath,
  image = DEFAULT_IMAGE,
  noindex = false,
  type = "website",
  structuredData,
}) {
  useEffect(() => {
    if (typeof document === "undefined") return undefined

    const resolvedTitle = title || DEFAULT_TITLE
    const resolvedDescription = description || DEFAULT_DESCRIPTION
    const canonicalUrl = resolveCanonical(canonicalPath)
    const resolvedImage = resolveAbsoluteUrl(image || DEFAULT_IMAGE, `${SITE_ORIGIN}${DEFAULT_IMAGE}`)
    const robots = noindex ? "noindex, nofollow" : "index, follow"

    document.title = resolvedTitle

    setMeta('meta[name="description"]', { name: "description", content: resolvedDescription })
    setMeta('meta[name="robots"]', { name: "robots", content: robots })
    setMeta('meta[property="og:title"]', { property: "og:title", content: resolvedTitle })
    setMeta('meta[property="og:description"]', { property: "og:description", content: resolvedDescription })
    setMeta('meta[property="og:type"]', { property: "og:type", content: type || "website" })
    setMeta('meta[property="og:url"]', { property: "og:url", content: canonicalUrl })
    setMeta('meta[property="og:image"]', { property: "og:image", content: resolvedImage })
    setMeta('meta[property="og:site_name"]', { property: "og:site_name", content: SITE_NAME })
    setMeta('meta[name="twitter:card"]', { name: "twitter:card", content: "summary_large_image" })
    setMeta('meta[name="twitter:title"]', { name: "twitter:title", content: resolvedTitle })
    setMeta('meta[name="twitter:description"]', { name: "twitter:description", content: resolvedDescription })
    setMeta('meta[name="twitter:image"]', { name: "twitter:image", content: resolvedImage })
    setLink('link[rel="canonical"]', { rel: "canonical", href: canonicalUrl })

    // Structured Data (JSON-LD)
    let scriptTag = document.head.querySelector('script[type="application/ld+json"]#dynamic-seo-data')
    if (structuredData) {
      if (!scriptTag) {
        scriptTag = document.createElement("script")
        scriptTag.type = "application/ld+json"
        scriptTag.id = "dynamic-seo-data"
        document.head.appendChild(scriptTag)
      }
      scriptTag.text = JSON.stringify(structuredData)
    } else if (scriptTag) {
      scriptTag.remove()
    }

    return () => {
      // Cleanup dynamic script on unmount if needed, 
      // but usually we want it to stay until the next page sets it.
    }
  }, [canonicalPath, description, image, noindex, title, type, structuredData])

  return null
}

export default PageSeo
