import { useCallback, useEffect, useMemo, useState } from "react"
import { useLocation } from "react-router-dom"
import {
  FaCircleNotch,
  FaCloudArrowUp,
  FaImage,
  FaPause,
  FaPlay,
  FaTrashCan,
  FaWandMagicSparkles,
} from "react-icons/fa6"
import { supabase } from "../../lib/supabase"
import { canvasToBlobWithMaxBytes } from "../../lib/imagePipeline"
import { getFriendlyErrorMessage } from "../../lib/friendlyErrors"
import { UPLOAD_RULES } from "../../lib/uploadRules"
import { useGlobalFeedback } from "../../components/common/GlobalFeedbackProvider"
import StableImage from "../../components/common/StableImage"
import { SectionHeading, StaffPortalShell, formatDateTime, useStaffPortalSession } from "./StaffPortalShared"

const BANNER_RULE = UPLOAD_RULES.featuredCityBanners

function normalizePositiveId(value) {
  const normalized = String(value ?? "").trim()
  if (!/^\d+$/.test(normalized)) return ""

  const parsed = Number(normalized)
  if (!Number.isFinite(parsed) || parsed <= 0) return ""

  return String(parsed)
}

const BACKGROUND_OPTIONS = [
  {
    key: "lagoon-blue",
    label: "Lagoon Blue",
    bg: "from-[#043C83] via-[#0969B9] to-[#20B7E8]",
    stops: ["#043C83", "#0969B9", "#20B7E8"],
    texture: "radial-gradient(circle_at_15%_20%,rgba(255,255,255,0.38),transparent_22%),radial-gradient(circle_at_82%_12%,rgba(236,72,153,0.3),transparent_20%),linear-gradient(135deg,rgba(255,255,255,0.14)_0_1px,transparent_1px_18px)",
  },
  {
    key: "sunset-coral",
    label: "Sunset Coral",
    bg: "from-[#7C2D12] via-[#EA580C] to-[#F9A8D4]",
    stops: ["#7C2D12", "#EA580C", "#F9A8D4"],
    texture: "radial-gradient(circle_at_20%_18%,rgba(255,255,255,0.42),transparent_20%),radial-gradient(circle_at_78%_28%,rgba(254,240,138,0.34),transparent_24%),linear-gradient(45deg,rgba(255,255,255,0.12)_0_2px,transparent_2px_20px)",
  },
  {
    key: "emerald-market",
    label: "Emerald Market",
    bg: "from-[#064E3B] via-[#059669] to-[#A7F3D0]",
    stops: ["#064E3B", "#059669", "#A7F3D0"],
    texture: "radial-gradient(circle_at_12%_74%,rgba(255,255,255,0.34),transparent_22%),radial-gradient(circle_at_86%_18%,rgba(190,242,100,0.38),transparent_18%),linear-gradient(120deg,rgba(255,255,255,0.14)_0_1px,transparent_1px_16px)",
  },
  {
    key: "royal-night",
    label: "Royal Night",
    bg: "from-[#111827] via-[#312E81] to-[#DB2777]",
    stops: ["#111827", "#312E81", "#DB2777"],
    texture: "radial-gradient(circle_at_18%_16%,rgba(255,255,255,0.22),transparent_18%),radial-gradient(circle_at_78%_70%,rgba(244,114,182,0.42),transparent_24%),linear-gradient(150deg,rgba(255,255,255,0.1)_0_1px,transparent_1px_22px)",
  },
  {
    key: "golden-commerce",
    label: "Golden Commerce",
    bg: "from-[#78350F] via-[#D97706] to-[#FDE68A]",
    stops: ["#78350F", "#D97706", "#FDE68A"],
    texture: "radial-gradient(circle_at_20%_24%,rgba(255,255,255,0.45),transparent_18%),radial-gradient(circle_at_88%_16%,rgba(251,113,133,0.3),transparent_22%),linear-gradient(135deg,rgba(255,255,255,0.16)_0_1px,transparent_1px_14px)",
  },
  {
    key: "berry-silk",
    label: "Berry Silk",
    bg: "from-[#831843] via-[#DB2777] to-[#FBCFE8]",
    stops: ["#831843", "#DB2777", "#FBCFE8"],
    texture: "radial-gradient(circle_at_18%_20%,rgba(255,255,255,0.34),transparent_22%),radial-gradient(circle_at_80%_75%,rgba(147,197,253,0.3),transparent_24%),linear-gradient(60deg,rgba(255,255,255,0.16)_0_1px,transparent_1px_18px)",
  },
  {
    key: "indigo-grid",
    label: "Indigo Grid",
    bg: "from-[#1E1B4B] via-[#3730A3] to-[#60A5FA]",
    stops: ["#1E1B4B", "#3730A3", "#60A5FA"],
    texture: "linear-gradient(rgba(255,255,255,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.12)_1px,transparent_1px),radial-gradient(circle_at_80%_20%,rgba(236,72,153,0.3),transparent_20%)",
  },
  {
    key: "clean-sky",
    label: "Clean Sky",
    bg: "from-[#0F766E] via-[#22D3EE] to-[#EFF6FF]",
    stops: ["#0F766E", "#22D3EE", "#EFF6FF"],
    texture: "radial-gradient(circle_at_22%_22%,rgba(255,255,255,0.48),transparent_20%),radial-gradient(circle_at_78%_68%,rgba(14,165,233,0.28),transparent_26%),linear-gradient(140deg,rgba(255,255,255,0.18)_0_1px,transparent_1px_20px)",
  },
]

