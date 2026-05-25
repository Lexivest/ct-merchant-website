import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  FaArrowLeft,
  FaBuildingCircleCheck,
  FaBullhorn,
  FaCamera,
  FaChartLine,
  FaCheck,
  FaCheckDouble,
  FaCopy,
  FaDownload,
  FaEye,
  FaFileInvoiceDollar,
  FaGear,
  FaHourglassHalf,
  FaIdCard,
  FaLock,
  FaPenToSquare,
  FaShareNodes,
  FaStoreSlash,
  FaTriangleExclamation,
  FaVideo,
  FaVideoSlash,
  FaWandMagicSparkles,
  FaWhatsapp,
} from "react-icons/fa6"
import { FaRegSquarePlus } from "react-icons/fa6"
import RetryingNotice, {
  getRetryingMessage,
} from "../components/common/RetryingNotice"
import PageTransitionOverlay from "../components/common/PageTransitionOverlay"
import { useGlobalFeedback } from "../components/common/GlobalFeedbackProvider"
import { PageLoadingScreen } from "../components/common/PageStatusScreen"
import useAuthSession from "../hooks/useAuthSession"
import useCachedFetch, {
  clearCachedFetchStore,
  primeCachedFetchStore,
} from "../hooks/useCachedFetch"
import usePreventPullToRefresh from "../hooks/usePreventPullToRefresh"
import { supabase } from "../lib/supabase"
import { getFriendlyErrorMessage } from "../lib/friendlyErrors"
import { prepareShopDetailTransition } from "../lib/detailPageTransitions"
import { fetchLatestPaymentProof, fetchVerificationAccessStatus } from "../lib/offlinePayments"
import { prepareVendorRouteTransition } from "../lib/vendorRouteTransitions"
import QRCode from "qrcode"

const loadVendorRoutes = {
  "/merchant-add-product": () => import("./vendors/AddProduct"),
  "/merchant-products": () => import("./vendors/MerchantProducts"),
  "/merchant-promo-banner": () => import("./vendors/MerchantPromoBanner"),
  "/merchant-settings": () => import("./vendors/MerchantSettings"),
  "/merchant-news": () => import("./vendors/MerchantNews"),
  "/merchant-video-kyc": () => import("./vendors/MerchantVideoKYC"),
  "/remita": () => import("./vendors/MerchantPayment"),
  "/service-fee": () => import("./vendors/MerchantServiceFee"),
  "/shop-registration": () => import("./ShopRegistration"),
  "/service-provider": () => import("./ServiceProvider"),
}

function isFutureDate(value) {
  if (!value) return false
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return false
  return parsed.getTime() > Date.now()
}

function formatSubscriptionLabel(value) {
  const rawValue = String(value || "").trim()
  if (!rawValue) return "Active Plan"
  if (rawValue === "Free Trial") return "Free Trial"
  return rawValue.replace(/_/g, " ")
}

function VendorsPanelShimmer() {
  return (
    <PageLoadingScreen
      title="Opening vendor tools"
      message="Please wait while we prepare your merchant workspace."
    />
  )
}

function pickPrimaryBusiness(rows = []) {
  return rows[0] || null
}

