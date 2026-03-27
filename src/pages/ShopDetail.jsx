import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import {
  FaAddressBook,
  FaArrowLeft,
  FaBoxOpen,
  FaBullhorn,
  FaCircleCheck,
  FaCircleInfo,
  FaGlobe,
  FaLocationDot,
  FaMapLocationDot,
  FaShareNodes,
  FaShield,
  FaStore,
  FaTriangleExclamation,
  FaXTwitter,
  FaTiktok,
} from "react-icons/fa6"
import {
  FaFacebookF,
  FaInstagram,
  FaPhone,
  FaWhatsapp,
} from "react-icons/fa"
import L from "leaflet"
import "leaflet/dist/leaflet.css"

import { supabase } from "../lib/supabase"
import useAuthSession from "../hooks/useAuthSession"
import useCachedFetch from "../hooks/useCachedFetch"
import { ShimmerBlock } from "../components/common/Shimmers"
import usePreventPullToRefresh from "../hooks/usePreventPullToRefresh"
import StableImage from "../components/common/StableImage"
import PageSeo from "../components/common/PageSeo"

// --- PROFESSIONAL SHIMMER COMPONENT ---
function ShopDetailShimmer() {
  return (
    <div className="min-h-screen bg-[#E3E6E6] pb-10">
      <header className="sticky top-0 z-[100] flex flex-col bg-[#131921] px-4 py-3 shadow">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShimmerBlock className="h-6 w-6 rounded bg-white/20" />
            <ShimmerBlock className="h-6 w-40 rounded bg-white/20" />
          </div>
          <ShimmerBlock className="h-6 w-6 rounded bg-white/20" />
        </div>
      </header>
      <div className="mx-auto max-w-[1600px] px-4 pt-6">
        {/* Banner Skeleton */}
        <ShimmerBlock className="mx-auto mb-6 aspect-video max-h-[400px] w-full max-w-[1000px] rounded-xl" />
        
        {/* Section Skeleton */}
        <div className="mb-2 rounded-lg bg-white p-6 shadow-sm">
          <ShimmerBlock className="mb-6 h-8 w-48 rounded" />
          <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-5">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="flex flex-col gap-2">
                <ShimmerBlock className="aspect-square w-full rounded-md" />
                <ShimmerBlock className="h-4 w-3/4 rounded" />
                <ShimmerBlock className="h-4 w-1/2 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function ShopDetail() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const shopId = searchParams.get("id")

  usePreventPullToRefresh()

  // 1. Unified Auth State
  const { user, loading: authLoading } = useAuthSession()

  // 2. Data Fetching Logic (Extracted for useCachedFetch)
  const fetchShopData = async () => {
    const { data: shopData, error: shopError } = await supabase
      .from("shops")
      .select("*")
      .eq("id", shopId)
      .maybeSingle()

    if (shopError || !shopData) {
      throw new Error(
        !user
          ? "This shop may be restricted. Try signing in to view it."
          : "This shop could not be found or has been removed from the platform."
      )
    }

    let cityName = "Local"
    let fetchedProducts = []
    let fetchedLikeCount = 0
    let fetchedApprovedNews = []
    let fetchedShopBanner = ""
    let fetchedHasLiked = false

    const tasks = []

    if (shopData.city_id) {
      tasks.push(
        supabase
          .from("cities")
          .select("name")
          .eq("id", shopData.city_id)
          .maybeSingle()
          .then((res) => { if (res.data?.name) cityName = res.data.name })
      )
    }

    tasks.push(
      supabase
        .from("products")
        .select("*")
        .eq("shop_id", shopId)
        .eq("is_available", true)
        .order("id", { ascending: true })
        .then((res) => {
          if (res.error) throw res.error
          fetchedProducts = res.data || []
        })
    )

    tasks.push(
      supabase
        .from("shop_likes")
        .select("id", { count: "exact", head: true })
        .eq("shop_id", shopId)
        .then((res) => {
          if (res.error) throw res.error
          fetchedLikeCount = res.count || 0
        })
    )

    tasks.push(
      supabase
        .from("shop_banners_news")
        .select("content_type, content_data")
        .eq("shop_id", shopId)
        .eq("status", "approved")
        .order("created_at", { ascending: false })
        .then((res) => {
          if (res.error) throw res.error
          const rows = res.data || []
          fetchedApprovedNews = rows
            .filter((item) => item.content_type === "news")
            .map((item) => item.content_data)
            .filter(Boolean)

          const banners = rows.filter((item) => item.content_type === "banner")
          if (banners.length > 0) {
            fetchedShopBanner = banners[0]?.content_data || ""
          }
        })
    )

    if (user?.id) {
      tasks.push(
        supabase
          .from("shop_likes")
          .select("id")
          .eq("shop_id", shopId)
          .eq("user_id", user.id)
          .maybeSingle()
          .then((res) => {
            fetchedHasLiked = Boolean(res.data)
          })
      )

      if (user.id !== shopData.owner_id) {
        supabase
          .from("shop_views")
          .insert({ shop_id: shopId, viewer_id: user.id })
          .then(() => {})
          .catch(() => {})
      }
    }

    await Promise.all(tasks)

    return {
      shop: { ...shopData, cities: { name: cityName } },
      products: fetchedProducts,
      likeCount: fetchedLikeCount,
      approvedNews: fetchedApprovedNews,
      shopBanner: fetchedShopBanner,
      hasLiked: fetchedHasLiked,
    }
  }

  // 3. Smart Caching Hook
  // Key includes user?.id so "hasLiked" state caches correctly per user
  const cacheKey = `shop_detail_${shopId}_${user?.id || 'anon'}`
  const { data, loading: dataLoading, error, isOffline } = useCachedFetch(
    cacheKey,
    fetchShopData,
    { dependencies: [shopId, user?.id], ttl: 1000 * 60 * 5 }
  )

  // 4. Local Optimistic State for Interactions
  const [hasLiked, setHasLiked] = useState(false)
  const [likeCount, setLikeCount] = useState(0)
  const [securityModalOpen, setSecurityModalOpen] = useState(false)

  // Sync optimistic state when cached data resolves
  useEffect(() => {
    if (data) {
      setHasLiked(data.hasLiked)
      setLikeCount(data.likeCount)
    }
  }, [data])

  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)

  // Computed Values
  const currentShop = data?.shop
  const products = data?.products || []
  const approvedNews = data?.approvedNews || []
  const shopBanner = data?.shopBanner || ""

  const specialProducts = useMemo(
    () => products.filter((p) => p.discount_price && p.discount_price < p.price),
    [products]
  )

  const usedProducts = useMemo(
    () => products.filter((p) => p.condition === "Fairly Used"),
    [products]
  )

  const newProducts = useMemo(
    () =>
      products.filter(
        (p) => !(p.discount_price && p.discount_price < p.price) && p.condition !== "Fairly Used"
      ),
    [products]
  )

  const tickerText = useMemo(() => {
    const cityName = currentShop?.cities?.name || "Local"
    if (approvedNews.length > 0) return approvedNews.join(" • ")
    return `${cityName} Repository of shops, products and services`
  }, [approvedNews, currentShop])

  // Map Initialization
  useEffect(() => {
    if (!currentShop?.latitude || !currentShop?.longitude || !mapRef.current) return
    if (mapInstanceRef.current) return

    const lat = Number(currentShop.latitude)
    const lng = Number(currentShop.longitude)

    if (Number.isNaN(lat) || Number.isNaN(lng)) return

    const map = L.map(mapRef.current).setView([lat, lng], 15)

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap",
    }).addTo(map)

    L.circleMarker([lat, lng], {
      radius: 8,
      weight: 2,
      color: "#db2777",
      fillColor: "#db2777",
      fillOpacity: 0.9,
    })
      .addTo(map)
      .bindPopup("Shop Location")
      .openPopup()

    mapInstanceRef.current = map

    setTimeout(() => { map.invalidateSize() }, 250)

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
    }
  }, [currentShop])

  function goBackSafe() {
    if (document.referrer && document.referrer.includes(window.location.hostname)) {
      navigate(-1)
      return
    }
    navigate("/user-dashboard")
  }

  async function toggleLike() {
    if (!user?.id) {
      window.alert("Please sign in to like shops.")
      return
    }

    const nextLiked = !hasLiked
    const nextCount = nextLiked ? likeCount + 1 : Math.max(0, likeCount - 1)

    // Optimistic Update
    setHasLiked(nextLiked)
    setLikeCount(nextCount)

    try {
      if (nextLiked) {
        const { error } = await supabase.from("shop_likes").insert({
          shop_id: shopId,
          user_id: user.id,
        })
        if (error) throw error
      } else {
        const { error } = await supabase
          .from("shop_likes")
          .delete()
          .eq("shop_id", shopId)
          .eq("user_id", user.id)
        if (error) throw error
      }
    } catch {
      // Rollback on fail
      setHasLiked(!nextLiked)
      setLikeCount(likeCount)
    }
  }

  function openGoogleMaps() {
    if (!currentShop?.latitude || !currentShop?.longitude) return
    window.open(
      `https://www.google.com/maps/search/?api=1&query=$${currentShop.latitude},${currentShop.longitude}`,
      "_blank",
      "noopener,noreferrer"
    )
  }

  async function launchWhatsApp() {
    setSecurityModalOpen(false)
    if (!currentShop?.whatsapp) return

    let phone = currentShop.whatsapp.replace(/\D/g, "")
    if (phone.startsWith("0")) phone = `234${phone.slice(1)}`

    const text = `Hello ${currentShop.name}, I found your shop on CTMerchant.`
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer")

    if (user?.id) {
      await supabase
        .from("whatsapp_clicks")
        .insert({ clicker_id: user.id, shop_id: shopId })
        .then(() => {})
        .catch(() => {})
    }
  }

  async function shareShop() {
    if (!currentShop) return
    const shareData = {
      title: currentShop.name,
      text: `Check out ${currentShop.name} on CTMerchant!`,
      url: window.location.href,
    }
    try {
      if (navigator.share) {
        await navigator.share(shareData)
        return
      }
      await navigator.clipboard.writeText(window.location.href)
      window.alert("Link copied to clipboard!")
    } catch { /* ignore */ }
  }

  function formatPrice(value) {
    if (value === null || value === undefined || value === "") return ""
    return `₦${Number(value).toLocaleString()}`
  }

  function renderProductCard(product) {
    const hasDiscount = product.discount_price && Number(product.discount_price) < Number(product.price)
    const percent = hasDiscount
      ? Math.round(((Number(product.price) - Number(product.discount_price)) / Number(product.price)) * 100)
      : 0
    const priceClass = hasDiscount ? "prod-price flash-price" : "prod-price"

    return (
      <div
        key={product.id}
        className="product-card relative flex cursor-pointer flex-col transition hover:-translate-y-1 hover:opacity-90"
        onClick={() => navigate(`/product-detail?id=${product.id}`)}
      >
        <div className="prod-img-wrap relative aspect-square w-full overflow-hidden bg-white">
          <StableImage
            src={product.image_url}
            alt={product.name}
            containerClassName="h-full w-full bg-white"
            className="prod-img h-full w-full object-contain transition duration-300 hover:scale-105"
          />
          {hasDiscount ? (
            <span className="badge badge-discount flash-offer absolute left-1 top-1 z-[2] rounded bg-red-600 px-2 py-1 text-[0.65rem] font-extrabold text-white">
              -{percent}%
            </span>
          ) : null}
          {product.condition === "Fairly Used" ? (
            <span className="badge badge-used absolute right-1 top-1 z-[2] rounded bg-orange-600 px-2 py-1 text-[0.65rem] font-extrabold text-white">
              Fairly Used
            </span>
          ) : null}
        </div>

        <div className="prod-info flex flex-1 flex-col px-1 pt-3">
          <div className="prod-name mb-1 line-clamp-2 text-[0.85rem] font-bold leading-[1.3] text-[#0F1111]" title={product.name}>
            {product.name}
          </div>
          <div className={`${priceClass} mt-auto text-[1.05rem] font-extrabold text-pink-600`}>
            {hasDiscount ? (
              <>
                <span className="prod-old-price mr-1 text-[0.75rem] font-medium text-slate-400 line-through">
                  {formatPrice(product.price)}
                </span>
                {formatPrice(product.discount_price)}
              </>
            ) : (
              formatPrice(product.price)
            )}
          </div>
        </div>
      </div>
    )
  }

  function renderSocialButtons() {
    if (!currentShop) return null
    const links = []

    if (currentShop.whatsapp) {
      links.push(
        <button
          key="whatsapp"
          type="button"
          onClick={() => setSecurityModalOpen(true)}
          title="Chat on WhatsApp"
          className="social-btn animate-[pulse-whatsapp_2s_infinite] rounded-lg border-2 border-[#25D366] bg-[#25D366] text-white shadow-[0_0_0_0_rgba(37,211,102,0.7)] transition hover:-translate-y-0.5 hover:text-white"
        >
          <FaWhatsapp />
        </button>
      )
    }

    if (currentShop.phone) {
      links.push(
        <a
          key="phone"
          href={`tel:${currentShop.phone}`}
          title="Call Business"
          className="social-btn rounded-lg bg-blue-500 text-white transition hover:-translate-y-0.5 hover:text-white"
        >
          <FaPhone />
        </a>
      )
    }

    if (currentShop.website_url) {
      const url = currentShop.website_url.startsWith("http") ? currentShop.website_url : `https://${currentShop.website_url}`
      links.push(
        <a key="website" href={url} target="_blank" rel="noreferrer" title="Visit Website" className="social-btn rounded-lg bg-indigo-600 text-white transition hover:-translate-y-0.5 hover:text-white">
          <FaGlobe />
        </a>
      )
    }

    if (currentShop.facebook_url) {
      const url = currentShop.facebook_url.startsWith("http") ? currentShop.facebook_url : `https://${currentShop.facebook_url}`
      links.push(
        <a key="facebook" href={url} target="_blank" rel="noreferrer" title="Facebook" className="social-btn rounded-lg bg-[#1877F2] text-white transition hover:-translate-y-0.5 hover:text-white">
          <FaFacebookF />
        </a>
      )
    }

    if (currentShop.instagram_url) {
      const url = currentShop.instagram_url.startsWith("http") ? currentShop.instagram_url : `https://${currentShop.instagram_url}`
      links.push(
        <a key="instagram" href={url} target="_blank" rel="noreferrer" title="Instagram" className="social-btn rounded-lg bg-[linear-gradient(45deg,#f09433_0%,#e6683c_25%,#dc2743_50%,#cc2366_75%,#bc1888_100%)] text-white transition hover:-translate-y-0.5 hover:text-white">
          <FaInstagram />
        </a>
      )
    }

    if (currentShop.twitter_url) {
      const url = currentShop.twitter_url.startsWith("http") ? currentShop.twitter_url : `https://${currentShop.twitter_url}`
      links.push(
        <a key="twitter" href={url} target="_blank" rel="noreferrer" title="X (Twitter)" className="social-btn rounded-lg bg-black text-white transition hover:-translate-y-0.5 hover:text-white">
          <FaXTwitter />
        </a>
      )
    }

    if (currentShop.tiktok_url) {
      const url = currentShop.tiktok_url.startsWith("http") ? currentShop.tiktok_url : `https://${currentShop.tiktok_url}`
      links.push(
        <a key="tiktok" href={url} target="_blank" rel="noreferrer" title="TikTok" className="social-btn rounded-lg bg-black text-white transition hover:-translate-y-0.5 hover:text-white">
          <FaTiktok />
        </a>
      )
    }

    if (links.length === 0) {
      return <span className="text-[0.85rem] text-slate-400">No contact information provided.</span>
    }
    return links
  }

  // RETURN STATES
  if (!shopId) {
    goBackSafe()
    return null
  }

  // Show Shimmer while Auth or Data is strictly loading without cache fallback
  if (authLoading || (dataLoading && !data)) {
    return <ShopDetailShimmer />
  }

  // Show Error only if data fails to fetch and there is no cache
  if (error && !data) {
    return (
      <div className="min-h-screen bg-[#E3E6E6]">
        <div className="mx-auto max-w-3xl px-4 py-24 text-center">
          <FaTriangleExclamation className="mx-auto mb-4 text-5xl text-red-700" />
          <h3 className="mb-2 text-2xl font-extrabold text-[#0F1111]">
            Shop Not Found
          </h3>
          <p className="text-slate-600">{error}</p>
          <button
            type="button"
            onClick={() => navigate("/user-dashboard")}
            className="mt-6 rounded-lg border border-slate-300 bg-white px-6 py-3 font-bold text-slate-900 shadow-sm transition hover:bg-slate-50"
          >
            Back to Home
          </button>
        </div>
      </div>
    )
  }

  const shopLogo =
    currentShop?.image_url ||
    `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
      currentShop?.name || "Shop"
    )}`
  const isVerified = Boolean(currentShop?.is_verified)

  return (
    <div className="min-h-screen bg-[#E3E6E6] pb-10">
      <PageSeo
        title={currentShop?.name ? `${currentShop.name} | CTMerchant Shop` : "Shop Details | CTMerchant"}
        description={
          currentShop?.description ||
          "View verified shop details, contact options, maps, and available products on CTMerchant."
        }
        canonicalPath={`/shop-detail${shopId ? `?id=${encodeURIComponent(shopId)}` : ""}`}
        image={shopBanner || shopLogo}
      />
      <div className="mx-auto max-w-[1600px]">
        {/* Offline Banner */}
        {isOffline && (
          <div className="sticky top-0 z-[101] bg-amber-100 px-4 py-2 text-center text-sm font-bold text-amber-800 shadow-sm">
            <i className="fa-solid fa-wifi-slash mr-2"></i>
            You are currently offline. Showing cached shop details.
          </div>
        )}
        
        <header className={`sticky ${isOffline ? 'top-[36px]' : 'top-0'} z-[100] flex flex-col bg-[#131921] text-white shadow-[0_4px_6px_rgba(0,0,0,0.1)]`}>
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={goBackSafe}
                className="shrink-0 text-[1.2rem] transition hover:text-pink-500"
              >
                <FaArrowLeft />
              </button>
              <span className="truncate text-[1.15rem] font-bold tracking-[0.5px]">
                {currentShop?.name || "Shop Details"}
              </span>
            </div>

            <button
              type="button"
              onClick={shareShop}
              className="text-[1.2rem] transition hover:text-pink-500"
            >
              <FaShareNodes />
            </button>
          </div>

          {approvedNews.length > 0 ? (
            <div className="bg-[#232F3E] px-4 py-2 text-white">
              <div className="relative flex items-center gap-3 overflow-hidden">
                <FaBullhorn className="shrink-0 text-pink-500" />
                <div
                  className="whitespace-nowrap pl-[100%]"
                  style={{
                    animation: `ticker ${Math.max(40, tickerText.length * 0.4)}s linear infinite`,
                  }}
                >
                  {tickerText}
                </div>
              </div>
            </div>
          ) : null}
        </header>

        {shopBanner ? (
          <div className="mx-auto max-w-[1000px] px-4 pb-0 pt-6">
            <StableImage
              src={shopBanner}
              alt="Shop Banner"
              containerClassName="aspect-video max-h-[400px] w-full rounded-xl border border-slate-300 bg-slate-100 shadow-[0_4px_12px_rgba(0,0,0,0.08)]"
              className="block h-full w-full object-cover"
            />
          </div>
        ) : null}

        {specialProducts.length > 0 ? (
          <section className="mb-2 border-y border-slate-300 bg-white px-4 py-6">
            <h2 className="mb-4 flex items-center gap-3 text-[1.35rem] font-extrabold text-[#0F1111]">
              <span className="inline-block h-[22px] w-[6px] rounded bg-pink-600" />
              Special Offers
            </h2>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-5">
              {specialProducts.map(renderProductCard)}
            </div>
          </section>
        ) : null}

        {usedProducts.length > 0 ? (
          <section className="mb-2 border-y border-slate-300 bg-white px-4 py-6">
            <h2 className="mb-4 flex items-center gap-3 text-[1.35rem] font-extrabold text-[#0F1111]">
              <span className="inline-block h-[22px] w-[6px] rounded bg-pink-600" />
              Fairly Used Deals
            </h2>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-5">
              {usedProducts.map(renderProductCard)}
            </div>
          </section>
        ) : null}

        {newProducts.length > 0 ? (
          <section className="mb-2 border-y border-slate-300 bg-white px-4 py-6">
            <h2 className="mb-4 flex items-center gap-3 text-[1.35rem] font-extrabold text-[#0F1111]">
              <span className="inline-block h-[22px] w-[6px] rounded bg-pink-600" />
              New Stocks
            </h2>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-5">
              {newProducts.map(renderProductCard)}
            </div>
          </section>
        ) : null}

        {products.length === 0 ? (
          <section className="mb-2 border-y border-slate-300 bg-white px-4 py-16 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-slate-300 bg-slate-50">
              <FaBoxOpen className="text-[28px] text-slate-400" />
            </div>
            <p className="text-[1.1rem] font-bold text-[#0F1111]">
              No products listed yet
            </p>
            <p className="mt-1 text-[0.9rem] text-slate-600">
              Check back later for updates from this merchant.
            </p>
          </section>
        ) : null}

        <section className="mb-2 border-y border-slate-300 bg-white px-4 py-6">
          <h2 className="mb-5 flex items-center gap-3 text-[1.35rem] font-extrabold text-[#0F1111]">
            <span className="inline-block h-[22px] w-[6px] rounded bg-pink-600" />
            Merchant Information
          </h2>

          <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
            <div>
              {currentShop?.storefront_url ? (
                <div className="mb-6 rounded-lg border border-slate-300 bg-white p-5 shadow-[0_2px_4px_rgba(0,0,0,0.02)]">
                  <div className="mb-3 flex items-center gap-2 border-b border-slate-200 pb-2 text-base font-extrabold text-[#0F1111]">
                    <FaStore className="text-pink-600" />
                    Store Front
                  </div>

                  <div className="flex justify-center">
                    <StableImage
                      src={currentShop.storefront_url}
                      alt="Store Front"
                      containerClassName="aspect-[3/4] w-full max-w-[360px] rounded-lg border border-slate-300 bg-slate-50"
                      className="h-full w-full object-cover"
                    />
                  </div>
                </div>
              ) : null}

              {currentShop?.latitude && currentShop?.longitude ? (
                <div className="rounded-lg border border-slate-300 bg-white p-5 shadow-[0_2px_4px_rgba(0,0,0,0.02)]">
                  <div className="mb-3 flex items-center gap-2 border-b border-slate-200 pb-2 text-base font-extrabold text-[#0F1111]">
                    <FaMapLocationDot className="text-pink-600" />
                    Location Map
                  </div>

                  <div
                    ref={mapRef}
                    className="h-[220px] w-full rounded-lg border border-slate-300 bg-slate-50"
                  />

                  <button
                    type="button"
                    onClick={openGoogleMaps}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-3 text-[0.85rem] font-bold text-[#0F1111] shadow-[0_2px_5px_0_rgba(213,217,217,0.5)] transition hover:bg-[#F7FAFA]"
                  >
                    Open in Google Maps
                    <span>↗</span>
                  </button>
                </div>
              ) : null}
            </div>

            <div>
              <div className="mb-6 rounded-lg border border-slate-300 bg-white p-5 shadow-[0_2px_4px_rgba(0,0,0,0.02)]">
                <div className="mb-3 flex items-start gap-4">
                  <StableImage
                    src={shopLogo}
                    alt="Shop Logo"
                    containerClassName="h-[72px] w-[72px] shrink-0 rounded-lg border border-slate-300 bg-white"
                    className="h-full w-full object-cover"
                  />

                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2 text-[1.4rem] font-extrabold leading-[1.2] text-[#0F1111]">
                      <span>{currentShop?.name}</span>
                      {isVerified ? (
                        <FaCircleCheck
                          className="text-[1.1rem] text-[#007185]"
                          title="Verified Shop"
                        />
                      ) : null}
                    </div>

                    <div className="inline-block rounded bg-pink-100 px-3 py-1 text-[0.75rem] font-bold text-pink-600">
                      {currentShop?.category}
                    </div>
                  </div>
                </div>

                <div className="mb-5 mt-4 flex items-start gap-2 text-[0.95rem] font-medium leading-6 text-slate-600">
                  <FaLocationDot className="mt-1 shrink-0 text-pink-600" />
                  <span>{currentShop?.address}</span>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div
                    className={`inline-flex items-center gap-2 rounded-md border px-4 py-2 text-[0.85rem] font-bold ${
                      isVerified
                        ? "border-[#BFE8F0] bg-[#EFF6FF] text-[#007185]"
                        : "border-red-100 bg-red-50 text-red-700"
                    }`}
                  >
                    {isVerified ? <FaShield /> : <FaTriangleExclamation />}
                    {isVerified
                      ? `ID: ${currentShop?.unique_id || "Verified"}`
                      : "Pending Verification"}
                  </div>

                  <button
                    type="button"
                    onClick={toggleLike}
                    className={`inline-flex items-center gap-2 rounded-md border px-5 py-2 text-[0.9rem] font-bold shadow-[0_2px_5px_0_rgba(213,217,217,0.5)] transition ${
                      hasLiked
                        ? "border-pink-300 bg-white text-pink-600"
                        : "border-slate-300 bg-white text-[#0F1111]"
                    }`}
                  >
                    <span>{hasLiked ? "👍" : "👍"}</span>
                    <span>{likeCount}</span>
                  </button>
                </div>
              </div>

              <div className="mb-6 rounded-lg border border-slate-300 bg-white p-5 shadow-[0_2px_4px_rgba(0,0,0,0.02)]">
                <div className="mb-3 flex items-center gap-2 border-b border-slate-200 pb-2 text-base font-extrabold text-[#0F1111]">
                  <FaCircleInfo className="text-[#007185]" />
                  About Business
                </div>

                <p className="text-[0.95rem] leading-7 text-[#0F1111]">
                  {currentShop?.description ||
                    "No description provided by the merchant."}
                </p>
              </div>

              <div className="rounded-lg border border-slate-300 bg-white p-5 shadow-[0_2px_4px_rgba(0,0,0,0.02)]">
                <div className="mb-3 flex items-center gap-2 border-b border-slate-200 pb-2 text-base font-extrabold text-[#0F1111]">
                  <FaAddressBook className="text-[#007185]" />
                  Connect with us
                </div>

                <p className="mb-3 text-[0.85rem] text-slate-600">
                  Tap an icon below to reach out or verify our profiles.
                </p>

                <div className="flex flex-wrap gap-3">{renderSocialButtons()}</div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {securityModalOpen ? (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[rgba(19,25,33,0.8)] px-4 backdrop-blur-[2px]">
          <div className="w-full max-w-[360px] rounded-lg bg-white px-6 py-7 text-center shadow-[0_10px_25px_rgba(0,0,0,0.2)]">
            <FaWhatsapp className="mx-auto mb-4 text-5xl text-[#25D366]" />
            <h3 className="mb-2 text-xl font-extrabold text-[#0F1111]">
              Contact Merchant
            </h3>
            <p className="text-[0.85rem] leading-6 text-slate-600">
              To protect merchants from spam, your User ID will be recorded.
              Please ensure this inquiry is business-related.
            </p>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setSecurityModalOpen(false)}
                className="flex-1 rounded-md border border-slate-300 bg-white px-4 py-3 font-bold text-[#0F1111] transition hover:bg-[#F7FAFA]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={launchWhatsApp}
                className="flex-1 rounded-md bg-[#25D366] px-4 py-3 font-bold text-white transition hover:bg-green-600"
              >
                Continue to Chat
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default ShopDetail