function getBackground(key) {
  return BACKGROUND_OPTIONS.find((item) => item.key === key) || BACKGROUND_OPTIONS[0]
}

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

function wrapText(value, maxChars, maxLines) {
  const words = String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)

  if (!words.length) return []

  const lines = []
  let current = ""

  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (next.length <= maxChars || !current) {
      current = next
    } else {
      lines.push(current)
      current = word
    }

    if (lines.length === maxLines) break
  }

  if (lines.length < maxLines && current) lines.push(current)

  if (lines.length > maxLines) {
    lines.length = maxLines
  }

  const lastIndex = lines.length - 1
  if (lastIndex >= 0 && words.join(" ").length > lines.join(" ").length) {
    lines[lastIndex] = `${lines[lastIndex].replace(/[.\s]+$/, "")}...`
  }

  return lines
}

function svgTextLines({ lines, x, y, fontSize, lineHeight, weight = 800, fill = "#FFFFFF", opacity = 1, anchor = "middle" }) {
  return lines
    .map((line, index) => (
      `<text x="${x}" y="${y + index * lineHeight}" text-anchor="${anchor}" font-family="Verdana, Arial, sans-serif" font-size="${fontSize}" font-weight="${weight}" fill="${fill}" opacity="${opacity}">${escapeXml(line)}</text>`
    ))
    .join("")
}

function svgToDataUrl(svg) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error("Could not read image data."))
    reader.onload = () => resolve(String(reader.result || ""))
    reader.readAsDataURL(blob)
  })
}

async function imageUrlToDataUrl(url) {
  if (!url) return ""
  try {
    const response = await fetch(url, { cache: "force-cache", mode: "cors" })
    if (!response.ok) throw new Error("Image fetch failed.")
    return await blobToDataUrl(await response.blob())
  } catch {
    return ""
  }
}

function getProfileDisplayName(profile) {
  return profile?.full_name || profile?.name || profile?.username || ""
}

