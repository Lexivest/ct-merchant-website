import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import {
  FaBoxOpen,
  FaBullhorn,
  FaChevronDown,
  FaChevronRight,
  FaCircleCheck,
  FaCircleInfo,
  FaComments,
  FaFlag,
  FaGlobe,
  FaHouse,
  FaLocationDot,
  FaMapLocationDot,
  FaPaperPlane,
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
import RetryingNotice, { getRetryingMessage } from "../components/common/RetryingNotice"
import ScrollingTicker from "../components/common/ScrollingTicker"
import { useGlobalFeedback } from "../components/common/GlobalFeedbackProvider"
import { getFriendlyErrorMessage } from "../lib/friendlyErrors"

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

function formatCommentTimestamp(value) {
  if (!value) return "Just now"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Recently"
  return date.toLocaleString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

function getNameInitials(value) {
  const parts = String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)

  if (!parts.length) return "CT"
  return parts.map((part) => part[0]?.toUpperCase() || "").join("")
}

function buildCommentThreads(comments) {
  const safeComments = Array.isArray(comments) ? comments : []
  const repliesByParent = new Map()

  for (const comment of safeComments) {
    if (!comment?.parent_id) continue
    if (!repliesByParent.has(comment.parent_id)) {
      repliesByParent.set(comment.parent_id, [])
    }
    repliesByParent.get(comment.parent_id).push(comment)
  }

  for (const replyList of repliesByParent.values()) {
    replyList.sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )
  }

  return safeComments
    .filter((comment) => !comment?.parent_id)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .map((comment) => ({
      ...comment,
      replies: repliesByParent.get(comment.id) || [],
    }))
}