function VendorsPanel() {
  const navigate = useNavigate()
  const { notify } = useGlobalFeedback()

  usePreventPullToRefresh()

  const { user, loading: authLoading, isOffline } = useAuthSession()
  const [realtimeShop, setRealtimeShop] = useState(null)
  const [verificationAccessOverride, setVerificationAccessOverride] = useState(null)
  const [copiedKey, setCopiedKey] = useState(null)
  const [isSharing, setIsSharing] = useState(false)
  const retryRouteTransitionRef = useRef(null)
  const [routeTransition, setRouteTransition] = useState({
    pending: false,
    error: "",
  })

  const fetchMerchantData = async () => {
    if (!user) throw new Error("Authentication required")

    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("is_suspended")
      .eq("id", user.id)
      .maybeSingle()

    if (profileErr) throw profileErr
    if (profile?.is_suspended) {
      throw new Error(
        "Your account access has been restricted by administration.",
      )
    }

    const { data: shopRows, error: shopErr } = await supabase
      .from("shops")
      .select("*, subscription_end_date")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)

    if (shopErr) throw shopErr
    const shopData = pickPrimaryBusiness(shopRows || [])
    if (!shopData) {
      throw new Error("SHOP_NOT_FOUND")
    }

    if (shopData.status === "rejected" && shopData.kyc_status !== "rejected") {
      const rejectedEntity = shopData.is_service ? "service" : "shop"
      throw new Error(
        `Your ${rejectedEntity} application was rejected. Please contact support.`,
      )
    }

    const { count, error: rejectErr } = await supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", shopData.id)
      .eq("is_approved", false)
      .not("rejection_reason", "is", null)

    const rejectedCount = !rejectErr && count ? count : 0

    const [verificationAccess, latestServiceFeeProof] = await Promise.all([
      fetchVerificationAccessStatus({
        userId: user.id,
        shopId: shopData.id,
        shopCreatedAt: shopData.created_at,
      }),
      fetchLatestPaymentProof({
        userId: user.id,
        shopId: shopData.id,
        paymentKind: "service_fee",
        shopCreatedAt: shopData.created_at,
      }),
    ])

    return {
      shop: shopData,
      rejectedProductCount: rejectedCount,
      hasVerificationAccess: verificationAccess.hasVerificationAccess,
      verificationProofStatus: verificationAccess.verificationProofStatus,
      paymentConfirmed: verificationAccess.paymentConfirmed,
      serviceFeeProofStatus: latestServiceFeeProof?.status || null,
      serviceFeeProofPlan: latestServiceFeeProof?.plan || null,
    }
  }

  const { data, loading, error, mutate } = useCachedFetch(
    `vendor_panel_${user?.id}`,
    fetchMerchantData,
    { dependencies: [user?.id], ttl: 1000 * 60 * 5 },
  )

  useEffect(() => {
    setRealtimeShop(null)
  }, [data?.shop?.id, data?.shop?.is_service])

  useEffect(() => {
    setVerificationAccessOverride(
      data
        ? {
            hasVerificationAccess: Boolean(data.hasVerificationAccess),
            verificationProofStatus: data.verificationProofStatus || null,
            paymentConfirmed: Boolean(data.paymentConfirmed),
          }
        : null,
    )
  }, [data])

  useEffect(() => {
    if (!data?.shop?.id) return

    const missingConfirmedFlag =
      !Object.prototype.hasOwnProperty.call(data, "paymentConfirmed")
    const needsVerificationRefresh =
      missingConfirmedFlag &&
      (data.verificationProofStatus === "approved" ||
        data.hasVerificationAccess === true)

    if (needsVerificationRefresh) {
      mutate()
    }
  }, [
    data,
    data?.hasVerificationAccess,
    data?.shop?.id,
    data?.verificationProofStatus,
    mutate,
  ])

  useEffect(() => {
    if (!user || !data?.shop?.id || isOffline) return

    const shopId = data.shop.id
    const vendorPanelCacheKey = `vendor_panel_${user.id}`

    const shopChannel = supabase
      .channel(`public:shops:id=eq.${shopId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "shops",
          filter: `id=eq.${shopId}`,
        },
        (payload) => {
          const nextShop = payload.new || null
          setRealtimeShop(nextShop)
          if (nextShop) {
            primeCachedFetchStore(vendorPanelCacheKey, {
              ...data,
              shop: {
                ...(data?.shop || {}),
                ...nextShop,
              },
            })
          }
          mutate()
        },
      )
      .subscribe()

    const productChannel = supabase
      .channel(`public:products:shop_id=eq.${shopId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "products",
          filter: `shop_id=eq.${shopId}`,
        },
        () => {
          clearCachedFetchStore(
            (key) =>
              key.startsWith("dashboard_cache_") ||
              key.startsWith("shop_detail_") ||
              key.startsWith("shop_detail_v2_") ||
              key.startsWith("dir_city_") ||
              key.startsWith("search_city_") ||
              key.startsWith("merchant_products_") ||
              key.startsWith("vendor_panel_"),
          )
          mutate()
        },
      )
      .subscribe()

    const paymentChannel = supabase
      .channel(`public:physical_verification_payments:merchant_id=eq.${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "physical_verification_payments",
          filter: `merchant_id=eq.${user.id}`,
        },
        () => {
          mutate()
        },
      )
      .subscribe()

    const verificationProofChannel = supabase
      .channel(`public:offline_payment_proofs:merchant_id=eq.${user.id}:vendor-panel`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "offline_payment_proofs",
          filter: `merchant_id=eq.${user.id}`,
        },
        () => {
          mutate()
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(shopChannel)
      supabase.removeChannel(productChannel)
      supabase.removeChannel(paymentChannel)
      supabase.removeChannel(verificationProofChannel)
    }
  }, [user, data, data?.shop?.id, isOffline, mutate])

  useEffect(() => {
    if (error === "SHOP_NOT_FOUND") {
      navigate("/shop-registration", { replace: true })
    }
  }, [error, navigate])

  if (authLoading || (loading && !data)) {
    return <VendorsPanelShimmer />
  }

  if (error && error !== "SHOP_NOT_FOUND" && !data) {
    return <RetryingNotice message={getRetryingMessage(error)} onRetry={mutate} />
  }

  if (!data?.shop) return null

  const activeShop = realtimeShop || data.shop
  const activeRejectedCount = data.rejectedProductCount

  const isServiceMode = activeShop.is_service === true
  const entityName = isServiceMode ? "service" : "shop"
  const entityTitle = isServiceMode ? "Service" : "Shop"
  const itemNamePlural = isServiceMode ? "services" : "products"
  const itemTitle = isServiceMode ? "Service" : "Product"
  const dashboardTitle = isServiceMode ? "Service Dashboard" : "Merchant Dashboard"
  const viewRoute = isServiceMode
    ? `/service-provider?id=${activeShop.id}&service=${encodeURIComponent(activeShop.category || "")}`
    : `/shop-detail?id=${activeShop.id}`
  const storefrontUrl = isServiceMode
    ? `https://www.ctmerchant.com.ng/service-provider?id=${activeShop.id}&service=${encodeURIComponent(activeShop.category || "")}`
    : `https://www.ctmerchant.com.ng/shop-detail?id=${activeShop.id}`

  const isApplicationApproved = activeShop.status === "approved"
  const isVerified = Boolean(activeShop.is_verified)
  const verificationProofStatus =
    verificationAccessOverride?.verificationProofStatus ?? data.verificationProofStatus ?? null
  const isSuspended = activeShop.is_open === false
  const isSubscriptionActive = isFutureDate(activeShop.subscription_end_date)
  const serviceFeeProofStatus = data.serviceFeeProofStatus ?? null
  const currentSubscriptionLabel = formatSubscriptionLabel(activeShop.subscription_plan)
  const verificationPaymentConfirmed = Boolean(
    verificationAccessOverride?.paymentConfirmed ??
      data.paymentConfirmed ??
      verificationProofStatus === "approved",
  )
  const canOpenKycVideo =
    verificationPaymentConfirmed ||
    activeShop.kyc_status === "submitted" ||
    activeShop.kyc_status === "rejected" ||
    isVerified

  async function handleCopy(text, key) {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedKey(key)
      setTimeout(() => setCopiedKey(null), 2000)
    } catch {
      notify({
        type: "error",
        title: "Copy failed",
        message: "Please copy the text manually.",
      })
    }
  }

  async function shareShopWithImage() {
    if (isSharing) return
    setIsSharing(true)

    const url = storefrontUrl
    const objectUrls = []

    try {
      if (navigator.share) {
        let file = null
        let cityName = null

        // Try to build a product grid using the Canvas API (no server needed)
        try {
          const gridFile = await Promise.race([
            (async () => {
              // Fetch products (up to 12) + city name in parallel
              const [{ data: products }, { data: shopCity }] = await Promise.all([
                supabase
                  .from("products")
                  .select("image_url, name, price, discount_price")
                  .eq("shop_id", activeShop.id)
                  .eq("is_available", true)
                  .eq("is_approved", true)
                  .not("image_url", "is", null)
                  .order("created_at", { ascending: false })
                  .limit(12),
                supabase
                  .from("shops")
                  .select("cities(name)")
                  .eq("id", activeShop.id)
                  .single(),
              ])

              cityName = shopCity?.cities?.name || null

              const validProducts = (products || []).filter((p) => p.image_url)
              if (validProducts.length < 2) return null

              // Split: first 4 for the main grid, rest for the peek strip
              const gridProducts = validProducts.slice(0, 4)
              const peekProducts = validProducts.slice(4)   // may be empty

              // Fetch grid images as blobs (avoids canvas CORS taint)
              const gridSettled = await Promise.allSettled(
                gridProducts.map(async (p, idx) => {
                  const resp = await fetch(p.image_url)
                  const blob = await resp.blob()
                  const objUrl = URL.createObjectURL(blob)
                  objectUrls.push(objUrl)
                  return { objUrl, product: gridProducts[idx] }
                })
              )
              const gridItems = gridSettled
                .filter((r) => r.status === "fulfilled")
                .map((r) => r.value)
              if (gridItems.length < 2) return null

              // Fetch peek images (best-effort, failures silently skipped)
              const peekSettled = await Promise.allSettled(
                peekProducts.map(async (p) => {
                  const resp = await fetch(p.image_url)
                  const blob = await resp.blob()
                  const objUrl = URL.createObjectURL(blob)
                  objectUrls.push(objUrl)
                  return objUrl
                })
              )
              const peekObjUrls = peekSettled
                .filter((r) => r.status === "fulfilled")
                .map((r) => r.value)

              // Load grid Image elements
              const gridImages = await Promise.all(
                gridItems.map(
                  ({ objUrl }) =>
                    new Promise((resolve, reject) => {
                      const img = new window.Image()
                      img.onload = () => resolve(img)
                      img.onerror = reject
                      img.src = objUrl
                    })
                )
              )

              // Load peek Image elements (silently skip failures)
              const peekImages = (
                await Promise.allSettled(
                  peekObjUrls.map(
                    (src) =>
                      new Promise((resolve, reject) => {
                        const img = new window.Image()
                        img.onload = () => resolve(img)
                        img.onerror = reject
                        img.src = src
                      })
                  )
                )
              )
                .filter((r) => r.status === "fulfilled")
                .map((r) => r.value)

              // Generate QR code data URL for the storefront URL
              const qrDataUrl = await QRCode.toDataURL(storefrontUrl, {
                width: 160,
                margin: 1,
                color: { dark: "#0f0f1a", light: "#f8f8ff" },
              })
              const qrImg = await new Promise((resolve, reject) => {
                const img = new window.Image()
                img.onload = () => resolve(img)
                img.onerror = reject
                img.src = qrDataUrl
              })

              // Always produce exactly 8 peek thumbnails by cycling all loaded images
              const PEEK_COUNT = 8
              const allLoaded  = [...gridImages, ...peekImages]
              const peekFill   = Array.from({ length: PEEK_COUNT }, (_, i) => allLoaded[i % allLoaded.length])

              // ── Canvas dimensions ──────────────────────────────────────
              const SIZE     = 1080
              const HALF     = SIZE / 2
              const HEADER_H = 190   // blue banner at top
              const PEEK_H   = 100   // thumbnail strip at bottom
              const GRID_Y   = HEADER_H  // grid starts below header
              const canvas   = document.createElement("canvas")
              canvas.width   = SIZE
              canvas.height  = HEADER_H + SIZE + PEEK_H
              const ctx      = canvas.getContext("2d")

              // Base dark background
              ctx.fillStyle = "#1a1a2e"
              ctx.fillRect(0, 0, SIZE, canvas.height)

              // ── Blue header banner ─────────────────────────────────────
              const hGrad = ctx.createLinearGradient(0, 0, SIZE, HEADER_H)
              hGrad.addColorStop(0,   "#0D47A1")
              hGrad.addColorStop(0.5, "#1565C0")
              hGrad.addColorStop(1,   "#0A3880")
              ctx.fillStyle = hGrad
              ctx.fillRect(0, 0, SIZE, HEADER_H)

              // QR code — right side of header
              const QR_SIZE = 148
              const QR_PAD  = 18
              const qrX     = SIZE - QR_SIZE - QR_PAD
              const qrY     = (HEADER_H - QR_SIZE) / 2

              // White rounded background for QR
              ctx.fillStyle = "#FFFFFF"
              ctx.beginPath()
              ctx.roundRect(qrX - 8, qrY - 8, QR_SIZE + 16, QR_SIZE + 16, 10)
              ctx.fill()
              ctx.drawImage(qrImg, qrX, qrY, QR_SIZE, QR_SIZE)

              // "Scan to visit" under QR
              ctx.font = `500 17px system-ui, Arial, sans-serif`
              ctx.fillStyle = "rgba(255,255,255,0.7)"
              const scanW = ctx.measureText("Scan to visit").width
              ctx.fillText("Scan to visit", qrX + (QR_SIZE - scanW) / 2, qrY + QR_SIZE + 28)

              // Text — all centered within the left portion (before QR)
              const textCenter = qrX / 2
              const maxTextW   = qrX - QR_PAD * 2
              ctx.textAlign = "center"

              // Shop name — white, bold, centered
              ctx.font = `800 34px system-ui, Arial, sans-serif`
              ctx.fillStyle = "#FFFFFF"
              // Truncate if too long for the text area
              let shopNameDisplay = activeShop.name
              while (ctx.measureText(shopNameDisplay).width > maxTextW && shopNameDisplay.length > 4) {
                shopNameDisplay = shopNameDisplay.slice(0, -1)
              }
              if (shopNameDisplay.length < activeShop.name.length) shopNameDisplay = shopNameDisplay.trimEnd() + "…"
              ctx.fillText(shopNameDisplay, textCenter, 48)

              // Pink underline under shop name — centered
              const nameW = Math.min(ctx.measureText(shopNameDisplay).width, maxTextW)
              ctx.fillStyle = "#EC4899"
              ctx.fillRect(textCenter - nameW / 2, 56, nameW, 4)

              // Shop location label — simple, centered
              ctx.font = `400 23px system-ui, Arial, sans-serif`
              ctx.fillStyle = "rgba(255,255,255,0.88)"
              ctx.fillText("📍 Shop Location", textCenter, 102)

              // Website — pink, centered
              ctx.font = `700 22px system-ui, Arial, sans-serif`
              ctx.fillStyle = "#FCA5A5"
              ctx.fillText("www.ctmerchant.com.ng", textCenter, 144)

              // CT ID (7-digit unique_id used in repo search) — centered
              const ctId = activeShop.unique_id || activeShop.id
              ctx.font = `400 19px system-ui, Arial, sans-serif`
              ctx.fillStyle = "rgba(255,255,255,0.5)"
              ctx.fillText(`CT ID: ${ctId}`, textCenter, 178)

              ctx.textAlign = "left"  // reset for rest of canvas
              // ────────────────────────────────────────────────────────────

              // ── Main 2×2 (or 2-col) product grid ──────────────────────
              const count = Math.min(gridImages.length, 4)
              // All cells offset downward by HEADER_H
              const cells =
                count === 2
                  ? [[0, GRID_Y, HALF, SIZE], [HALF, GRID_Y, HALF, SIZE]]
                  : [
                      [0,    GRID_Y,        HALF, HALF],
                      [HALF, GRID_Y,        HALF, HALF],
                      [0,    GRID_Y + HALF, HALF, HALF],
                      [HALF, GRID_Y + HALF, HALF, HALF],
                    ]

              for (let i = 0; i < count; i++) {
                const [cx, cy, cw, ch] = cells[i]
                const img = gridImages[i]
                const scale = Math.max(cw / img.width, ch / img.height)
                const sw = img.width * scale
                const sh = img.height * scale
                const dx = cx + (cw - sw) / 2
                const dy = cy + (ch - sh) / 2
                ctx.save()
                ctx.beginPath()
                ctx.rect(cx, cy, cw, ch)
                ctx.clip()
                ctx.drawImage(img, dx, dy, sw, sh)
                ctx.restore()
              }

              // Grid dividers
              ctx.fillStyle = "rgba(0,0,0,0.6)"
              if (count === 2) {
                ctx.fillRect(HALF - 1, GRID_Y, 3, SIZE)
              } else {
                ctx.fillRect(HALF - 1, GRID_Y, 3, SIZE)
                ctx.fillRect(0, GRID_Y + HALF - 1, SIZE, 3)
              }

              // ── Name / price / badge overlays ──────────────────────────
              for (let i = 0; i < count; i++) {
                const [cx, cy, cw, ch] = cells[i]
                const product = gridItems[i].product
                const hasDiscount =
                  product.discount_price &&
                  Number(product.discount_price) < Number(product.price)

                const isSmall   = ch <= HALF
                const stripH    = isSmall ? 130 : 160
                const nameSize  = isSmall ? 26  : 32
                const priceSize = isSmall ? 28  : 36
                const badgeSize = isSmall ? 22  : 28
                const pad       = isSmall ? 16  : 20
                const stripY    = cy + ch - stripH

                ctx.save()
                ctx.globalAlpha = 0.82
                ctx.fillStyle = "#0a0a14"
                ctx.fillRect(cx, stripY, cw, stripH)
                ctx.restore()

                const maxChars = isSmall ? 20 : 25
                const shortName =
                  product.name.length > maxChars
                    ? product.name.slice(0, maxChars - 1) + "…"
                    : product.name
                ctx.font = `700 ${nameSize}px system-ui, Arial, sans-serif`
                ctx.fillStyle = "#FFFFFF"
                ctx.fillText(shortName, cx + pad, stripY + pad + nameSize)

                const displayPrice = hasDiscount
                  ? Number(product.discount_price)
                  : Number(product.price)
                ctx.font = `800 ${priceSize}px system-ui, Arial, sans-serif`
                ctx.fillStyle = "#FFD700"
                ctx.fillText(
                  "N" + Math.round(displayPrice).toLocaleString("en-NG"),
                  cx + pad, stripY + stripH - pad
                )

                if (hasDiscount) {
                  const pct = Math.round(
                    (1 - Number(product.discount_price) / Number(product.price)) * 100
                  )
                  const badgeText = `-${pct}%`
                  ctx.font = `800 ${badgeSize}px system-ui, Arial, sans-serif`
                  const bPad   = isSmall ? 12 : 16
                  const badgeW = ctx.measureText(badgeText).width + bPad * 2
                  const badgeH = badgeSize + bPad
                  const badgeX = cx + cw - badgeW - pad
                  const badgeY = stripY + stripH - badgeH - pad
                  ctx.fillStyle = "#E53E3E"
                  ctx.beginPath()
                  ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 6)
                  ctx.fill()
                  ctx.fillStyle = "#FFFFFF"
                  ctx.fillText(badgeText, badgeX + bPad, badgeY + badgeH - bPad * 0.55)
                }
              }

              // ── Peek strip — 8 visible thumbnails, no dimming ─────────
              {
                const peekY  = HEADER_H + SIZE
                const thumbW = Math.floor(SIZE / PEEK_COUNT)

                for (let i = 0; i < PEEK_COUNT; i++) {
                  const px  = i * thumbW
                  const img = peekFill[i]
                  const scale = Math.max(thumbW / img.width, PEEK_H / img.height)
                  const sw = img.width * scale
                  const sh = img.height * scale
                  const dx = px + (thumbW - sw) / 2
                  const dy = peekY + (PEEK_H - sh) / 2
                  ctx.save()
                  ctx.beginPath()
                  ctx.rect(px, peekY, thumbW, PEEK_H)
                  ctx.clip()
                  ctx.drawImage(img, dx, dy, sw, sh)
                  ctx.restore()
                }

                // Thin dividers only — no fade, no dim
                ctx.fillStyle = "rgba(0,0,0,0.35)"
                for (let i = 1; i < PEEK_COUNT; i++) {
                  ctx.fillRect(i * thumbW, peekY, 1, PEEK_H)
                }
              }
              // ────────────────────────────────────────────────────────────

              // Export as JPEG
              const blob = await new Promise((resolve, reject) =>
                canvas.toBlob(
                  (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
                  "image/jpeg",
                  0.88
                )
              )
              return new File([blob], "shop-products.jpg", { type: "image/jpeg" })
            })(),
            // Timeout — fall through to shop logo if grid takes too long
            new Promise((resolve) => setTimeout(() => resolve(null), 8000)),
          ])

          if (gridFile) file = gridFile
        } catch { /* canvas failed — fall through to shop logo */ }

        // Fall back to shop logo if grid couldn't be built
        if (!file && activeShop.image_url) {
          try {
            const resp = await fetch(activeShop.image_url)
            const blob = await resp.blob()
            file = new File([blob], "shop.jpg", { type: blob.type })
          } catch { /* ignore */ }
        }

        // Build share text — short caption + tappable website link
        const bizHub = cityName ? `${cityName} Biz Hub` : "CTMerchant"
        const title  = `${activeShop.name} | ${bizHub}`
        const text   = [
          `Check out ${activeShop.name} on *${bizHub}* 🛍️ www.ctmerchant.com.ng`,
          activeShop.address ? `📍 ${activeShop.address}` : null,
        ].filter(Boolean).join("\n")

        if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
          // No url — the QR code in the image is the link; passing url adds the
          // ugly ?id= link to the WhatsApp message body
          await navigator.share({ title, text, files: [file] })
        } else {
          // No image — include the url so the recipient can still navigate
          await navigator.share({ title, text, url })
        }
      } else {
        // Desktop fallback — copy text to clipboard
        const text = `Check out ${activeShop.name} on CTMerchant.${activeShop.address ? `\n📍 ${activeShop.address}` : ""}\n${url}`
        await navigator.clipboard.writeText(text)
        notify({ type: "success", title: "Link copied", message: "Your shop link was copied to your clipboard." })
      }
    } catch {
      // User cancelled or share failed — silently ignore
    } finally {
      objectUrls.forEach((u) => URL.revokeObjectURL(u))
      setIsSharing(false)
    }
  }

  function beginRouteTransition(retryAction = null) {
    retryRouteTransitionRef.current = retryAction
    setRouteTransition({
      pending: true,
      error: "",
    })
  }

  function failRouteTransition(message, retryAction = null) {
    retryRouteTransitionRef.current = retryAction
    setRouteTransition({
      pending: false,
      error: message,
    })
  }

  async function handleVerificationGateway() {
    if (!user?.id || !activeShop?.id) return

    if (isOffline) {
      failRouteTransition("Network unavailable. Retry.", () =>
        handleVerificationGateway(),
      )
      return
    }

    const retryAction = () => handleVerificationGateway()
    beginRouteTransition(retryAction)

    try {
      const { data: latestShop, error: latestShopError } = await supabase
        .from("shops")
        .select("id, owner_id, created_at, status, is_verified, kyc_status, rejection_reason, subscription_end_date, is_open, name, is_service, category")
        .eq("id", activeShop.id)
        .eq("owner_id", user.id)
        .maybeSingle()

      if (latestShopError || !latestShop) {
        throw latestShopError || new Error("Shop not found or access denied.")
      }

      const latestVerificationAccess = await fetchVerificationAccessStatus({
        userId: user.id,
        shopId: latestShop.id,
        shopCreatedAt: latestShop.created_at,
      })

      setRealtimeShop((current) => ({
        ...(current || {}),
        ...latestShop,
      }))
      setVerificationAccessOverride({
        hasVerificationAccess: latestVerificationAccess.hasVerificationAccess,
        verificationProofStatus: latestVerificationAccess.verificationProofStatus || null,
        paymentConfirmed: latestVerificationAccess.paymentConfirmed,
      })

      primeCachedFetchStore(`vendor_panel_${user.id}`, {
        ...(data || {}),
        shop: {
          ...(data?.shop || {}),
          ...latestShop,
        },
        hasVerificationAccess: latestVerificationAccess.hasVerificationAccess,
        verificationProofStatus:
          latestVerificationAccess.verificationProofStatus || null,
        paymentConfirmed: latestVerificationAccess.paymentConfirmed,
      })

      if (latestShop.status !== "approved") {
        setRouteTransition({ pending: false, error: "" })
        notify({
          kind: "toast",
          type: "info",
          title: "Application pending",
          message:
            `Your ${entityName} application must be approved before you can continue to physical verification.`,
        })
        return
      }

      if (latestShop.is_verified || latestShop.kyc_status === "submitted") {
        setRouteTransition({ pending: false, error: "" })
        notify({
          kind: "toast",
          type: "info",
          title: "KYC in review",
          message:
            "Your video KYC is already under review. We will notify you once approved.",
        })
        return
      }

      if (latestVerificationAccess.verificationProofStatus === "pending") {
        setRouteTransition({ pending: false, error: "" })
        notify({
          kind: "toast",
          type: "info",
          title: "Receipt under review",
          message:
            "Your verification receipt has been submitted and is waiting for staff confirmation.",
        })
        return
      }

      const targetPath =
        latestVerificationAccess.paymentConfirmed ||
        latestShop.kyc_status === "rejected"
          ? `/merchant-video-kyc?shop_id=${latestShop.id}`
          : `/remita?shop_id=${latestShop.id}`

      const [pathname] = targetPath.split("?")
      const prefetchedData = await prepareVendorRouteTransition({
        path: targetPath,
        userId: user.id,
        shopId: latestShop.id,
      })

      if (!prefetchedData) {
        const loader = loadVendorRoutes[pathname]
        if (loader) {
          await loader()
        }
      }

      setRouteTransition({ pending: false, error: "" })
      navigate(targetPath, {
        state: {
          fromVendorTransition: true,
          prefetchedData,
          verifiedSubscriptionActive: isFutureDate(
            latestShop.subscription_end_date,
          ),
        },
      })
    } catch (error) {
      failRouteTransition(
        getFriendlyErrorMessage(
          error,
          "We could not open that verification step right now. Please try again.",
        ),
        retryAction,
      )
    }
  }

  async function openVendorRouteWithTransition(path) {
    if (!path) return

    const retryAction = () => openVendorRouteWithTransition(path)
    beginRouteTransition(retryAction)

    try {
      if (path.startsWith("/service-provider")) {
        const [pathname] = path.split("?")
        const loader = loadVendorRoutes[pathname]
        if (loader) {
          await loader()
        }
      } else if (path.startsWith("/shop-detail")) {
        await prepareShopDetailTransition({
          shopId: activeShop.id,
          userId: user?.id || null,
        })
      } else {
        const [pathname] = path.split("?")
        const prefetchedData = await prepareVendorRouteTransition({
          path,
          userId: user?.id || null,
          shopId: activeShop.id,
        })

        if (!prefetchedData) {
          const loader = loadVendorRoutes[pathname]
          if (loader) {
            await loader()
          }
        }

        setRouteTransition({ pending: false, error: "" })
        navigate(path, {
          state: {
            fromVendorTransition: true,
            prefetchedData,
            verifiedSubscriptionActive: isSubscriptionActive,
          },
        })
        return
      }

      setRouteTransition({ pending: false, error: "" })
      navigate(path, {
        state: {
          fromVendorTransition: true,
          verifiedSubscriptionActive: isSubscriptionActive,
        },
      })
    } catch (error) {
      failRouteTransition(
        getFriendlyErrorMessage(
          error,
          "We could not open that merchant tool right now. Please try again.",
        ),
        retryAction,
      )
    }
  }

  const handleCardClick = (path, action) => {
    if (isOffline) {
      if (path) {
        failRouteTransition("Network unavailable. Retry.", () =>
          openVendorRouteWithTransition(path),
        )
        return
      }

      notify({
        type: "error",
        title: "Network unavailable",
        message:
          "You must be connected to the internet to perform this action.",
      })
      return
    }

    if (action) {
      action()
    } else if (path) {
      void openVendorRouteWithTransition(path)
    }
  }

  const showSubscriptionRequired = (message) => {
    notify({
      type: "error",
      title: "Subscription required",
      message,
    })
  }

  return (
    <>
      <PageTransitionOverlay
        visible={routeTransition.pending}
        error={routeTransition.error}
        onRetry={() => {
          if (typeof retryRouteTransitionRef.current === "function") {
            retryRouteTransitionRef.current()
          }
        }}
        onDismiss={() => setRouteTransition({ pending: false, error: "" })}
      />
      <div
        className={`flex min-h-screen flex-col bg-[#F3F4F6] text-[#0F1111] ${
          routeTransition.pending ? "pointer-events-none select-none" : ""
        }`}
      >
      <header className="sticky top-0 z-50 bg-[#131921] shadow-[0_4px_6px_rgba(0,0,0,0.1)]">
        <div className="mx-auto flex w-full max-w-[1000px] items-center gap-4 px-4 py-3 text-white">
          <button
            onClick={() => navigate("/user-dashboard")}
            className="ml-[-4px] p-1 text-[1.2rem] transition hover:text-pink-500"
          >
            <FaArrowLeft />
          </button>
          <div className="truncate text-[1.15rem] font-bold tracking-[0.5px]">
            {dashboardTitle}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1000px] flex-1 px-5 pb-8 pt-3">
        <div className="mb-4">
          <div className="inline-flex max-w-full rounded-full bg-pink-100 px-3 py-1.5 text-[0.9rem] font-extrabold leading-snug text-pink-700 ring-1 ring-pink-200">
            <span className="min-w-0 whitespace-normal break-words">
              Manage {activeShop.name}
            </span>
          </div>

          {activeShop.status === "pending" && (
            <div className="mt-4 flex items-center gap-2.5 rounded-lg border border-[#FDE68A] border-l-4 border-l-[#D97706] bg-[#FEF3C7] px-4 py-3 text-[0.9rem] font-semibold leading-[1.4] text-[#92400E]">
              <FaTriangleExclamation className="shrink-0 text-[1.2rem]" />
              <span>Your {entityName} application is pending staff review.</span>
            </div>
          )}

          {activeShop.kyc_status === "rejected" && (
            <div className="mt-4 flex items-center gap-2.5 rounded-lg border border-[#FECACA] border-l-4 border-l-[#DC2626] bg-[#FEE2E2] px-4 py-3 text-[0.9rem] font-semibold leading-[1.4] text-[#991B1B]">
              <FaVideoSlash className="shrink-0 text-[1.2rem]" />
              <span>
                KYC REJECTED:{" "}
                {activeShop.rejection_reason ||
                  "Your video did not meet our standards."}{" "}
                Please click the red "Record Video" card below to try again.
              </span>
            </div>
          )}

          {isSuspended && (
            <div className="mt-4 flex items-center gap-2.5 rounded-lg border border-[#FECACA] border-l-4 border-l-[#DC2626] bg-[#FEE2E2] px-4 py-3 text-[0.9rem] font-semibold leading-[1.4] text-[#991B1B]">
              <FaLock className="shrink-0 text-[1.2rem]" />
              <span>
                Your {entityName} has been locked by administration. It is no longer
                visible to the public. Please contact support.
              </span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] sm:gap-5">
          {!isApplicationApproved ? (
            <DashCard
              title="Application Pending"
              subtitle="Staff Review"
              icon={<FaHourglassHalf />}
              isLocked={true}
              featured
              onClick={() =>
                notify({
                  type: "info",
                  title: "Application under review",
                  message:
                    `Your ${entityName} application is waiting for CTMerchant staff approval.`,
                })
              }
            />
          ) : isVerified ? (
            <DashCard
              title={`Verified ${entityTitle}`}
              subtitle="Verification Complete"
              icon={<FaCheckDouble />}
              colorClass="bg-[#DCFCE7] text-[#16A34A]"
              featured
              onClick={() =>
                handleCardClick(null, () =>
                  notify({
                    type: "success",
                    title: `${entityTitle} verified`,
                    message: `Your ${entityName} has completed physical verification and your free trial is active.`,
                  }),
                )
              }
            />
          ) : activeShop.kyc_status === "submitted" ? (
            <DashCard
              title="Physical Verification"
              subtitle="Video Pending Approval"
              icon={<FaHourglassHalf />}
              isLocked={true}
              featured
              onClick={() =>
                notify({
                  type: "info",
                  title: "KYC in review",
                  message:
                    "We are currently reviewing your video KYC. We will notify you once approved.",
                })
              }
            />
          ) : verificationProofStatus === "pending" ? (
            <DashCard
              title="Physical Verification"
              subtitle="Pending Receipt Confirmation"
              icon={<FaHourglassHalf />}
              isLocked={true}
              featured
              onClick={() =>
                notify({
                  type: "info",
                  title: "Receipt under review",
                  message:
                    "Your verification receipt has been submitted and is waiting for staff confirmation.",
                })
              }
            />
          ) : canOpenKycVideo ? (
            activeShop.kyc_status === "rejected" ? (
              <DashCard
                title="Physical Verification"
                subtitle="Re-record Video"
                icon={<FaVideo />}
                colorClass="bg-[#FEE2E2] text-[#DC2626]"
                featured
                onClick={() => handleCardClick(null, handleVerificationGateway)}
              />
            ) : (
              <DashCard
                title="Physical Verification"
                subtitle="Open Video KYC"
                icon={<FaVideo />}
                colorClass="bg-[#FEE2E2] text-[#DC2626]"
                featured
                onClick={() => handleCardClick(null, handleVerificationGateway)}
              />
            )
          ) : (
            <DashCard
              title="Physical Verification"
              subtitle={
                verificationProofStatus === "rejected"
                    ? "Upload Receipt Again"
                    : "Verification Fee"
              }
              icon={<FaBuildingCircleCheck />}
              colorClass="bg-[#FEF3C7] text-[#D97706]"
              featured
              onClick={() => handleCardClick(null, handleVerificationGateway)}
            />
          )}

          {!isVerified ? (
            <DashCard
              title="Service Fee"
              subtitle="KYC Required"
              icon={<FaLock />}
              isLocked={true}
              onClick={() =>
                notify({
                  type: "error",
                  title: "Approval required",
                  message:
                    `You cannot subscribe to a service plan until your ${entityName} passes KYC approval.`,
                })
              }
            />
          ) : serviceFeeProofStatus === "pending" ? (
            <DashCard
              title="Service Fee"
              subtitle="Pending Receipt Confirmation"
              icon={<FaHourglassHalf />}
              isLocked={true}
              onClick={() =>
                notify({
                  type: "info",
                  title: "Receipt under review",
                  message:
                    "Your subscription receipt has been submitted and is waiting for staff confirmation.",
                })
              }
            />
          ) : (
            <DashCard
              title="Service Fee"
              subtitle={
                isSubscriptionActive
                  ? `${currentSubscriptionLabel} Active`
                  : serviceFeeProofStatus === "rejected"
                    ? "Upload Receipt Again"
                    : "Choose Plan"
              }
              icon={<FaFileInvoiceDollar />}
              colorClass="bg-pink-100 text-pink-600"
              onClick={() =>
                handleCardClick(`/service-fee?shop_id=${activeShop.id}`)
              }
            />
          )}

          <DashCard
            title={`Add ${itemTitle}`}
            icon={<FaRegSquarePlus />}
            colorClass="bg-[#DCFCE7] text-[#16A34A]"
            isLocked={!isApplicationApproved || isSuspended}
            onClick={
              isApplicationApproved && !isSuspended
                ? () =>
                    handleCardClick(
                      `/merchant-add-product?shop_id=${activeShop.id}`,
                    )
                : () =>
                    notify({
                      type: "error",
                      title: isSuspended ? `${entityTitle} restricted` : "Approval required",
                      message:
                        isSuspended
                          ? `Your ${entityName} access has been restricted by administration.`
                          : `Your ${entityName} must be approved before you can add ${itemNamePlural}.`,
                    })
            }
          />

          <DashCard
            title={`Edit ${itemNamePlural.charAt(0).toUpperCase()}${itemNamePlural.slice(1)}`}
            icon={<FaPenToSquare />}
            colorClass="bg-[#DBEAFE] text-[#2563EB]"
            badge={activeRejectedCount}
            isLocked={!isApplicationApproved || isSuspended}
            onClick={
              isApplicationApproved && !isSuspended
                ? () =>
                    handleCardClick(`/merchant-products?shop_id=${activeShop.id}`)
                : () =>
                    notify({
                      type: "error",
                      title: isSuspended ? `${entityTitle} restricted` : "Approval required",
                      message:
                        isSuspended
                          ? `Your ${entityName} access has been restricted by administration.`
                          : `Your ${entityName} must be approved before you can edit ${itemNamePlural}.`,
                    })
            }
          />

          <DashCard
            title={`${entityTitle} Banner`}
            icon={<FaCamera />}
            colorClass="bg-[#F3E8FF] text-[#9333EA]"
            isLocked={!isApplicationApproved || isSuspended}
            onClick={
              isApplicationApproved && !isSuspended
                ? () => handleCardClick(`/merchant-banner?shop_id=${activeShop.id}`)
                : () =>
                    notify({
                      type: "error",
                      title: isSuspended ? `${entityTitle} restricted` : "Approval required",
                      message:
                        isSuspended
                          ? `Your ${entityName} access has been restricted by administration.`
                          : `Your ${entityName} must be approved before you can manage your banner.`,
                    })
            }
          />

          <DashCard
            title={`${entityTitle} Settings`}
            icon={<FaGear />}
            colorClass="bg-[#FFEDD5] text-[#EA580C]"
            isLocked={!isApplicationApproved || isSuspended}
            onClick={
              isApplicationApproved && !isSuspended
                ? () => handleCardClick(`/merchant-settings?shop_id=${activeShop.id}`)
                : () =>
                    notify({
                      type: "error",
                      title: isSuspended ? `${entityTitle} restricted` : "Approval required",
                      message:
                        isSuspended
                          ? `Your ${entityName} access has been restricted by administration.`
                          : `Your ${entityName} must be approved before you can update ${entityName} settings.`,
                    })
            }
          />

          <DashCard
            title={isServiceMode ? "Service News" : "Post News"}
            icon={<FaBullhorn />}
            colorClass="bg-[#FEE2E2] text-[#DC2626]"
            isLocked={!isApplicationApproved || isSuspended}
            onClick={
              isApplicationApproved && !isSuspended
                ? () => handleCardClick(`/merchant-news?shop_id=${activeShop.id}`)
                : () =>
                    notify({
                      type: "error",
                      title: isSuspended ? `${entityTitle} restricted` : "Approval required",
                      message:
                        isSuspended
                          ? `Your ${entityName} access has been restricted by administration.`
                          : `Your ${entityName} must be approved before you can publish ${entityName} news.`,
                    })
            }
          />

          {isSuspended ? (
            <DashCard
              title={`View ${entityTitle}`}
              subtitle="Suspended"
              icon={<FaStoreSlash />}
              isLocked={true}
              onClick={() =>
                notify({
                  type: "error",
                  title: `${entityTitle} restricted`,
                  message:
                    `Your ${entityName} access has been restricted by administration.`,
                })
              }
            />
          ) : (
            <DashCard
              title={`View ${entityTitle}`}
              icon={<FaEye />}
              colorClass="bg-[#E0E7FF] text-[#4F46E5]"
              onClick={() => handleCardClick(viewRoute)}
            />
          )}

          <DashCard
            title="Promo Banner"
            subtitle="Custom Ad Studio"
            icon={<FaWandMagicSparkles />}
            colorClass="bg-[#FDF2F8] text-[#db2777]"
            isLocked={!isSubscriptionActive}
            onClick={
              !isSubscriptionActive
                ? () =>
                    showSubscriptionRequired(
                      "An active service plan is required before you can open the promo banner studio."
                    )
                : () =>
                    handleCardClick(
                      `/merchant-promo-banner?shop_id=${activeShop.id}`,
                    )
            }
          />

          <DashCard
            title="Analytics"
            icon={<FaChartLine />}
            colorClass="bg-[#CCFBF1] text-[#0D9488]"
            isLocked={!isSubscriptionActive}
            onClick={
              isSubscriptionActive
                ? () =>
                    handleCardClick(`/merchant-analytics?shop_id=${activeShop.id}`)
                : () =>
                    showSubscriptionRequired(
                      "An active service plan is required before you can access analytics."
                    )
            }
          />
        </div>

        {isApplicationApproved && (
          <a
            href="https://whatsapp.com/channel/0029VbCWRCpE50Uf8EyYIl1G"
            target="_blank"
            rel="noreferrer"
            className="mt-6 flex items-center gap-3 rounded-2xl border border-[#25D366]/30 bg-gradient-to-r from-[#f0fdf4] to-[#dcfce7] px-4 py-3.5 shadow-sm transition hover:shadow-md hover:border-[#25D366]/60 group"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#25D366] text-white shadow-sm text-xl">
              <FaWhatsapp />
            </div>
            <div className="flex-1 min-w-0">
              <p className="truncate text-[0.85rem] font-extrabold text-slate-900">
                CTMerchant Official WhatsApp Channel
              </p>
              <p className="mt-0.5 truncate text-[0.73rem] font-semibold text-slate-500">
                Updates, tips &amp; announcements for verified merchants
              </p>
            </div>
            <div className="shrink-0 whitespace-nowrap rounded-xl bg-[#25D366] px-4 py-2 text-[0.75rem] font-extrabold text-white shadow-sm transition group-hover:bg-[#1ebe5d]">
              Follow
            </div>
          </a>
        )}

        {/* ── Store Identity Card ─────────────────────────────────── */}
        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {/* Card header */}
          <div className="flex items-center gap-3 bg-[#131921] px-4 py-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white text-base">
              <FaIdCard />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[0.88rem] font-extrabold text-white">Store Identity</div>
              <div className="text-[0.72rem] font-medium text-white/50">Your unique ID &amp; shareable storefront link</div>
            </div>
          </div>

          <div className="divide-y divide-slate-100">
            {/* CT-ID row */}
            <div className="flex items-center gap-3 px-4 py-3.5">
              <div className="flex-1 min-w-0">
                <div className="text-[0.68rem] font-bold uppercase tracking-widest text-slate-400">CT-ID</div>
                <div className="mt-0.5 font-mono text-[1.1rem] font-extrabold text-[#0F1111]">
                  {activeShop.unique_id || "Pending"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleCopy(activeShop.unique_id || "", "ct-id")}
                className="flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[0.78rem] font-bold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
              >
                {copiedKey === "ct-id" ? (
                  <><FaCheck className="text-green-600" /><span className="text-green-600">Copied!</span></>
                ) : (
                  <><FaCopy /> Copy</>
                )}
              </button>
            </div>

            {/* Storefront URL row */}
            <div className="flex flex-col gap-2.5 px-4 py-3.5">
              <div className="min-w-0">
                <div className="text-[0.68rem] font-bold uppercase tracking-widest text-slate-400">Storefront URL</div>
                <div className="mt-0.5 truncate text-[0.8rem] font-semibold text-[#2563EB]" title={storefrontUrl}>
                  {storefrontUrl}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleCopy(storefrontUrl, "store-url")}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[0.78rem] font-bold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
                >
                  {copiedKey === "store-url" ? (
                    <><FaCheck className="text-green-600" /><span className="text-green-600">Copied!</span></>
                  ) : (
                    <><FaCopy /> Copy</>
                  )}
                </button>
                <button
                  type="button"
                  onClick={shareShopWithImage}
                  disabled={isSharing}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-pink-200 bg-pink-50 px-3 py-2 text-[0.78rem] font-bold text-pink-600 transition hover:bg-pink-100 hover:border-pink-300 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isSharing ? (
                    <><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-pink-300 border-t-pink-600" />Building…</>
                  ) : (
                    <><FaShareNodes /> Share</>
                  )}
                </button>
              </div>
            </div>

            {/* Merchant Guide download row */}
            <div className="flex items-center justify-between gap-3 px-4 py-3 bg-slate-50/60">
              <div className="flex-1 min-w-0">
                <div className="text-[0.68rem] font-bold uppercase tracking-widest text-slate-400">Merchant Guide</div>
                <div className="mt-0.5 text-[0.78rem] font-semibold text-slate-500">Official onboarding &amp; seller manual</div>
              </div>
              <a
                href="https://xdchacdjcgazyckacbpc.supabase.co/storage/v1/object/public/brand-assets/CTMerchant_Merchant_Onboarding_Manual.pdf"
                target="_blank"
                rel="noreferrer"
                className="flex shrink-0 items-center gap-1.5 rounded-xl border border-pink-200 bg-pink-50 px-3 py-2 text-[0.78rem] font-bold text-pink-600 transition hover:bg-pink-100 hover:border-pink-300"
              >
                <FaDownload /> Download
              </a>
            </div>
          </div>
        </div>
        {/* ────────────────────────────────────────────────────────── */}
      </main>
      </div>
    </>
  )
}