function buildFeaturedBannerSvg({ shop, products, backgroundKey, proprietorName, width = 1600, height = 600 }) {
  const background = getBackground(backgroundKey)
  const [start, middle, end] = background.stops || BACKGROUND_OPTIONS[0].stops
  const isMobile = height > width * 0.45
  const titleLines = wrapText(shop?.name || "Featured Shop", isMobile ? 24 : 34, 2)
  const addressLines = wrapText(
    shop?.address || shop?.category || "Visit this shop for available products and services.",
    isMobile ? 48 : 80,
    2
  )
  const titleFont = isMobile ? 50 : 58
  const addressFont = isMobile ? 28 : 32
  const titleStartY = isMobile ? 92 : 82
  const addressStartY = titleStartY + titleLines.length * (isMobile ? 58 : 64) + 12
  const tileY = isMobile ? 315 : 225
  const tileWidth = isMobile ? 190 : 258
  const tileHeight = isMobile ? 260 : 285
  const gap = isMobile ? 22 : 28
  const totalTileWidth = tileWidth * 5 + gap * 4
  const tileStartX = (width - totalTileWidth) / 2
  const safeProducts = Array.from({ length: 5 }, (_, index) => products?.[index] || null)
  const shopLogo = shop?.svgLogoUrl || shop?.image_url || ""
  const logoSize = isMobile ? 88 : 92
  const logoX = isMobile ? 42 : 48
  const logoY = isMobile ? 36 : 34
  const proprietorText = proprietorName ? `Proprietor: ${proprietorName}` : ""
  const proprietorLines = wrapText(proprietorText, isMobile ? 42 : 74, 1)
  const proprietorY = isMobile ? 650 : 560

  const productMarkup = safeProducts
    .map((product, index) => {
      const x = tileStartX + index * (tileWidth + gap)
      const y = tileY
      const image = product?.svgImageUrl || product?.image_url || ""
      const centerX = x + tileWidth / 2
      const centerY = y + tileHeight / 2

      return `
        <g>
          <clipPath id="productClip${index}">
            <rect x="${x}" y="${y}" width="${tileWidth}" height="${tileHeight}" rx="30"/>
          </clipPath>
          ${
            image
              ? `<image href="${escapeXml(image)}" x="${x}" y="${y}" width="${tileWidth}" height="${tileHeight}" preserveAspectRatio="xMidYMid slice" clip-path="url(#productClip${index})"/>`
              : `<rect x="${x}" y="${y}" width="${tileWidth}" height="${tileHeight}" rx="30" fill="#FFFFFF" opacity="0.14"/><text x="${centerX}" y="${centerY + 12}" text-anchor="middle" font-family="Verdana, Arial, sans-serif" font-size="54" fill="#FFFFFF" opacity="0.7">+</text>`
          }
          <rect x="${x}" y="${y}" width="${tileWidth}" height="${tileHeight}" rx="30" fill="none" stroke="#FFFFFF" stroke-opacity="0.42" stroke-width="3"/>
        </g>
      `
    })
    .join("")

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${start}"/>
      <stop offset="54%" stop-color="${middle}"/>
      <stop offset="100%" stop-color="${end}"/>
    </linearGradient>
    <pattern id="grid" width="42" height="42" patternUnits="userSpaceOnUse">
      <path d="M 42 0 L 0 0 0 42" fill="none" stroke="rgba(255,255,255,0.16)" stroke-width="2"/>
    </pattern>
    <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="16" stdDeviation="18" flood-color="#0F172A" flood-opacity="0.24"/>
    </filter>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <rect width="${width}" height="${height}" fill="url(#grid)" opacity="0.55"/>
  <circle cx="${width * 0.14}" cy="${height * 0.1}" r="${width * 0.14}" fill="#FFFFFF" opacity="0.18"/>
  <circle cx="${width * 0.83}" cy="${height * 0.12}" r="${width * 0.11}" fill="#F472B6" opacity="0.26"/>
  <circle cx="${width * 0.88}" cy="${height * 0.9}" r="${width * 0.15}" fill="#FFFFFF" opacity="0.14"/>
  <rect width="${width}" height="${height}" fill="#000000" opacity="0.08"/>
  <g filter="url(#softShadow)">
    <clipPath id="shopLogoClip">
      <rect x="${logoX}" y="${logoY}" width="${logoSize}" height="${logoSize}" rx="24"/>
    </clipPath>
    ${
      shopLogo
        ? `<image href="${escapeXml(shopLogo)}" x="${logoX}" y="${logoY}" width="${logoSize}" height="${logoSize}" preserveAspectRatio="xMidYMid slice" clip-path="url(#shopLogoClip)"/>`
        : `<rect x="${logoX}" y="${logoY}" width="${logoSize}" height="${logoSize}" rx="24" fill="#FFFFFF" opacity="0.16"/>`
    }
    <rect x="${logoX}" y="${logoY}" width="${logoSize}" height="${logoSize}" rx="24" fill="none" stroke="#FFFFFF" stroke-opacity="0.48" stroke-width="3"/>
  </g>
  <g filter="url(#softShadow)">
    ${svgTextLines({ lines: titleLines, x: width / 2, y: titleStartY, fontSize: titleFont, lineHeight: isMobile ? 58 : 64, weight: 900 })}
    ${svgTextLines({ lines: addressLines, x: width / 2, y: addressStartY, fontSize: addressFont, lineHeight: isMobile ? 34 : 38, weight: 700, fill: "#FFFFFF", opacity: 0.88 })}
  </g>
  <g filter="url(#softShadow)">
    ${productMarkup}
  </g>
  ${
    proprietorLines.length
      ? `<g filter="url(#softShadow)">${svgTextLines({ lines: proprietorLines, x: width / 2, y: proprietorY, fontSize: isMobile ? 28 : 30, lineHeight: 34, weight: 800, fill: "#FFFFFF", opacity: 0.9 })}</g>`
      : ""
  }
</svg>`
}

async function buildStandaloneFeaturedBannerSvg({ shop, products, backgroundKey, proprietorName, width, height }) {
  const [logoDataUrl, embeddedProducts] = await Promise.all([
    imageUrlToDataUrl(shop?.image_url),
    Promise.all(
      (products || []).slice(0, 5).map(async (product) => ({
        ...product,
        svgImageUrl: await imageUrlToDataUrl(product.image_url),
      }))
    ),
  ])

  return buildFeaturedBannerSvg({
    shop: { ...shop, svgLogoUrl: logoDataUrl },
    products: embeddedProducts,
    backgroundKey,
    proprietorName,
    width,
    height,
  })
}

async function svgToJpegBlob(svg, width, height) {
  const image = new Image()
  image.decoding = "async"
  const dataUrl = svgToDataUrl(svg)

  await new Promise((resolve, reject) => {
    image.onload = resolve
    image.onerror = () => reject(new Error("Could not render generated banner."))
    image.src = dataUrl
  })

  if (typeof image.decode === "function") {
    try {
      await image.decode()
    } catch {
      // The load event already confirmed the SVG is renderable.
    }
  }

  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext("2d")
  if (!context) throw new Error("Could not prepare generated banner.")

  context.fillStyle = "#FFFFFF"
  context.fillRect(0, 0, width, height)
  context.drawImage(image, 0, 0, width, height)

  const blob = await canvasToBlobWithMaxBytes(canvas, {
    maxBytes: BANNER_RULE.maxBytes,
    mimeType: "image/jpeg",
    qualityStart: 0.92,
    qualityFloor: 0.55,
    qualityStep: 0.06,
  })

  if (!blob) {
    throw new Error("Generated banner is too large. Use fewer or smaller product images.")
  }

  return blob
}

function FeaturedBannerArtwork({
  shop,
  products,
  backgroundKey,
  proprietorName,
  exportMode = false,
  variant = "desktop",
}) {
  const isMobile = variant === "mobile"
  const productList = (products || []).filter((product) => product?.image_url).slice(0, 5)
  const svg = buildFeaturedBannerSvg({
    shop,
    products: productList,
    backgroundKey,
    proprietorName,
    width: isMobile ? 1200 : 1600,
    height: isMobile ? 700 : 600,
  })

  return (
    <img
      src={svgToDataUrl(svg)}
      alt={shop?.name || "Featured shop banner preview"}
      className={`block w-full rounded-[30px] bg-white shadow-2xl ${exportMode ? "" : "aspect-[16/9] sm:aspect-[8/3]"}`}
    />
  )
}

export default function StaffFeaturedCityBanners() {
  const location = useLocation()
  const { isSuperAdmin, staffCityId, fetchingStaff } = useStaffPortalSession()
  const { notify, confirm } = useGlobalFeedback()
  const prefetchedData =
    location.state?.prefetchedData?.kind === "staff-city-banners"
      ? location.state.prefetchedData
      : null
  const normalizedStaffCityId = normalizePositiveId(staffCityId)
  const [loading, setLoading] = useState(() => !prefetchedData && !fetchingStaff)
  const [saving, setSaving] = useState(false)
  const [cities, setCities] = useState(() => prefetchedData?.cities || [])
  const [shops, setShops] = useState(() => prefetchedData?.shops || [])
  const [productsByShopId, setProductsByShopId] = useState(() => prefetchedData?.productsByShopId || {})
  const [profilesById, setProfilesById] = useState(() => prefetchedData?.profilesById || {})
  const [banners, setBanners] = useState(() => prefetchedData?.banners || [])
  const [selectedCityId, setSelectedCityId] = useState(
    prefetchedData?.selectedCityId ?? (isSuperAdmin ? "" : normalizedStaffCityId)
  )
  const [selectedShopId, setSelectedShopId] = useState(() => prefetchedData?.selectedShopId || "")
  const [backgroundKey, setBackgroundKey] = useState(BACKGROUND_OPTIONS[0].key)
  const [sortOrder, setSortOrder] = useState(0)
  const [prefetchedReady, setPrefetchedReady] = useState(() => Boolean(prefetchedData))

  const selectedShop = useMemo(() => shops.find((shop) => String(shop.id) === String(selectedShopId)) || null, [shops, selectedShopId])
  const selectedProducts = selectedShop ? productsByShopId[String(selectedShop.id)] || [] : []
  const selectedProfile = selectedShop?.owner_id ? profilesById[selectedShop.owner_id] || null : null
  const proprietorName = getProfileDisplayName(selectedProfile)

  const loadInitialData = useCallback(async () => {
    if (prefetchedReady && prefetchedData) {
      setCities(prefetchedData.cities || [])
      setBanners(prefetchedData.banners || [])
      setShops(prefetchedData.shops || [])
      setProductsByShopId(prefetchedData.productsByShopId || {})
      setProfilesById(prefetchedData.profilesById || {})
      setSelectedCityId(prefetchedData.selectedCityId || "")
      setSelectedShopId(prefetchedData.selectedShopId || "")
      setLoading(false)
      setPrefetchedReady(false)
      return
    }

    if (!fetchingStaff && !normalizedStaffCityId && !isSuperAdmin) return

    setLoading(true)
    try {
      let bannersQuery = supabase
        .from("featured_city_banners")
        .select("*, cities(name, state), shops(name, category, address, image_url)")
      
      if (!isSuperAdmin && normalizedStaffCityId) {
        bannersQuery = bannersQuery.eq("city_id", Number(normalizedStaffCityId))
      }

      const [citiesResult, bannersResult] = await Promise.all([
        supabase.from("cities").select("id, name, state").order("state").order("name"),
        bannersQuery.order("created_at", { ascending: false }).limit(100),
      ])

      if (citiesResult.error) throw citiesResult.error
      if (bannersResult.error) throw bannersResult.error

      const cityRows = (citiesResult.data || []).filter(
        (city) => normalizePositiveId(city?.id) !== ""
      )
      setCities(cityRows)
      setBanners(bannersResult.data || [])
      
      if (isSuperAdmin) {
        setSelectedCityId((current) => current || (cityRows[0]?.id ? String(cityRows[0].id) : ""))
      } else {
        setSelectedCityId(normalizedStaffCityId)
      }
    } catch (error) {
      notify({
        type: "error",
        title: "Could not load banner studio",
        message: getFriendlyErrorMessage(error, "Could not load city banner tools."),
      })
    } finally {
      setLoading(false)
    }
  }, [notify, isSuperAdmin, normalizedStaffCityId, fetchingStaff, prefetchedData, prefetchedReady])

  const loadCityShops = useCallback(async (cityId) => {
    const normalizedCityId = normalizePositiveId(cityId)
    if (!normalizedCityId) {
      setShops([])
      setSelectedShopId("")
      setProductsByShopId({})
      setProfilesById({})
      return
    }

    try {
      const { data: shopRows, error: shopsError } = await supabase
        .from("shops")
        .select("id, owner_id, name, category, address, image_url, is_open, status, subscription_end_date")
        .eq("city_id", Number(normalizedCityId))
        .order("name", { ascending: true })
        .limit(120)

      if (shopsError) throw shopsError

      const safeShops = shopRows || []
      setShops(safeShops)
      setSelectedShopId((current) =>
        current && safeShops.some((shop) => String(shop.id) === String(current))
          ? current
          : safeShops[0]?.id
            ? String(safeShops[0].id)
            : ""
      )

      const shopIds = safeShops.map((shop) => shop.id)
      const ownerIds = Array.from(new Set(safeShops.map((shop) => shop.owner_id).filter(Boolean)))
      const [productsResult, profilesResult] = await Promise.all([
        shopIds.length
          ? supabase
              .from("products")
              .select("id, shop_id, image_url, is_available")
              .in("shop_id", shopIds)
              .eq("is_available", true)
              .not("image_url", "is", null)
              .order("id", { ascending: true })
              .limit(600)
          : Promise.resolve({ data: [], error: null }),
        ownerIds.length
          ? supabase.rpc("get_public_profiles", { profile_ids: ownerIds })
          : Promise.resolve({ data: [], error: null }),
      ])

      if (productsResult.error) throw productsResult.error
      if (profilesResult.error) throw profilesResult.error

      const nextProducts = {}
      ;(productsResult.data || []).forEach((product) => {
        if (!product.shop_id || !product.image_url) return
        const key = String(product.shop_id)
        if (!nextProducts[key]) nextProducts[key] = []
        if (nextProducts[key].length < 5) nextProducts[key].push(product)
      })
      setProductsByShopId(nextProducts)

      const nextProfiles = {}
      ;(profilesResult.data || []).forEach((profile) => {
        nextProfiles[profile.id] = profile
      })
      setProfilesById(nextProfiles)
    } catch (error) {
      notify({
        type: "error",
        title: "Could not load city shops",
        message: getFriendlyErrorMessage(error, "Could not load shops for this city."),
      })
    }
  }, [notify])

  useEffect(() => {
    void loadInitialData()
  }, [loadInitialData])

  useEffect(() => {
    void loadCityShops(selectedCityId)
  }, [loadCityShops, selectedCityId])

  async function publishBanner() {
      const normalizedCityId = normalizePositiveId(selectedCityId)

      if (!normalizedCityId || !selectedShop) {
        notify({ type: "error", title: "Select a shop", message: "Choose a city and shop before publishing." })
        return
      }

    try {
      setSaving(true)
      const timestamp = Date.now()
      const basePath = `city-${normalizedCityId}/shop-${selectedShop.id}/${timestamp}`
      const [desktopSvg, mobileSvg] = await Promise.all([
        buildStandaloneFeaturedBannerSvg({
          shop: selectedShop,
          products: selectedProducts,
          backgroundKey,
          proprietorName,
          width: 1600,
          height: 600,
        }),
        buildStandaloneFeaturedBannerSvg({
          shop: selectedShop,
          products: selectedProducts,
          backgroundKey,
          proprietorName,
          width: 1200,
          height: 700,
        }),
      ])
      const [desktopBlob, mobileBlob] = await Promise.all([
        svgToJpegBlob(desktopSvg, 1600, 600),
        svgToJpegBlob(mobileSvg, 1200, 700),
      ])

      const desktopPath = `${basePath}-desktop.jpg`
      const mobilePath = `${basePath}-mobile.jpg`

      const [desktopUpload, mobileUpload] = await Promise.all([
        supabase.storage.from(BANNER_RULE.bucket).upload(desktopPath, desktopBlob, {
          contentType: "image/jpeg",
          cacheControl: "31536000",
          upsert: false,
        }),
        supabase.storage.from(BANNER_RULE.bucket).upload(mobilePath, mobileBlob, {
          contentType: "image/jpeg",
          cacheControl: "31536000",
          upsert: false,
        }),
      ])

      if (desktopUpload.error) throw desktopUpload.error
      if (mobileUpload.error) throw mobileUpload.error

      const desktopUrl = supabase.storage.from(BANNER_RULE.bucket).getPublicUrl(desktopPath).data.publicUrl
      const mobileUrl = supabase.storage.from(BANNER_RULE.bucket).getPublicUrl(mobilePath).data.publicUrl

      const { error } = await supabase.from("featured_city_banners").insert({
        city_id: Number(normalizedCityId),
        shop_id: Number(selectedShop.id),
        title: selectedShop.name,
        subtitle: selectedShop.address || selectedShop.category || "",
        template_key: backgroundKey,
        desktop_image_path: desktopPath,
        desktop_image_url: desktopUrl,
        mobile_image_path: mobilePath,
        mobile_image_url: mobileUrl,
        status: "published",
        sort_order: Number(sortOrder) || 0,
      })

      if (error) throw error

      notify({
        type: "success",
        title: "Featured banner published",
        message: "The banner is now available in the city marketplace carousel.",
      })
      await loadInitialData()
    } catch (error) {
      notify({
        type: "error",
        title: "Publish failed",
        message: getFriendlyErrorMessage(error, "Could not publish this city banner."),
      })
    } finally {
      setSaving(false)
    }
  }

  async function updateBannerStatus(banner, status) {
    try {
      const { error } = await supabase.from("featured_city_banners").update({ status }).eq("id", banner.id)
      if (error) throw error
      await loadInitialData()
    } catch (error) {
      notify({
        type: "error",
        title: "Update failed",
        message: getFriendlyErrorMessage(error, "Could not update this banner."),
      })
    }
  }

  async function deleteBanner(banner) {
    const approved = await confirm({
      type: "error",
      title: "Delete featured banner?",
      message: "This removes the carousel record and generated images from storage.",
      confirmText: "Delete",
      cancelText: "Keep",
    })
    if (!approved) return

    try {
      const paths = [banner.desktop_image_path, banner.mobile_image_path].filter(Boolean)
      if (paths.length) await supabase.storage.from(BANNER_RULE.bucket).remove(paths)
      const { error } = await supabase.from("featured_city_banners").delete().eq("id", banner.id)
      if (error) throw error
      await loadInitialData()
    } catch (error) {
      notify({
        type: "error",
        title: "Delete failed",
        message: getFriendlyErrorMessage(error, "Could not delete this banner."),
      })
    }
  }

  return (
    <StaffPortalShell
      activeKey="city-banners"
      title="Featured City Banners"
      description="Generate polished marketplace carousel banners that spotlight selected shops in each city."
    >
      <SectionHeading
        eyebrow="Marketplace Feature"
        title="City Featured Shop Carousel"
        description="Choose a city and shop, pick a textured background, then publish a shop-first banner to the market screen."
      />

      {loading ? (
        <div className="rounded-[28px] border border-slate-200 bg-white p-10 text-center shadow-sm">
          <FaCircleNotch className="mx-auto mb-4 animate-spin text-4xl text-pink-600" />
          <p className="font-bold text-slate-600">Loading banner engine...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[400px_1fr]">
          <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="mb-4 text-lg font-black text-slate-950">Banner Controls</h3>
            <label className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-500">City</label>
            <select value={selectedCityId} onChange={(event) => setSelectedCityId(normalizePositiveId(event.target.value))} className="mb-4 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-pink-400">
              {cities.map((city) => <option key={city.id} value={normalizePositiveId(city.id)}>{city.name}{city.state ? `, ${city.state}` : ""}</option>)}
            </select>

            <label className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-500">Shop</label>
            <select value={selectedShopId} onChange={(event) => setSelectedShopId(event.target.value)} className="mb-4 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-pink-400">
              {shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.name}</option>)}
            </select>

            <label className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-500">Background</label>
            <div className="mb-4 grid grid-cols-2 gap-2">
              {BACKGROUND_OPTIONS.map((background) => (
                <button
                  key={background.key}
                  type="button"
                  onClick={() => setBackgroundKey(background.key)}
                  className={`overflow-hidden rounded-2xl border p-2 text-left text-xs font-black transition ${
                    backgroundKey === background.key ? "border-pink-500 bg-pink-50 text-pink-700" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <span className={`relative mb-2 block h-10 overflow-hidden rounded-xl bg-gradient-to-br ${background.bg}`}>
                    <span className="absolute inset-0 opacity-70" style={{ backgroundImage: background.texture }} />
                  </span>
                  {background.label}
                </button>
              ))}
            </div>

            <label className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-500">Sort Order</label>
            <input type="number" value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} className="mb-5 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-pink-400" />

            <button type="button" onClick={publishBanner} disabled={saving || !selectedShop} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-pink-600 px-5 py-3.5 text-sm font-black text-white shadow-[0_10px_25px_rgba(219,39,119,0.25)] transition hover:bg-pink-700 disabled:cursor-not-allowed disabled:bg-slate-300">
              {saving ? <FaCircleNotch className="animate-spin" /> : <FaCloudArrowUp />}
              {saving ? "Generating..." : "Generate and Publish"}
            </button>
          </div>

          <div className="space-y-6">
            <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <div className="text-xs font-black uppercase tracking-[0.2em] text-pink-600">Live Preview</div>
                  <h3 className="mt-1 text-xl font-black text-slate-950">Marketplace banner</h3>
                </div>
                <FaWandMagicSparkles className="text-2xl text-pink-600" />
              </div>
              <FeaturedBannerArtwork shop={selectedShop} products={selectedProducts} backgroundKey={backgroundKey} proprietorName={proprietorName} />
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="mb-4 text-lg font-black text-slate-950">Published Banners</h3>
              <div className="space-y-4">
                {banners.length ? banners.map((banner) => (
                  <div key={banner.id} className="grid gap-4 rounded-3xl border border-slate-200 bg-slate-50 p-3 md:grid-cols-[180px_1fr]">
                    <StableImage
                      src={banner.mobile_image_url || banner.desktop_image_url}
                      alt={banner.title}
                      containerClassName="aspect-[16/9] overflow-hidden rounded-2xl bg-white"
                      className="h-full w-full object-cover"
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-3 py-1 text-xs font-black uppercase ${banner.status === "published" ? "bg-emerald-100 text-emerald-700" : banner.status === "paused" ? "bg-amber-100 text-amber-700" : "bg-slate-200 text-slate-600"}`}>
                          {banner.status}
                        </span>
                        <span className="text-xs font-bold text-slate-500">{formatDateTime(banner.created_at)}</span>
                      </div>
                      <div className="mt-2 truncate text-base font-black text-slate-950">{banner.title}</div>
                      <div className="mt-1 text-sm font-semibold text-slate-500">
                        {banner.cities?.name || "City"} • {banner.shops?.name || "Shop"}
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => updateBannerStatus(banner, banner.status === "published" ? "paused" : "published")}
                          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-black text-white"
                        >
                          {banner.status === "published" ? <FaPause /> : <FaPlay />}
                          {banner.status === "published" ? "Pause" : "Publish"}
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteBanner(banner)}
                          className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-xs font-black text-white"
                        >
                          <FaTrashCan /> Delete
                        </button>
                      </div>
                    </div>
                  </div>
                )) : (
                  <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
                    <FaImage className="mx-auto mb-3 text-3xl text-slate-300" />
                    <p className="font-bold text-slate-500">No featured city banners published yet.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

    </StaffPortalShell>
  )
}