function ShopDetail() {
  const navigate = useNavigate()
  const { notify } = useGlobalFeedback()
  const [searchParams] = useSearchParams()
  const shopId = searchParams.get("id")
  const preselectedProductId = searchParams.get("comment_product")

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
    let fetchedOwnerProfile = null
    const tasks = []

    if (shopData.city_id) {
      tasks.push(
        supabase
        .from("cities")
        .select("name")
        .eq("id", shopData.city_id)
        .maybeSingle()
        .then((res) => {
          if (res.data?.name) cityName = res.data.name
        })
        .catch(() => {})
      )
    }

    if (shopData.owner_id) {
      tasks.push(
        supabase
          .from("profiles")
          .select("id, full_name, avatar_url")
          .eq("id", shopData.owner_id)
          .maybeSingle()
          .then((res) => {
            if (!res.error) fetchedOwnerProfile = res.data || null
          })
          .catch(() => {})
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
        if (!res.error) fetchedProducts = res.data || []
      })
      .catch(() => {})
    )

    tasks.push(
      supabase
      .from("shop_likes")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", shopId)
      .then((res) => {
        if (!res.error) fetchedLikeCount = res.count || 0
      })
      .catch(() => {})
    )

    tasks.push(
      supabase
      .from("shop_banners_news")
      .select("content_type, content_data")
      .eq("shop_id", shopId)
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .then((res) => {
        if (res.error) return
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
      .catch(() => {})
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
        .catch(() => {})
      )

      if (user.id !== shopData.owner_id) {
        tasks.push(
          supabase
          .from("shop_views")
          .insert({ shop_id: shopId, viewer_id: user.id })
          .then(() => {})
          .catch(() => {})
        )
      }
    }

    await Promise.allSettled(tasks)

    return {
      shop: { ...shopData, cities: { name: cityName } },
      products: fetchedProducts,
      likeCount: fetchedLikeCount,
      approvedNews: fetchedApprovedNews,
      shopBanner: fetchedShopBanner,
      hasLiked: fetchedHasLiked,
      ownerProfile: fetchedOwnerProfile,
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
  const [comments, setComments] = useState([])
  const [commentsLoading, setCommentsLoading] = useState(true)
  const [commentsError, setCommentsError] = useState("")
  const [authorProfiles, setAuthorProfiles] = useState({})
  const [commentProducts, setCommentProducts] = useState({})
  const [commentBody, setCommentBody] = useState("")
  const [selectedProductId, setSelectedProductId] = useState("")
  const [replyTarget, setReplyTarget] = useState(null)
  const [submittingComment, setSubmittingComment] = useState(false)
  const [commentProductPickerOpen, setCommentProductPickerOpen] = useState(false)
  const [replyBody, setReplyBody] = useState("")
  const [activeInfoSection, setActiveInfoSection] = useState("business")
  const [expandedThreadId, setExpandedThreadId] = useState(null)

  // Sync optimistic state when cached data resolves
  useEffect(() => {
    if (data) {
      setHasLiked(data.hasLiked)
      setLikeCount(data.likeCount)
    }
  }, [data])

  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const communityRef = useRef(null)
  const commentProductPickerRef = useRef(null)

  // Computed Values
  const currentShop = data?.shop
  const products = data?.products || []
  const approvedNews = data?.approvedNews || []
  const shopBanner = data?.shopBanner || ""
  const approvedCommentCount = useMemo(
    () => comments.filter((comment) => comment.status === "approved").length,
    [comments]
  )
  const commentThreads = useMemo(() => buildCommentThreads(comments), [comments])
  const selectedCommentProduct = useMemo(() => {
    if (!selectedProductId) return null
    return (
      products.find((item) => String(item.id) === String(selectedProductId)) ||
      commentProducts[String(selectedProductId)] ||
      null
    )
  }, [commentProducts, products, selectedProductId])

  useEffect(() => {
    if (!preselectedProductId) return
    if (!products.some((product) => String(product.id) === String(preselectedProductId))) return
    setSelectedProductId(String(preselectedProductId))
  }, [preselectedProductId, products])

  useEffect(() => {
    if (currentShop?.storefront_url) return
    if (activeInfoSection === "storefront") {
      setActiveInfoSection(currentShop?.latitude && currentShop?.longitude ? "map" : "business")
    }
  }, [activeInfoSection, currentShop?.latitude, currentShop?.longitude, currentShop?.storefront_url])

  useEffect(() => {
    if (currentShop?.latitude && currentShop?.longitude) return
    if (activeInfoSection === "map") {
      setActiveInfoSection(currentShop?.storefront_url ? "storefront" : "business")
    }
  }, [activeInfoSection, currentShop?.latitude, currentShop?.longitude, currentShop?.storefront_url])

  useEffect(() => {
    function handleOutsideClick(event) {
      if (!commentProductPickerRef.current?.contains(event.target)) {
        setCommentProductPickerOpen(false)
      }
    }

    if (commentProductPickerOpen) {
      document.addEventListener("mousedown", handleOutsideClick)
    }

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick)
    }
  }, [commentProductPickerOpen])

  const fetchComments = useMemo(
    () => async () => {
      if (!shopId) {
        setComments([])
        setCommentsLoading(false)
        return
      }

      try {
        setCommentsLoading(true)
        setCommentsError("")

        const { data: commentRows, error: commentError } = await supabase
          .from("shop_comments")
          .select("id, shop_id, product_id, user_id, parent_id, body, status, moderation_reason, created_at, updated_at")
          .eq("shop_id", shopId)
          .order("created_at", { ascending: true })

        if (commentError) throw commentError

        const safeComments = commentRows || []
        setComments(safeComments)

        const userIds = Array.from(
          new Set(
            safeComments
              .map((comment) => comment.user_id)
              .filter(Boolean)
          )
        )

        const productIds = Array.from(
          new Set(
            safeComments
              .map((comment) => comment.product_id)
              .filter(Boolean)
          )
        )

        const [profileResult, productResult] = await Promise.allSettled([
          userIds.length > 0
            ? supabase
                .from("profiles")
                .select("id, full_name, avatar_url")
                .in("id", userIds)
            : Promise.resolve({ data: [] }),
          productIds.length > 0
            ? supabase
                .from("products")
                .select("id, name, image_url")
                .in("id", productIds)
            : Promise.resolve({ data: [] }),
        ])

        if (profileResult.status === "fulfilled" && !profileResult.value.error) {
          const nextProfiles = Object.fromEntries(
            (profileResult.value.data || []).map((profile) => [profile.id, profile])
          )
          setAuthorProfiles(nextProfiles)
        } else {
          setAuthorProfiles({})
        }

        if (productResult.status === "fulfilled" && !productResult.value.error) {
          const nextProducts = Object.fromEntries(
            (productResult.value.data || []).map((product) => [String(product.id), product])
          )
          setCommentProducts(nextProducts)
        } else {
          setCommentProducts({})
        }
      } catch (err) {
        console.error("Error fetching community comments:", err)
        setCommentsError("Could not load the community discussion right now.")
      } finally {
        setCommentsLoading(false)
      }
    },
    [shopId]
  )

  useEffect(() => {
    fetchComments()
  }, [fetchComments])

  useEffect(() => {
    if (!shopId) return undefined

    const channel = supabase
      .channel(`public:shop_comments:shop_id=eq.${shopId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "shop_comments",
          filter: `shop_id=eq.${shopId}`,
        },
        () => {
          fetchComments()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [shopId, fetchComments])

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
    if (activeInfoSection !== "map") return
    if (!currentShop?.latitude || !currentShop?.longitude || !mapRef.current) return

    if (mapInstanceRef.current) {
      setTimeout(() => {
        mapInstanceRef.current?.invalidateSize()
      }, 150)
      return
    }

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
  }, [activeInfoSection, currentShop])

  function goBackSafe() {
    if (document.referrer && document.referrer.includes(window.location.hostname)) {
      navigate(-1)
      return
    }
    navigate("/user-dashboard")
  }

  async function toggleLike() {
    if (!user?.id) {
      notify({ type: "info", title: "Login required", message: "Please sign in to like shops." })
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
      notify({ type: "error", title: "Action failed", message: "We could not update your shop like. Please try again." })
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
      notify({ type: "success", title: "Link copied", message: "The shop link was copied to your clipboard." })
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
    if (!isLoggedIn) {
      return null
    }
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

  function getCommentAuthor(comment) {
    const profile = authorProfiles[comment.user_id]
    const displayName =
      profile?.full_name ||
      (comment.user_id === currentShop?.owner_id
        ? currentShop?.name || "Shop Owner"
        : "CTMerchant User")

    return {
      displayName,
      avatarUrl: profile?.avatar_url || "",
      initials: getNameInitials(displayName),
      isOwner: comment.user_id === currentShop?.owner_id,
    }
  }

  function getCommentProductLabel(comment) {
    if (!comment?.product_id) return ""
    return (
      commentProducts[String(comment.product_id)]?.name ||
      products.find((item) => String(item.id) === String(comment.product_id))?.name ||
      ""
    )
  }

  function getCommentProductMeta(comment) {
    if (!comment?.product_id) return null
    return (
      commentProducts[String(comment.product_id)] ||
      products.find((item) => String(item.id) === String(comment.product_id)) ||
      null
    )
  }

  function openProductDetail(productId) {
    if (!productId) return
    navigate(`/product-detail?id=${productId}`)
  }

  function openAbuseReport(comment) {
    if (!isLoggedIn) {
      notify({
        type: "info",
        title: "Login required",
        message: "Please sign in before reporting abusive content.",
      })
      return
    }

    const excerpt = encodeURIComponent(String(comment.body || "").slice(0, 120))
    navigate(
      `/user-dashboard?tab=services&view=report-abuse&shop_id=${encodeURIComponent(
        shopId
      )}&comment_id=${encodeURIComponent(comment.id)}&context=shop_comment&excerpt=${excerpt}`
    )
  }

  function beginReply(comment) {
    const threadParentId = comment.parent_id || comment.id
    setExpandedThreadId(threadParentId)
    setReplyTarget({
      id: threadParentId,
      authorName: getCommentAuthor(comment).displayName,
      body: comment.body,
      productId: comment.product_id ? String(comment.product_id) : "",
    })
    setReplyBody("")
  }

  function clearReplyComposer() {
    setReplyTarget(null)
    setReplyBody("")
  }

  function toggleThreadComments(threadId) {
    setExpandedThreadId((current) => {
      const nextIsClosing = current === threadId
      if (nextIsClosing) {
        setReplyTarget(null)
        setReplyBody("")
        return null
      }

      setReplyTarget({
        id: threadId,
        authorName: "",
        body: "",
        productId: "",
      })
      setReplyBody("")
      return threadId
    })
  }

  async function submitComment({
    body = commentBody,
    parentId = null,
    productId = parentId ? replyTarget?.productId || "" : selectedProductId,
    resetComposer = true,
  } = {}) {
    if (!isLoggedIn) {
      notify({
        type: "info",
        title: "Login required",
        message: "Please sign in to join the shop discussion.",
      })
      return
    }

    const trimmedBody = String(body || "").trim()
    if (trimmedBody.length < 3) {
      notify({
        type: "error",
        title: "Comment too short",
        message: "Please write at least a short sentence before posting.",
      })
      return
    }

    if (trimmedBody.length > 500) {
      notify({
        type: "error",
        title: "Comment too long",
        message: "Please keep your comment within 500 characters.",
      })
      return
    }

    try {
      setSubmittingComment(true)

      const payload = {
        shop_id: Number(shopId),
        product_id: productId ? Number(productId) : null,
        user_id: user.id,
        parent_id: parentId,
        body: trimmedBody,
        status: "pending",
      }

      console.log("[shop.community] insert start", payload)

      const { error: insertError } = await supabase.from("shop_comments").insert(payload)
      if (insertError) {
        console.log("[shop.community] insert failed", {
          message: insertError.message,
          details: insertError.details,
          hint: insertError.hint,
          code: insertError.code,
        })
        throw insertError
      }

      if (resetComposer) {
        if (parentId) {
          setReplyBody("")
          setReplyTarget(null)
        } else {
          setCommentBody("")
          if (!preselectedProductId) {
            setSelectedProductId("")
          }
        }
      }

      notify({
        type: "success",
        title: "Comment submitted",
        message: "Your comment is now awaiting moderation review.",
      })

      await fetchComments()
    } catch (err) {
      console.error("Error submitting comment:", err)
      notify({
        type: "error",
        title: "Could not submit comment",
        message: getFriendlyErrorMessage(err, "Please try again in a moment."),
      })
    } finally {
      setSubmittingComment(false)
    }
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
    return <RetryingNotice message={getRetryingMessage(error)} />
  }

  const shopLogo =
    currentShop?.image_url ||
    `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
      currentShop?.name || "Shop"
    )}`
  const ownerAvatarUrl = data?.ownerProfile?.avatar_url || ""
  const ownerAvatarInitials = getNameInitials(
    data?.ownerProfile?.full_name || currentShop?.name || "CT Merchant"
  )
  const isVerified = Boolean(currentShop?.is_verified)
  const isLoggedIn = Boolean(user?.id)

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
        <header className="sticky top-0 z-[100] flex flex-col bg-[#131921] text-white shadow-[0_4px_6px_rgba(0,0,0,0.1)]">
          <div className="grid grid-cols-[44px_minmax(0,1fr)_44px] items-center px-4 py-3">
            <div className="flex items-center justify-start">
              <button
                type="button"
                onClick={goBackSafe}
                className="shrink-0 text-[1.2rem] transition hover:text-pink-500"
                aria-label="Go home"
              >
                <FaHouse />
              </button>
            </div>

            <div className="min-w-0 text-center">
              <span className="block truncate text-[1.15rem] font-bold tracking-[0.5px]">
                {currentShop?.name || "Shop Details"}
              </span>
            </div>

            <div className="flex items-center justify-end">
              {ownerAvatarUrl ? (
                <img
                  src={ownerAvatarUrl}
                  alt={data?.ownerProfile?.full_name || currentShop?.name || "Shop owner"}
                  className="h-9 w-9 rounded-full border border-white/20 object-cover"
                />
              ) : (
                <div className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-white/10 text-[0.76rem] font-black text-white">
                  {ownerAvatarInitials}
                </div>
              )}
            </div>
          </div>

          {approvedNews.length > 0 ? (
            <div className="bg-[#232F3E] px-4 py-2 text-white">
              <div className="relative flex items-center gap-3 overflow-hidden">
                <FaBullhorn className="shrink-0 text-pink-500" />
                <ScrollingTicker
                  text={tickerText}
                  className="flex-1"
                  textClassName="text-white"
                  minDuration={28}
                  speedFactor={0.22}
                />
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

        {!isLoggedIn ? (
          <div className="mx-auto max-w-[1000px] px-4 pt-6">
            <div className="flex flex-col gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[0.9rem] font-semibold text-blue-900">
                Login to contact seller.
              </p>
              <button
                type="button"
                onClick={() => navigate("/")}
                className="inline-flex items-center justify-center rounded-md bg-pink-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-pink-700"
              >
                Login
              </button>
            </div>
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
          <div className="mb-5 flex flex-wrap items-center gap-3 overflow-x-auto border-b border-slate-200 pb-3">
            {[
              currentShop?.storefront_url ? { key: "storefront", label: "View Storefront", icon: <FaStore /> } : null,
              currentShop?.latitude && currentShop?.longitude ? { key: "map", label: "View Location Map", icon: <FaMapLocationDot /> } : null,
              { key: "business", label: "About Business", icon: <FaCircleInfo /> },
            ]
              .filter(Boolean)
              .map((section) => (
                <button
                  key={section.key}
                  type="button"
                  onClick={() =>
                    setActiveInfoSection((current) => (current === section.key ? null : section.key))
                  }
                  className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[0.8rem] font-extrabold transition ${
                    activeInfoSection === section.key
                      ? "border-pink-200 bg-pink-50 text-pink-600"
                      : "border-slate-200 bg-white text-slate-600 hover:border-pink-200 hover:text-pink-600"
                  }`}
                >
                  {section.icon}
                  {section.label}
                  <FaChevronRight className={`text-[0.7rem] transition ${activeInfoSection === section.key ? "rotate-90" : ""}`} />
                </button>
              ))}
          </div>

          {activeInfoSection === "storefront" && currentShop?.storefront_url ? (
            <div className="mb-4 rounded-[22px] border border-slate-200 bg-white p-4 shadow-[0_2px_6px_rgba(15,23,42,0.04)]">
              <StableImage
                src={currentShop.storefront_url}
                alt="Store Front"
                containerClassName="flex min-h-[240px] w-full items-center justify-center overflow-hidden rounded-[18px] border border-slate-200 bg-slate-50 p-2"
                className="max-h-[560px] w-full object-contain"
              />
            </div>
          ) : null}

          {activeInfoSection === "map" && currentShop?.latitude && currentShop?.longitude ? (
            <div className="mb-4 rounded-[22px] border border-slate-200 bg-white p-4 shadow-[0_2px_6px_rgba(15,23,42,0.04)]">
              <div
                ref={mapRef}
                className="h-[260px] w-full rounded-[18px] border border-slate-200 bg-slate-50"
              />

              <button
                type="button"
                onClick={openGoogleMaps}
                className="mt-3 inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-[0.82rem] font-bold text-[#0F1111] transition hover:bg-[#F7FAFA]"
              >
                Open in Google Maps
                <span>↗</span>
              </button>
            </div>
          ) : null}

          {activeInfoSection === "business" ? (
            <div className="mb-4 grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
              <div className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-[0_2px_6px_rgba(15,23,42,0.04)]">
                <div className="mb-3 flex items-start gap-4">
                  <StableImage
                    src={shopLogo}
                    alt="Shop Logo"
                    containerClassName="h-[72px] w-[72px] shrink-0 rounded-xl border border-slate-300 bg-white"
                    className="h-full w-full object-cover"
                  />

                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2 text-[1.2rem] font-extrabold leading-[1.2] text-[#0F1111]">
                      <span>{currentShop?.name}</span>
                      {isVerified ? (
                        <FaCircleCheck
                          className="text-[1rem] text-[#007185]"
                          title="Approved Shop"
                        />
                      ) : null}
                    </div>

                    <div className="inline-block rounded-full bg-pink-100 px-3 py-1 text-[0.74rem] font-bold text-pink-600">
                      {currentShop?.category}
                    </div>
                  </div>
                </div>

                <div className="mb-5 mt-4 flex items-start gap-2 text-[0.92rem] font-medium leading-6 text-slate-600">
                  <FaLocationDot className="mt-1 shrink-0 text-pink-600" />
                  <span>{currentShop?.address}</span>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div
                    className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[0.8rem] font-bold ${
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
                    className={`inline-flex items-center gap-2 rounded-full border px-5 py-2 text-[0.85rem] font-bold transition ${
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

              <div className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-[0_2px_6px_rgba(15,23,42,0.04)]">
                <div className="mb-3 text-[0.82rem] font-extrabold uppercase tracking-[0.12em] text-slate-400">
                  About Business
                </div>

                <p className="text-[0.95rem] leading-7 text-[#0F1111]">
                  {currentShop?.description ||
                    "No description provided by the merchant."}
                </p>
              </div>
            </div>
          ) : null}

          <div className="hidden grid gap-6 lg:grid-cols-[1fr_1.2fr]">
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
                          title="Approved Shop"
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
            </div>
          </div>
        </section>

        <section
          ref={communityRef}
          className="mb-2 border-y border-slate-300 bg-white px-4 py-6"
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
            <div className="min-w-0">
              <h2 className="flex items-center gap-2 text-[1.12rem] font-extrabold text-[#0F1111]">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-pink-100 text-[0.9rem] text-pink-600">
                  <FaComments />
                </span>
                Shop Community
              </h2>
              <p className="mt-1 text-[0.84rem] text-slate-500">
                One conversation hub for service feedback, product questions, and owner responses.
              </p>
            </div>

            <div className="text-[0.82rem] font-semibold text-slate-500">
              <span className="font-extrabold text-[#2E1065]">{approvedCommentCount}</span> approved threads
            </div>
          </div>

          <div className="mb-5 rounded-[20px] border border-slate-200 bg-[#FCFCFD] p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="text-[0.95rem] font-extrabold text-[#0F1111]">
                Start a thread
              </div>

            </div>

            {!isLoggedIn ? (
              <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-[0.86rem] font-semibold text-blue-900">
                Sign in to post, comment, or report abuse in this shop community.
              </div>
            ) : (
              <>
                <div ref={commentProductPickerRef} className="mb-3">
                  <div className="mb-1.5 text-[0.72rem] font-extrabold uppercase tracking-[0.12em] text-slate-500">
                    Product Reference
                  </div>
                  <button
                    type="button"
                    onClick={() => setCommentProductPickerOpen((open) => !open)}
                    className="flex w-full items-center justify-between rounded-[18px] border border-slate-200 bg-white px-3 py-2.5 text-left transition hover:border-pink-200"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      {selectedCommentProduct?.image_url ? (
                        <img
                          src={selectedCommentProduct.image_url}
                          alt={selectedCommentProduct.name || "Selected product"}
                          className="h-11 w-11 rounded-xl border border-slate-200 object-cover"
                        />
                      ) : (
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-slate-100 text-slate-500">
                          <FaBoxOpen />
                        </div>
                      )}

                      <div className="min-w-0">
                        <div className="text-[0.74rem] font-bold uppercase tracking-[0.1em] text-slate-400">
                          Attached Product
                        </div>
                        <div className="truncate text-[0.87rem] font-bold text-[#0F1111]">
                          {selectedCommentProduct?.name || "General shop service"}
                        </div>
                      </div>
                    </div>

                    <FaChevronDown
                      className={`shrink-0 text-[0.82rem] text-slate-400 transition ${
                        commentProductPickerOpen ? "rotate-180" : ""
                      }`}
                    />
                  </button>

                  {commentProductPickerOpen ? (
                    <div className="mt-2 overflow-hidden rounded-[18px] border border-slate-200 bg-white shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedProductId("")
                          setCommentProductPickerOpen(false)
                        }}
                        className="flex w-full items-center gap-3 border-b border-slate-100 px-3 py-3 text-left transition hover:bg-slate-50"
                      >
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-slate-100 text-slate-500">
                          <FaBoxOpen />
                        </div>
                        <div>
                          <div className="text-[0.86rem] font-bold text-[#0F1111]">General shop service</div>
                          <div className="text-[0.75rem] text-slate-500">No specific product attached</div>
                        </div>
                      </button>

                      <div className="max-h-[280px] overflow-y-auto">
                        {products.map((product) => (
                          <button
                            key={product.id}
                            type="button"
                            onClick={() => {
                              setSelectedProductId(String(product.id))
                              setCommentProductPickerOpen(false)
                            }}
                            className="flex w-full items-center gap-3 px-3 py-3 text-left transition hover:bg-slate-50"
                          >
                            <img
                              src={product.image_url || ""}
                              alt={product.name}
                              className="h-11 w-11 rounded-xl border border-slate-200 object-cover"
                            />
                            <div className="min-w-0">
                              <div className="truncate text-[0.86rem] font-bold text-[#0F1111]">{product.name}</div>
                              <div className="text-[0.74rem] text-slate-500">Attach this product to the thread</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>

                {selectedCommentProduct ? (
                  <div className="mb-3 rounded-[18px] border border-pink-100 bg-white p-3 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        onClick={() => openProductDetail(selectedCommentProduct.id)}
                        className="overflow-hidden rounded-xl border border-slate-200 transition hover:opacity-90"
                      >
                        <StableImage
                          src={selectedCommentProduct.image_url}
                          alt={selectedCommentProduct.name}
                          containerClassName="h-[74px] w-[74px] bg-white"
                          className="h-full w-full object-contain"
                        />
                      </button>

                      <div className="min-w-0 flex-1">
                        <div className="text-[0.72rem] font-extrabold uppercase tracking-[0.12em] text-pink-600">
                          Visual Reference
                        </div>
                        <div className="mt-1 text-[0.9rem] font-extrabold text-[#0F1111]">
                          {selectedCommentProduct.name}
                        </div>
                        <div className="mt-1 text-[0.78rem] leading-5 text-slate-500">
                          This image will help readers and moderators know which product the thread is referring to.
                        </div>
                        <button
                          type="button"
                          onClick={() => openProductDetail(selectedCommentProduct.id)}
                          className="mt-2 inline-flex items-center gap-1.5 text-[0.76rem] font-bold text-pink-600 transition hover:text-pink-700"
                        >
                          <FaBoxOpen className="text-[0.7rem]" />
                          Open product
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}

                <textarea
                  value={commentBody}
                  onChange={(event) => setCommentBody(event.target.value)}
                  placeholder="Share a shop experience, ask a question, or start a product discussion..."
                  className="min-h-[112px] w-full rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-[0.92rem] leading-6 text-[#0F1111] outline-none transition focus:border-pink-300 focus:ring-4 focus:ring-pink-100"
                  maxLength={500}
                />

                <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="text-[0.78rem] font-medium text-slate-500">
                    {commentBody.trim().length}/500 · Public after approval
                  </div>

                  <div className="hidden">
                    <select
                      value={selectedProductId}
                      onChange={(event) => setSelectedProductId(event.target.value)}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[0.82rem] font-semibold text-[#0F1111] outline-none transition focus:border-pink-300"
                    >
                      <option value="">General shop service</option>
                      {products.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name}
                        </option>
                      ))}
                    </select>
                    <div className="text-[0.78rem] font-medium text-slate-500">
                      {commentBody.trim().length}/500 · Public after approval
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => submitComment({ body: commentBody, parentId: null, productId: selectedProductId })}
                    disabled={submittingComment}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-pink-600 px-4 py-2.5 text-[0.84rem] font-extrabold text-white transition hover:bg-pink-700 disabled:cursor-not-allowed disabled:bg-pink-300"
                  >
                    <FaPaperPlane className="text-[0.78rem]" />
                    {submittingComment ? "Submitting..." : "Post"}
                  </button>
                </div>
              </>
            )}
          </div>

          {commentsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((item) => (
                <div key={item} className="rounded-[18px] border border-slate-200 bg-white px-4 py-4">
                  <div className="mb-3 flex items-center gap-3">
                    <ShimmerBlock className="h-10 w-10 rounded-full" />
                    <div className="flex-1">
                      <ShimmerBlock className="mb-2 h-3.5 w-32 rounded" />
                      <ShimmerBlock className="h-3 w-20 rounded" />
                    </div>
                  </div>
                  <ShimmerBlock className="mb-2 h-3.5 w-full rounded" />
                  <ShimmerBlock className="h-3.5 w-3/4 rounded" />
                </div>
              ))}
            </div>
          ) : commentsError ? (
            <div className="rounded-[22px] border border-red-200 bg-red-50 px-5 py-5 text-[0.92rem] font-semibold text-red-700">
              {commentsError}
            </div>
          ) : commentThreads.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-white text-[1.4rem] text-pink-500 shadow-sm">
                <FaComments />
              </div>
              <div className="text-[1.05rem] font-extrabold text-[#0F1111]">
                No community comments yet
              </div>
              <div className="mt-2 text-[0.9rem] text-slate-500">
                Start the first conversation about this shop&apos;s service, delivery, or products.
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {commentThreads.map((comment) => {
                const author = getCommentAuthor(comment)
                const productLabel = getCommentProductLabel(comment)
                const productMeta = getCommentProductMeta(comment)
                const isOwnPending = comment.user_id === user?.id && comment.status !== "approved"
                const isReplyingToThread = expandedThreadId === comment.id

                return (
                  <div
                    key={comment.id}
                    className={`overflow-hidden rounded-[20px] border ${
                      isOwnPending
                        ? "border-amber-200 bg-amber-50/70"
                        : "border-slate-200 bg-white"
                    }`}
                  >
                    <div className="flex items-start gap-3 px-4 py-4">
                      {author.avatarUrl ? (
                        <img
                          src={author.avatarUrl}
                          alt={author.displayName}
                          className="h-10 w-10 rounded-full border border-slate-200 object-cover"
                        />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-pink-50 text-[0.8rem] font-black text-pink-600">
                          {author.initials}
                        </div>
                      )}

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <div className="text-[0.84rem] font-extrabold text-[#0F1111]">
                            {author.displayName}
                          </div>
                          {author.isOwner ? (
                            <span className="rounded-full bg-[#FCE7F3] px-2 py-0.5 text-[0.62rem] font-extrabold uppercase tracking-[0.12em] text-pink-600">
                              Shop Owner
                            </span>
                          ) : null}
                          {comment.status !== "approved" ? (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[0.62rem] font-extrabold uppercase tracking-[0.12em] text-amber-700">
                              {comment.status === "pending" ? "Awaiting Review" : comment.status}
                            </span>
                          ) : null}
                        </div>

                        <div className="mt-0.5 text-[0.71rem] font-semibold text-slate-400">
                          {formatCommentTimestamp(comment.created_at)}
                        </div>

                        {productLabel ? (
                          <button
                            type="button"
                            onClick={() => openProductDetail(comment.product_id)}
                            className="mt-2 flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-left transition hover:border-pink-200 hover:bg-white"
                          >
                            {productMeta?.image_url ? (
                              <StableImage
                                src={productMeta.image_url}
                                alt={productLabel}
                                containerClassName="h-[78px] w-[78px] overflow-hidden rounded-xl bg-white"
                                className="h-full w-full object-contain"
                              />
                            ) : (
                              <div className="flex h-[78px] w-[78px] items-center justify-center rounded-xl bg-white text-slate-400">
                                <FaBoxOpen />
                              </div>
                            )}
                            <div className="min-w-0 pt-1">
                              <div className="text-[0.68rem] font-extrabold uppercase tracking-[0.12em] text-slate-400">
                                Ref Product
                              </div>
                              <div className="mt-1 text-[0.8rem] font-bold text-[#0F1111]">
                                {productLabel}
                              </div>
                            </div>
                          </button>
                        ) : null}

                        <div className="mt-2 whitespace-pre-wrap text-[0.88rem] leading-6 text-slate-700">
                          {comment.body}
                        </div>

                        {comment.status !== "approved" && comment.moderation_reason ? (
                          <div className="mt-2 rounded-2xl border border-amber-200 bg-white px-3 py-2 text-[0.78rem] font-medium text-amber-700">
                            Moderation note: {comment.moderation_reason}
                          </div>
                        ) : null}

                        {expandedThreadId === comment.id && comment.replies.length > 0 ? (
                          <div className="mt-3 border-l border-slate-200 pl-4">
                            {comment.replies.map((reply) => {
                              const replyAuthor = getCommentAuthor(reply)
                              const isReplyPending = reply.user_id === user?.id && reply.status !== "approved"

                              return (
                                <div
                                  key={reply.id}
                                  className={`py-3 ${
                                    isReplyPending
                                      ? "border-amber-200"
                                      : "border-transparent"
                                  }`}
                                >
                                  <div className="flex items-start gap-3">
                                    {replyAuthor.avatarUrl ? (
                                      <img
                                        src={replyAuthor.avatarUrl}
                                        alt={replyAuthor.displayName}
                                        className="h-8 w-8 rounded-full border border-slate-200 object-cover"
                                      />
                                    ) : (
                                      <div className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-[0.68rem] font-black text-pink-600">
                                        {replyAuthor.initials}
                                      </div>
                                    )}

                                    <div className="min-w-0 flex-1">
                                      <div className="flex flex-wrap items-center gap-1.5">
                                        <div className="text-[0.84rem] font-extrabold text-[#0F1111]">
                                          {replyAuthor.displayName}
                                        </div>
                                        {replyAuthor.isOwner ? (
                                          <span className="rounded-full bg-[#FCE7F3] px-2 py-0.5 text-[0.58rem] font-extrabold uppercase tracking-[0.12em] text-pink-600">
                                            Shop Owner
                                          </span>
                                        ) : null}
                                        {reply.status !== "approved" ? (
                                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[0.58rem] font-extrabold uppercase tracking-[0.12em] text-amber-700">
                                            {reply.status === "pending" ? "Awaiting Review" : reply.status}
                                          </span>
                                        ) : null}
                                      </div>

                                      <div className="mt-0.5 text-[0.71rem] font-semibold text-slate-400">
                                        {formatCommentTimestamp(reply.created_at)}
                                      </div>

                                      <div className="mt-1.5 whitespace-pre-wrap text-[0.84rem] leading-6 text-slate-700">
                                        {reply.body}
                                      </div>

                                      {reply.status !== "approved" && reply.moderation_reason ? (
                                        <div className="mt-2 rounded-2xl border border-amber-200 bg-white px-3 py-2 text-[0.74rem] font-medium text-amber-700">
                                          Moderation note: {reply.moderation_reason}
                                        </div>
                                      ) : null}
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        ) : null}

                        <div className="mt-3 border-t border-slate-100 pt-3">
                          <div className="flex flex-wrap items-center gap-4 text-[0.76rem] font-bold">
                            <button
                              type="button"
                              onClick={() => toggleThreadComments(comment.id)}
                              className="text-slate-600 transition hover:text-pink-600"
                            >
                              {comment.replies.length} comment{comment.replies.length === 1 ? "" : "s"}
                            </button>
                            <button
                              type="button"
                              onClick={() => openAbuseReport(comment)}
                              className="inline-flex items-center gap-1.5 text-slate-500 transition hover:text-red-600"
                            >
                              <FaFlag className="text-[0.68rem]" />
                              Report Abuse
                            </button>
                          </div>

                          {isReplyingToThread ? (
                            <div className="mt-3 rounded-2xl border border-pink-100 bg-[#FCFCFD] p-3">
                              <div className="mb-2 flex items-center justify-between gap-2">
                                <div className="text-[0.76rem] font-extrabold uppercase tracking-[0.12em] text-pink-600">
                                  Commenting on this thread
                                </div>
                                <button
                                  type="button"
                                  onClick={clearReplyComposer}
                                  className="text-[0.72rem] font-bold text-slate-500 transition hover:text-pink-600"
                                >
                                  Cancel
                                </button>
                              </div>
                              <textarea
                                value={replyBody}
                                onChange={(event) => setReplyBody(event.target.value)}
                                placeholder="Write a comment under this thread..."
                                className="min-h-[88px] w-full rounded-[16px] border border-slate-200 bg-white px-3 py-3 text-[0.88rem] leading-6 text-[#0F1111] outline-none transition focus:border-pink-300 focus:ring-4 focus:ring-pink-100"
                                maxLength={500}
                              />
                              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                                <div className="text-[0.75rem] font-medium text-slate-500">
                                  {replyBody.trim().length}/500
                                </div>
                                <button
                                  type="button"
                                  onClick={() =>
                                    submitComment({
                                      body: replyBody,
                                      parentId: comment.id,
                                      productId: comment.product_id ? String(comment.product_id) : "",
                                    })
                                  }
                                  disabled={submittingComment}
                                  className="inline-flex items-center gap-2 rounded-xl bg-pink-600 px-4 py-2 text-[0.8rem] font-extrabold text-white transition hover:bg-pink-700 disabled:cursor-not-allowed disabled:bg-pink-300"
                                >
                                  <FaPaperPlane className="text-[0.72rem]" />
                                  {submittingComment ? "Submitting..." : "Comment"}
                                </button>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
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
