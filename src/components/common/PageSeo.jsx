import { useEffect } from "react"

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

function PageSeo({
  title,
  description,
  canonicalPath,
  image = "/ctm-logo.jpg",
  noindex = false,
  type = "website",
  structuredData,
}) {
  useEffect(() => {
    if (typeof document === "undefined") return undefined

    if (title) document.title = title

    const canonicalUrl = resolveCanonical(canonicalPath)
    const robots = noindex ? "noindex, nofollow" : "index, follow, max-image-preview:large"

    setMeta('meta[name="description"]', { name: "description", content: description })
    setMeta('meta[name="robots"]', { name: "robots", content: robots })
    setMeta('meta[property="og:type"]', { property: "og:type", content: type })
    setMeta('meta[property="og:title"]', { property: "og:title", content: title })
    setMeta('meta[property="og:description"]', { property: "og:description", content: description })
    setMeta('meta[property="og:url"]', { property: "og:url", content: canonicalUrl })
    setMeta('meta[property="og:image"]', { property: "og:image", content: image })
    setMeta('meta[property="og:image:width"]', { property: "og:image:width", content: "1200" })
    setMeta('meta[property="og:image:height"]', { property: "og:image:height", content: "630" })
    setMeta('meta[property="og:image:alt"]', { property: "og:image:alt", content: title || "CTMerchant" })
    setMeta('meta[property="og:locale"]', { property: "og:locale", content: "en_NG" })
    setMeta('meta[property="og:site_name"]', { property: "og:site_name", content: "CTMerchant" })
    
    setMeta('meta[name="twitter:card"]', { name: "twitter:card", content: "summary_large_image" })
    setMeta('meta[name="twitter:site"]', { name: "twitter:site", content: "@ctmerchant_ng" })
    setMeta('meta[name="twitter:creator"]', { name: "twitter:creator", content: "@ctmerchant_ng" })
    setMeta('meta[name="twitter:title"]', { name: "twitter:title", content: title })
    setMeta('meta[name="twitter:description"]', { name: "twitter:description", content: description })
    setMeta('meta[name="twitter:image"]', { name: "twitter:image", content: image })
    
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