function DashCard({
  title,
  subtitle,
  icon,
  colorClass,
  badge,
  isLocked,
  onClick,
  featured = false,
}) {
  const outerClass = featured ? "col-span-2 sm:col-span-2" : ""
  const lockedHeightClass = featured ? "min-h-[148px] sm:min-h-[156px]" : "min-h-[125px] sm:min-h-[140px]"
  const activeHeightClass = featured ? "min-h-[148px] sm:min-h-[156px]" : "min-h-[125px] sm:min-h-[140px]"
  const activeIconClass = featured
    ? "mb-4 h-[52px] w-[52px] text-[1.45rem] sm:h-[58px] sm:w-[58px] sm:text-[1.55rem]"
    : "mb-3 h-[42px] w-[42px] text-[1.2rem] sm:h-[50px] sm:w-[50px] sm:text-[1.4rem]"
  const lockedIconClass = featured
    ? "mb-4 h-[52px] w-[52px] text-[1.45rem] sm:h-[58px] sm:w-[58px] sm:text-[1.55rem]"
    : "mb-3 h-[42px] w-[42px] text-[1.2rem] sm:h-[50px] sm:w-[50px] sm:text-[1.4rem]"
  const titleClass = featured
    ? "text-[0.95rem] font-extrabold sm:text-[1.05rem]"
    : "text-[0.85rem] font-extrabold sm:text-[0.95rem]"
  const subtitleClass = featured
    ? "mt-1.5 text-[0.78rem] font-semibold sm:text-[0.82rem]"
    : "mt-1 text-[0.7rem] font-semibold sm:text-[0.75rem]"

  if (isLocked) {
    return (
      <div
        onClick={onClick}
        className={`${outerClass} cursor-not-allowed rounded-[22px] bg-slate-200 p-1 transition-all`}
      >
        <div className={`relative flex h-full flex-col items-center justify-center rounded-[18px] border border-slate-200 bg-[#F7F7F7] p-4 text-center text-[#565959] ${lockedHeightClass}`}>
          <div className={`flex items-center justify-center rounded-full bg-[#E2E8F0] text-[#888C8C] ${lockedIconClass}`}>
            {icon}
          </div>
          <div className={titleClass}>
            {title}
          </div>
          {subtitle && (
            <div className={subtitleClass}>
              {subtitle}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      onClick={onClick}
      className={`${outerClass} cursor-pointer rounded-[22px] bg-pink-200 p-1 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:bg-pink-300 hover:shadow-[0_8px_16px_rgba(219,39,119,0.15)]`}
    >
      <div className={`relative flex h-full flex-col items-center justify-center rounded-[18px] border border-pink-100 bg-white p-4 text-center ${activeHeightClass}`}>
        {badge > 0 && (
          <div className="absolute right-3 top-3 flex h-6 min-w-[24px] animate-[popIn_0.4s_cubic-bezier(0.175,0.885,0.32,1.275)_forwards] items-center justify-center rounded-full border-2 border-white bg-[#DC2626] px-1.5 text-[0.75rem] font-extrabold text-white shadow-[0_2px_6px_rgba(220,38,38,0.5)]">
            {badge}
          </div>
        )}

        <div
          className={`flex items-center justify-center rounded-full ${activeIconClass} ${colorClass}`}
        >
          {icon}
        </div>

        <div className={`${titleClass} text-[#0F1111]`}>
          {title}
        </div>

        {subtitle && (
          <div className={`${subtitleClass} text-[#565959]`}>
            {subtitle}
          </div>
        )}

        <style
          dangerouslySetInnerHTML={{
            __html:
              "@keyframes popIn { from { transform: scale(0); opacity: 0; } to { transform: scale(1); opacity: 1; } }",
          }}
        />
      </div>
    </div>
  )
}

export default VendorsPanel
