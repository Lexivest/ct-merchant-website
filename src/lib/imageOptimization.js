/**
 * Helper to generate optimized image URLs using Supabase Storage transformations.
 * Amazon standard: requesting the exact dimensions needed for the UI.
 */

const SUPABASE_PROJECT_ID = import.meta.env.VITE_SUPABASE_URL?.match(/https:\/\/(.*)\.supabase\.co/)?.[1]

export function getOptimizedImageUrl(src, options = {}) {
  if (!src || typeof src !== 'string') return src
  
  // Only optimize Supabase Storage URLs
  if (!src.includes('supabase.co/storage/v1/object/public/')) {
    return src
  }

  const {
    width,
    height,
    quality = 80,
    format = 'origin', // or 'webp' if supported by the project tier
    resize = 'cover' // cover, contain, fill
  } = options

  // If no specific dimensions are requested, return original
  if (!width && !height) return src

  const params = new URLSearchParams()
  if (width) params.append('width', width.toString())
  if (height) params.append('height', height.toString())
  if (quality) params.append('quality', quality.toString())
  if (format && format !== 'origin') params.append('format', format)
  params.append('resize', resize)

  const queryString = params.toString()
  if (!queryString) return src

  // Supabase transformation URL structure:
  // [project-url]/storage/v1/render/image/public/[bucket]/[path]?[params]
  
  const parts = src.split('/storage/v1/object/public/')
  if (parts.length !== 2) return src

  const baseUrl = parts[0].replace(/\/$/, '') // remove trailing slash if any
  const bucketAndPath = parts[1]

  return `${baseUrl}/storage/v1/render/image/public/${bucketAndPath}?${queryString}`
}

/**
 * Common image size presets for the marketplace
 */
export const IMAGE_PRESETS = {
  THUMBNAIL: { width: 200, height: 200, quality: 70 },
  PRODUCT_CARD: { width: 400, height: 400, quality: 80 },
  BANNER_MOBILE: { width: 640, height: 320, quality: 75 },
  BANNER_DESKTOP: { width: 1280, height: 480, quality: 85 },
  AVATAR: { width: 120, height: 120, quality: 75 },
  FULL_VIEW: { width: 1200, quality: 90 }
}
