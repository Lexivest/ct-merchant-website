import { useEffect, useMemo, useState } from "react"
import { useLocation, useNavigate, useSearchParams } from "react-router-dom"
import {
  FaArrowLeft,
  FaBolt,
  FaBoxOpen,
  FaCircleCheck,
  FaClock,
  FaHeart,
  FaLocationDot,
  FaMapPin,
  FaPhone,
  FaShareNodes,
  FaShieldHalved,
  FaStar,
  FaStore,
  FaTriangleExclamation,
  FaXmark,
} from "react-icons/fa6"
import { FaWhatsapp } from "react-icons/fa"
import { supabase } from "../lib/supabase"
import useAuthSession from "../hooks/useAuthSession"
import useCachedFetch, {
  primeCachedFetchStore,
  readCachedFetchStore,
  clearCachedFetchStore,
  invalidateCachedFetchStore,
} from "../hooks/useCachedFetch"
import usePreventPullToRefresh from "../hooks/usePreventPullToRefresh"
import StableImage from "../components/common/StableImage"
import PageSeo from "../components/common/PageSeo"
import GlobalErrorScreen from "../components/common/GlobalErrorScreen"
import PageTransitionOverlay from "../components/common/PageTransitionOverlay"
import AiAssistantWidget from "../components/common/AiAssistantWidget"
import { ProductDetailEntrySkeleton } from "../components/common/DetailEntrySkeletons"
import { getRetryingMessage } from "../components/common/RetryingNotice"
import { useGlobalFeedback } from "../components/common/GlobalFeedbackProvider"
import { getFriendlyErrorMessage, isNetworkError } from "../lib/friendlyErrors"
import {
  normalizeWhatsAppPhone,
  openWhatsAppConversation,
  shouldUseDirectWhatsAppHandoff,
} from "../lib/whatsapp"
import {
  buildProductDetailCacheKey,
  fetchProductDetailData,
} from "../lib/productDetailData"
import {
  buildRepoSearchQuerySuffix,
  fetchPublicRepoProductDetail,
} from "../lib/repoSearch"
import { hasValidRepoSearchIntent } from "../lib/routeIntents"
import { logShopAnalyticsEvent } from "../lib/shopAnalytics"

function ProductDetail() {
  const navigate = useNavigate()
  const location = useLocation()
  const { notify } = useGlobalFeedback()
  const [searchParams] = useSearchParams()

  const productId = searchParams.get("id")
  const shopSrc = searchParams.get("shop_src")
  const repoRefFromUrl = searchParams.get("repo_ref")?.trim() || ""
  const repoRefFromState =
    location.state?.prefetchedProductData?.__repoRef ||
    location.state?.prefetchedProductData?.shop?.unique_id ||
    ""
  const repoRef = repoRefFromUrl || repoRefFromState
  const repoSearchIntent =
    searchParams.get("repo_intent")?.trim() ||
    location.state?.repoSearchIntent ||
    ""
  const hasRepoSearchIntent =
    hasValidRepoSearchIntent(repoSearchIntent, repoRef) ||
    (location.state?.fromRepoSearch === true &&
      location.state?.repoSearchConfirmed === true)
  const isRepoSearchEntry =
    Boolean(repoRef) &&
    hasRepoSearchIntent &&
    (searchParams.get("repo_public") === "1" ||
      location.state?.fromRepoSearch === true)
  const routePrefetchedProductData =
    location.state?.prefetchedProductData?.product &&
    String(location.state.prefetchedProductData.product.id) === String(productId)
      ? location.state.prefetchedProductData
      : null

  usePreventPullToRefresh()

  // 1. Unified Auth State
  const { user, loading: authLoading } = useAuthSession()
  const isPublicRepoMode = isRepoSearchEntry && !user?.id && Boolean(repoRef)

  // 2. Extracted Data Fetching Logic for Hook
  const fetchProductData = async () =>
    isPublicRepoMode
      ? fetchPublicRepoProductDetail({
          repoRef,
          productId,
          shopId: shopSrc,
        })
      : fetchProductDetailData({
          productId,
          userId: user?.id || null,
        })

  // 3. Smart Caching Hook
  const cacheKey = isPublicRepoMode
    ? `repo_public_product_${repoRef || "unknown"}_${productId || "unknown"}`
    : buildProductDetailCacheKey(productId, user?.id || null)
  if (routePrefetchedProductData && !readCachedFetchStore(cacheKey)) {
    primeCachedFetchStore(cacheKey, routePrefetchedProductData, Date.now(), {
      persist: "session",
    })
  }

  const { data, loading: dataLoading, error, mutate } = useCachedFetch(
    cacheKey,
    fetchProductData,
    {
      dependencies: [productId, user?.id],
      ttl: 1000 * 60 * 5,
      persist: "session",
      skip: !productId,
    }
  )

  // 4. Local Optimistic States
  const [selectedImage, setSelectedImage] = useState("")
  const [activeImageIndex, setActiveImageIndex] = useState(0)
  const [isInWishlist, setIsInWishlist] = useState(false)
  const [securityModalOpen, setSecurityModalOpen] = useState(false)
  const [descriptionModalOpen, setDescriptionModalOpen] = useState(false)
  const [openingWhatsApp, setOpeningWhatsApp] = useState(false)
  const [productTransition, setProductTransition] = useState({
    pending: false,
    productId: "",
    shopId: "",
    error: "",
  })

  useEffect(() => {
    setProductTransition({
      pending: false,
      productId: "",
      shopId: "",
      error: "",
    })
    setDescriptionModalOpen(false)
  }, [productId])

  // Computed Values from Cache
  const currentProduct = data?.product
  const currentShop = data?.shop
  const isLoggedIn = Boolean(user?.id)
  const productCityHubTitle = currentShop?.cities?.name
    ? `${currentShop.cities.name} Biz Hub`
    : "City Biz Hub"
  const productDescription =
    currentProduct?.description?.trim() || "No description provided by the merchant."
  const recommendations = useMemo(() => {
    const rawRecommendations = Array.isArray(data?.recommendations)
      ? data.recommendations
      : []
    const seen = new Set()

    return rawRecommendations
      .map((item) => {
        if (!item?.id) return null

        const productKey = String(item.id)
        const price = Number(item.price)
        const discountPrice = Number(item.discount_price)

        return {
          ...item,
          id: item.id,
          shop_id: item.shop_id || item.shop?.id || currentShop?.id || null,
          name: String(item.name || "Product").trim() || "Product",
          price: Number.isFinite(price) ? price : 0,
          discount_price: Number.isFinite(discountPrice) ? discountPrice : null,
          image_url: typeof item.image_url === "string" ? item.image_url.trim() : "",
          __key: productKey,
        }
      })
      .filter((item) => {
        if (!item || seen.has(item.__key)) return false
        if (String(item.id) === String(currentProduct?.id)) return false
        seen.add(item.__key)
        return true
      })
      .slice(0, 10)
  }, [currentProduct?.id, currentShop?.id, data?.recommendations])

  const productImages = useMemo(() => {
    return [
      currentProduct?.image_url,
      currentProduct?.image_url_2,
      currentProduct?.image_url_3,
    ]
      .map((image) => (typeof image === "string" ? image.trim() : ""))
      .filter(Boolean)
  }, [currentProduct])

  // Sync optimistic states once data arrives
  useEffect(() => {
    if (data) {
      setIsInWishlist(data.initialWishlist)
    }
  }, [data])

  useEffect(() => {
    if (!productId || isPublicRepoMode) return undefined

    let refreshTimerId = null

    const scheduleRefresh = () => {
      if (refreshTimerId) {
        window.clearTimeout(refreshTimerId)
      }

      refreshTimerId = window.setTimeout(() => {
        refreshTimerId = null
        mutate()
      }, 500)
    }

    let channel = supabase
      .channel(`product-detail-live-${productId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "products", filter: `id=eq.${productId}` },
        () => {
          if (currentShop?.id) {
            invalidateCachedFetchStore((key) =>
              key.startsWith(`shop_detail_v2_${currentShop.id}_`)
            )
          }
          scheduleRefresh()
        }
      )

    if (currentShop?.id) {
      channel = channel.on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "shops", filter: `id=eq.${currentShop.id}` },
        () => {
          invalidateCachedFetchStore((key) =>
            key.startsWith(`shop_detail_v2_${currentShop.id}_`)
          )
          scheduleRefresh()
        }
      )
    }

    if (user?.id) {
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "wishlist", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const changedProductId = payload.new?.product_id || payload.old?.product_id
          if (String(changedProductId) === String(productId)) {
            scheduleRefresh()
          }
        }
      )
    }

    channel
      .subscribe((status) => {
        if (status === "TIMED_OUT" || status === "CHANNEL_ERROR") {
          scheduleRefresh()
        }
      })

    return () => {
      if (refreshTimerId) {
        window.clearTimeout(refreshTimerId)
      }
      supabase.removeChannel(channel)
    }
  }, [currentShop?.id, isPublicRepoMode, mutate, productId, user?.id])

  const galleryImages = useMemo(() => {
    return [...new Set(productImages)]
  }, [productImages])

  const activeDisplayImage =
    galleryImages[activeImageIndex] ||
    galleryImages[0] ||
    selectedImage ||
    currentProduct?.image_url ||
    ""

  useEffect(() => {
    if (!currentProduct) return

    setActiveImageIndex(0)
    setSelectedImage(productImages[0] || "")
  }, [currentProduct, productImages])

  useEffect(() => {
    if (galleryImages.length <= 1) return undefined

    const intervalId = window.setInterval(() => {
      setActiveImageIndex((current) => (current + 1) % galleryImages.length)
    }, 3400)

    return () => window.clearInterval(intervalId)
  }, [currentProduct?.id, galleryImages.length])

  useEffect(() => {
    const nextImage = galleryImages[activeImageIndex] || galleryImages[0] || ""
    if (nextImage) {
      setSelectedImage(nextImage)
    }
  }, [activeImageIndex, galleryImages])

  const hasDiscount = useMemo(() => {
    if (!currentProduct) return false
    return (
      currentProduct.discount_price &&
      Number(currentProduct.discount_price) < Number(currentProduct.price)
    )
  }, [currentProduct])

  const discountPercent = useMemo(() => {
    if (!hasDiscount || !currentProduct?.price) return 0
    return Math.round(
      ((Number(currentProduct.price) - Number(currentProduct.discount_price)) /
        Number(currentProduct.price)) *
        100
    )
  }, [hasDiscount, currentProduct])

  const stockCount = useMemo(() => {
    if (!currentProduct) return 0
    return typeof currentProduct.stock_count === "number"
      ? currentProduct.stock_count
      : 1
  }, [currentProduct])

  const technicalAttributes = useMemo(() => {
    if (!currentProduct?.attributes) return {}
    const attrs = { ...currentProduct.attributes }
    delete attrs["Key Features"]
    delete attrs["What's in the Box"]
    delete attrs["Warranty"]
    return attrs
  }, [currentProduct])

  async function goBack() {
    const repoSuffix = isRepoSearchEntry && repoRef ? buildRepoSearchQuerySuffix(repoRef, repoSearchIntent) : ""
    if (shopSrc) {
      navigate(`/shop-detail?id=${shopSrc}${repoSuffix}`, {
        replace: true,
        state: {
          fromRepoSearch: isRepoSearchEntry,
          repoSearchConfirmed: isRepoSearchEntry,
          repoSearchIntent,
        },
      })
      return
    }

    if (document.referrer && document.referrer.includes(window.location.hostname)) {
      navigate(-1)
      return
    }

    navigate(user?.id ? "/user-dashboard" : "/", { replace: true })
  }

  const productStructuredData = useMemo(() => {
    if (!currentProduct || !currentShop) return null
    const price = currentProduct.discount_price || currentProduct.price
    return {
      "@context": "https://schema.org",
      "@type": "Product",
      "name": currentProduct.name,
      "image": selectedImage || currentProduct.image_url,
      "description": currentProduct.description,
      "sku": currentProduct.id.toString(),
      "brand": {
        "@type": "Brand",
        "name": currentShop.name
      },
      "offers": {
        "@type": "Offer",
        "url": window.location.href,
        "priceCurrency": "NGN",
        "price": price,
        "availability": stockCount > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
        "seller": {
          "@type": "Organization",
          "name": currentShop.name
        }
      }
    }
  }, [currentProduct, currentShop, selectedImage, stockCount])

  async function toggleWishlist() {
    if (!user) {
      notify({ type: "info", title: "Login required", message: "Please login to save items to your wishlist." })
      return
    }

    const next = !isInWishlist
    setIsInWishlist(next) // Optimistic update

    try {
      if (next) {
        const { data: existingItems, error: fetchError } = await supabase
          .from("wishlist")
          .select("id")
          .eq("user_id", user.id)
          .order("created_at", { ascending: true })

        if (fetchError) throw fetchError

        // Limit wishlist items per user to prevent abuse
        if (existingItems && existingItems.length >= 5) {
          const numToDelete = existingItems.length - 4
          const idsToDelete = existingItems.slice(0, numToDelete).map((item) => item.id)

          if (idsToDelete.length > 0) {
            const { error: deleteError } = await supabase
              .from("wishlist")
              .delete()
              .in("id", idsToDelete)
            if (deleteError) throw deleteError
          }
        }

        const { error: insertError } = await supabase.from("wishlist").insert({
          user_id: user.id,
          product_id: productId,
        })
        if (insertError) throw insertError

        // Invalidate relevant caches so dashboard and wishlist view update
        clearCachedFetchStore((key) => 
          key.startsWith("wishlist_items_") || 
          key.startsWith("dashboard_dynamic_")
        )
      } else {
        const { error: removeError } = await supabase
          .from("wishlist")
          .delete()
          .eq("user_id", user.id)
          .eq("product_id", productId)
        if (removeError) throw removeError

        // Invalidate relevant caches so dashboard and wishlist view update
        clearCachedFetchStore((key) => 
          key.startsWith("wishlist_items_") || 
          key.startsWith("dashboard_dynamic_")
        )
      }
    } catch (error) {
      console.error("Wishlist error:", error)
      setIsInWishlist(!next) // Rollback
      notify({ type: "error", title: "Wishlist update failed", message: "We could not update your wishlist. Please try again." })
    }
  }

  function handleSelectedImageError() {
    if (!galleryImages.length) return

    if (galleryImages.length === 1) {
      setSelectedImage("")
      return
    }

    setActiveImageIndex((current) => (current + 1) % galleryImages.length)
  }

  // --- EARLY RETURNS (Loading, Errors) ---

  function callMerchant() {
    if (!currentShop?.phone) {
      notify({ type: "error", title: "Phone unavailable", message: "This merchant has not provided a phone number." })
      return
    }

    void logShopAnalyticsEvent({
      shopId: currentShop.id,
      productId,
      eventType: "contact_phone",
      eventSource: isRepoSearchEntry ? "repo_search" : "product_detail",
      contactStatus: "opened",
      repoRef: isRepoSearchEntry ? repoRef : null,
      metadata: {
        screen: "product-detail",
        contact_channel: "phone",
      },
    })

    window.location.href = `tel:${currentShop.phone}`
  }

  function showSecurityModal() {
    if (!currentShop?.whatsapp) {
      notify({ type: "error", title: "WhatsApp unavailable", message: "This merchant has not provided a WhatsApp number." })
      return
    }
    setOpeningWhatsApp(false)
    setSecurityModalOpen(true)
  }

  function hideSecurityModal() {
    setSecurityModalOpen(false)
    setOpeningWhatsApp(false)
  }

  function launchWhatsApp() {
    if (!currentShop?.whatsapp || !currentProduct) return

    const phone = normalizeWhatsAppPhone(currentShop.whatsapp)
    if (!phone) {
      notify({ type: "error", title: "Invalid WhatsApp number", message: "This merchant's WhatsApp number is not valid yet." })
      return
    }

    const price = currentProduct.discount_price || currentProduct.price
    const message = `Hello *${currentShop.name}*, I found this on CTMerchant. I am interested in: ${currentProduct.name} (₦${Number(
      price || 0
    ).toLocaleString()})`

    const isDirectHandoff = shouldUseDirectWhatsAppHandoff()
    setOpeningWhatsApp(true)
    const didLaunch = openWhatsAppConversation(phone, message)
    if (!didLaunch) {
      setOpeningWhatsApp(false)
      notify({ type: "error", title: "WhatsApp did not open", message: "Please try again in a moment." })
      return
    }

    if (currentShop?.id) {
      void logShopAnalyticsEvent({
        shopId: currentShop.id,
        productId,
        eventType: "contact_whatsapp",
        eventSource: isRepoSearchEntry ? "repo_search" : "product_detail",
        contactStatus: "opened",
        repoRef: isRepoSearchEntry ? repoRef : null,
        metadata: {
          screen: "product-detail",
          contact_channel: "whatsapp",
        },
      })
    }

    if (!isDirectHandoff) {
      hideSecurityModal()
    }
  }

  useEffect(() => {
    if (!securityModalOpen || typeof document === "undefined") return undefined

    const resetLaunchState = () => {
      if (document.visibilityState === "visible") {
        setOpeningWhatsApp(false)
      }
    }

    document.addEventListener("visibilitychange", resetLaunchState)
    window.addEventListener("pageshow", resetLaunchState)

    return () => {
      document.removeEventListener("visibilitychange", resetLaunchState)
      window.removeEventListener("pageshow", resetLaunchState)
    }
  }, [securityModalOpen])

  async function shareProductWithImage() {
    if (!currentProduct) return

    const title = currentProduct.name || "Product"
    const priceText =
      currentProduct.discount_price && Number(currentProduct.discount_price) < Number(currentProduct.price)
        ? `₦${Number(currentProduct.discount_price).toLocaleString()} (Special Offer: Was ₦${Number(currentProduct.price).toLocaleString()}, -${discountPercent}% OFF)`
        : `₦${Number(currentProduct.price || 0).toLocaleString()}`

    const shopName = currentShop?.name || "our shop"
    const cityName = currentShop?.cities?.name || "your local"
    const text = `Check out ${title} for ${priceText}. ${shopName}. ${cityName} biz repository.`
    const url = window.location.href

    try {
      if (navigator.share) {
        let file = null
        if (currentProduct.image_url) {
          try {
            const response = await fetch(currentProduct.image_url)
            const blob = await response.blob()
            file = new File([blob], "product.jpg", { type: blob.type })
          } catch { /* ignore image fetch error */ }
        }

        if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ title, text, url, files: [file] })
        } else {
          await navigator.share({ title, text, url })
        }
      } else {
        await navigator.clipboard.writeText(`${text}\n${url}`)
        notify({ type: "success", title: "Link copied", message: "The product link was copied to your clipboard." })
      }
    } catch (error) {
      console.error("Error sharing:", error)
    }
  }

  function formatCurrency(value) {
    return `₦${Number(value || 0).toLocaleString()}`
  }

  async function openProductWithTransition(nextProductId, nextShopId = null) {
    if (!nextProductId) return
    const repoSuffix = isRepoSearchEntry && repoRef ? buildRepoSearchQuerySuffix(repoRef, repoSearchIntent) : ""
    const destinationShopId = nextShopId || currentShop?.id || shopSrc || ""

    const nextCacheKey = isPublicRepoMode
      ? `repo_public_product_${repoRef || "unknown"}_${nextProductId || "unknown"}`
      : buildProductDetailCacheKey(nextProductId, user?.id || null)
    const cachedEntry = readCachedFetchStore(nextCacheKey)
    const hasFreshCache =
      cachedEntry && Date.now() - cachedEntry.timestamp <= 1000 * 60 * 5

    setProductTransition({
      pending: true,
      productId: nextProductId,
      shopId: destinationShopId,
      error: "",
    })

    try {
      let prefetchedProductData = cachedEntry?.data || null

      if (!hasFreshCache) {
        const transitionResult = await new Promise((resolve, reject) => {
          const timeoutId = window.setTimeout(() => {
            reject(new Error("Timed out while opening the product."))
          }, 10000)

          const fetcher = isPublicRepoMode
            ? fetchPublicRepoProductDetail({
                repoRef,
                productId: nextProductId,
                shopId: destinationShopId,
              })
            : fetchProductDetailData({
                productId: nextProductId,
                userId: user?.id || null,
              })

          fetcher
            .then((prefetchedData) => {
              window.clearTimeout(timeoutId)
              resolve(prefetchedData)
            })
            .catch((transitionError) => {
              window.clearTimeout(timeoutId)
              reject(transitionError)
            })
        })

        prefetchedProductData = transitionResult
        primeCachedFetchStore(nextCacheKey, transitionResult, Date.now(), {
          persist: "session",
        })
      }

      navigate(
        `/product-detail?id=${nextProductId}${destinationShopId ? `&shop_src=${destinationShopId}` : ""}${repoSuffix}`,
        {
          state: {
            fromProductTransition: true,
            fromRepoSearch: isRepoSearchEntry,
            repoSearchConfirmed: isRepoSearchEntry,
            repoSearchIntent,
            prefetchedProductData,
          },
        }
      )
    } catch (transitionError) {
      const safeMessage = isNetworkError(transitionError)
        ? "We could not open this product right now. Please try again."
        : getFriendlyErrorMessage(
            transitionError,
            "We could not open this product right now. Please try again."
          )

      setProductTransition({
        pending: false,
        productId: nextProductId,
        shopId: destinationShopId,
        error: safeMessage,
      })
    }
  }

  function renderMiniRecommendation(product) {
    const itemHasDiscount = product.discount_price && Number(product.discount_price) < Number(product.price)
    const itemDiscountPercent = itemHasDiscount
      ? Math.round(((Number(product.price) - Number(product.discount_price)) / Number(product.price)) * 100)
      : 0

    return (
      <button
        type="button"
        key={product.id}
        className="mini-card flex w-[150px] shrink-0 cursor-pointer flex-col overflow-hidden rounded-lg border border-slate-200 bg-white text-left transition hover:border-pink-600 hover:shadow-[0_4px_8px_rgba(0,0,0,0.05)] focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-2"
        onClick={() => openProductWithTransition(product.id, product.shop_id)}
      >
        <div className="mini-img-wrap relative aspect-square w-full bg-white">
          {itemHasDiscount ? (
            <div className="grid-badge flash-offer absolute left-1 top-1 z-[2] rounded bg-red-600 px-1 py-0.5 text-[0.65rem] font-extrabold text-white">
              -{itemDiscountPercent}%
            </div>
          ) : null}

          <StableImage
            src={product.image_url}
            alt={product.name}
            containerClassName="h-full w-full bg-white"
            className="h-full w-full object-contain mix-blend-multiply"
          />
        </div>

        <div className="mini-card-body flex flex-1 flex-col justify-between p-2.5">
          <div className="mini-title mb-1 line-clamp-2 text-[0.8rem] font-semibold leading-[1.3] text-[#0F1111]">
            {product.name}
          </div>
          <div className="mini-price text-[0.95rem] font-extrabold text-pink-600">
            {itemHasDiscount ? (
              <>
                <span className="mini-old-price mr-1 text-[0.7rem] text-slate-400 line-through">
                  {formatCurrency(product.price)}
                </span>
                {formatCurrency(product.discount_price)}
              </>
            ) : (
              formatCurrency(product.price)
            )}
          </div>
        </div>
      </button>
    )
  }

  // --- EARLY RETURNS (Loading, Errors) ---
  if (!productId) {
    return (
      <GlobalErrorScreen
        title="Product unavailable"
        message="This product link is incomplete or no longer available."
        onBack={goBack}
      />
    )
  }

  if (!data && (authLoading || dataLoading)) {
    return <ProductDetailEntrySkeleton />
  }

  if (error && !data) {
    return (
      <GlobalErrorScreen
        error={error}
        message={getRetryingMessage(error)}
        onRetry={mutate}
        onBack={goBack}
      />
    )
  }

  return (
    <>
      <PageTransitionOverlay
        visible={productTransition.pending}
        error={productTransition.error}
        onRetry={() => {
          if (productTransition.productId) {
            void openProductWithTransition(productTransition.productId, productTransition.shopId)
          }
        }}
        onDismiss={() =>
          setProductTransition({
            pending: false,
            productId: "",
            shopId: "",
            error: "",
          })
        }
      />
      <PageSeo
        title={
          currentProduct?.name
            ? `${currentProduct.name} | CTMerchant Product`
            : "Product Details | CTMerchant"
        }
        description={
          currentProduct?.description ||
          "View product details, prices, availability, and merchant contact options on CTMerchant."
        }
        canonicalPath={`/product-detail${productId ? `?id=${encodeURIComponent(productId)}` : ""}`}
        image={activeDisplayImage || currentProduct?.image_url || "/ctm-logo.jpg"}
        structuredData={productStructuredData}
      />
      <div
        className={`mx-auto flex min-h-screen max-w-[1200px] flex-col bg-[#E3E6E6] pb-[90px] ${
          location.state?.fromProductTransition || location.state?.fromDiscoveryTransition
            ? "ctm-page-enter"
            : ""
        } ${productTransition.pending ? "pointer-events-none select-none" : ""}`}
      >
        <header className="sticky top-0 z-[100] flex items-center justify-between bg-[#131921] px-4 py-3 text-white shadow-[0_4px_6px_rgba(0,0,0,0.1)]">
          <button type="button" onClick={goBack} className="shrink-0 text-[1.2rem] transition hover:text-pink-500">
            <FaArrowLeft />
          </button>

          <div className="pointer-events-none absolute left-1/2 max-w-[60vw] -translate-x-1/2 text-center">
            <span className="block truncate text-[1.05rem] font-black tracking-tight">
              {productCityHubTitle}
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-4">
            <button
              id="wishlist-btn"
              type="button"
              onClick={toggleWishlist}
              className={`text-[1.2rem] transition ${isInWishlist ? "text-pink-500" : "text-white hover:text-pink-500"}`}
              aria-label="Add to Wishlist"
            >
              <FaHeart />
            </button>
            <button
              type="button"
              onClick={shareProductWithImage}
              className="text-[1.2rem] text-white transition hover:text-pink-500"
              aria-label="Share"
            >
              <FaShareNodes />
            </button>
          </div>
        </header>

        {!isLoggedIn ? (
          <div className="px-4 pt-4">
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

        <div className="main-layout flex w-full flex-col lg:flex-row lg:gap-6 lg:bg-transparent lg:p-10">
          <div className="left-col lg:flex-1">
            <section className="content-block mb-2 overflow-hidden bg-white !p-0 lg:mb-6 lg:rounded-lg lg:border lg:border-slate-300 lg:shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
              <div className="image-container flex w-full flex-col items-center bg-white">
                <div className="main-img-wrapper relative flex aspect-square w-full items-center justify-center overflow-hidden bg-[#F7F7F7] lg:max-h-[500px]">
                  {hasDiscount ? (
                    <div className="flash-offer absolute left-4 top-4 z-10 rounded-md bg-red-600 px-2.5 py-1 text-[0.85rem] font-extrabold text-white shadow-[0_4px_10px_rgba(220,38,38,0.3)] lg:left-5 lg:top-5 lg:px-3 lg:py-1.5 lg:text-[0.95rem]">
                      -{discountPercent}% OFF
                    </div>
                  ) : null}

                  {galleryImages.length ? (
                    galleryImages.map((image, index) => (
                      <div
                        key={image}
                        className={`absolute inset-0 transition-all duration-700 ease-out ${
                          index === activeImageIndex
                            ? "scale-100 opacity-100"
                            : "pointer-events-none scale-[1.035] opacity-0"
                        }`}
                      >
                        <StableImage
                          src={image}
                          alt={currentProduct?.name || "Product"}
                          containerClassName="h-full w-full bg-[#F7F7F7]"
                          className="block h-full w-full object-contain mix-blend-multiply"
                          loading={index === 0 ? "eager" : "lazy"}
                          fetchPriority={index === 0 ? "high" : undefined}
                          onError={index === activeImageIndex ? handleSelectedImageError : undefined}
                        />
                      </div>
                    ))
                  ) : (
                    <StableImage
                      src={activeDisplayImage}
                      alt={currentProduct?.name || "Product"}
                      containerClassName="h-full w-full bg-[#F7F7F7]"
                      className="block h-full w-full object-contain mix-blend-multiply"
                      onError={handleSelectedImageError}
                    />
                  )}

                  {galleryImages.length > 1 ? (
                    <div className="absolute bottom-4 left-0 right-0 z-10 flex items-center justify-center gap-2">
                      {galleryImages.map((image, index) => (
                        <span
                          key={`${image}-indicator`}
                          className={`h-1.5 rounded-full transition-all duration-500 ${
                            index === activeImageIndex
                              ? "w-8 bg-pink-600 shadow-[0_0_12px_rgba(219,39,119,0.45)]"
                              : "w-2 bg-slate-300/90"
                          }`}
                        />
                      ))}
                    </div>
                  ) : null}
                </div>

                {currentShop ? (
                  <div className="w-full border-t border-slate-100 bg-white p-4">
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={showSecurityModal}
                        disabled={!isLoggedIn || !currentShop.whatsapp || stockCount <= 0}
                        title={stockCount > 0 ? "Contact seller on WhatsApp" : "Out of stock"}
                        className="group relative min-h-[86px] overflow-hidden rounded-[24px] bg-gradient-to-br from-[#18A84C] via-[#25D366] to-[#0F8F3A] px-3 py-4 text-center text-white shadow-[0_16px_30px_rgba(37,211,102,0.26)] transition hover:-translate-y-0.5 hover:shadow-[0_20px_38px_rgba(37,211,102,0.35)] disabled:cursor-not-allowed disabled:from-slate-300 disabled:via-slate-300 disabled:to-slate-400 disabled:shadow-none"
                      >
                        <span className="absolute -right-4 -top-5 h-20 w-20 rounded-full bg-white/20 blur-xl transition group-hover:scale-125" />
                        <span className="absolute left-4 top-4 h-2.5 w-2.5 rounded-full bg-white/70 animate-ping" />
                        <span className="relative flex items-center justify-center gap-2 text-[1.05rem] font-black">
                          <FaWhatsapp className="text-[1.45rem]" />
                          WhatsApp
                        </span>
                        <span className="relative mt-1 block text-[0.68rem] font-extrabold uppercase tracking-[0.16em] text-white/85">
                          WhatsApp seller
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={callMerchant}
                        disabled={!isLoggedIn || !currentShop.phone || stockCount <= 0}
                        title={stockCount > 0 ? "Call seller" : "Out of stock"}
                        className="group relative min-h-[86px] overflow-hidden rounded-[24px] bg-gradient-to-br from-[#0F7285] via-[#007185] to-[#083344] px-3 py-4 text-center text-white shadow-[0_16px_30px_rgba(0,113,133,0.22)] transition hover:-translate-y-0.5 hover:shadow-[0_20px_38px_rgba(0,113,133,0.32)] disabled:cursor-not-allowed disabled:from-slate-300 disabled:via-slate-300 disabled:to-slate-400 disabled:shadow-none"
                      >
                        <span className="absolute right-4 top-4 flex gap-1">
                          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/85" />
                          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/75 [animation-delay:120ms]" />
                          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/65 [animation-delay:240ms]" />
                        </span>
                        <span className="absolute -left-5 bottom-0 h-20 w-20 rounded-full bg-white/10 blur-xl transition group-hover:scale-125" />
                        <span className="relative flex items-center justify-center gap-2 text-[1.05rem] font-black">
                          <FaPhone className="text-[1.2rem]" />
                          Call
                        </span>
                        <span className="relative mt-1 block text-[0.68rem] font-extrabold uppercase tracking-[0.16em] text-white/85">
                          Call seller now
                        </span>
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        if (!currentShop?.id) return
                        const repoSuffix = isPublicRepoMode ? buildRepoSearchQuerySuffix(repoRef, repoSearchIntent) : ""
                        navigate(`/shop-detail?id=${currentShop.id}${repoSuffix}`, {
                          state: {
                            fromRepoSearch: isRepoSearchEntry,
                            repoSearchConfirmed: isRepoSearchEntry,
                            repoSearchIntent,
                          },
                        })
                      }}
                      className="mt-3 w-full rounded-[24px] border border-pink-100 bg-gradient-to-br from-white via-pink-50/70 to-orange-50 px-4 py-4 text-left shadow-[0_12px_28px_rgba(15,23,42,0.07)] transition hover:-translate-y-0.5 hover:border-pink-200 hover:shadow-[0_16px_34px_rgba(219,39,119,0.12)]"
                    >
                      <span className="flex items-center gap-2 text-[1rem] font-black text-pink-700">
                        <FaStore />
                        Visit shop
                      </span>
                      <span className="mt-1 flex items-start gap-2 text-[0.82rem] font-semibold leading-5 text-slate-600">
                        <FaLocationDot className="mt-1 shrink-0 text-pink-500" />
                        {currentShop.address || "Address not provided."}
                      </span>
                    </button>
                  </div>
                ) : null}
              </div>
            </section>
          </div>

          <div className="right-col flex flex-col lg:flex-[1.2]">
            <section className="content-block mb-2 bg-white px-5 py-6 lg:mb-6 lg:rounded-lg lg:border lg:border-slate-300 lg:shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
              <span
                className={`mb-3 inline-block rounded px-3 py-1 text-[0.75rem] font-extrabold uppercase tracking-[0.5px] ${
                  currentProduct?.condition === "Fairly Used"
                    ? "border border-orange-300 bg-orange-50 text-[#C40000]"
                    : "border border-slate-300 bg-slate-100 text-[#007185]"
                }`}
              >
                {currentProduct?.condition || "New"}
              </span>

              <h1 className="mb-2 text-[1.4rem] font-extrabold leading-[1.3] text-[#0F1111]">
                {currentProduct?.name}
              </h1>

              <div className="mb-2 flex flex-wrap items-baseline gap-3">
                <span className="text-[2rem] font-extrabold text-pink-600 lg:text-[2.2rem]">
                  {hasDiscount ? formatCurrency(currentProduct.discount_price) : formatCurrency(currentProduct?.price)}
                </span>
                {hasDiscount ? (
                  <span className="text-[1rem] font-medium text-slate-500 line-through lg:text-[1.2rem]">
                    {formatCurrency(currentProduct.price)}
                  </span>
                ) : null}
              </div>

              {/* Promo & Stock Widget */}
              <div className="mt-4">
                {stockCount <= 0 ? (
                  <div className="flex items-center gap-2 text-[0.95rem] font-bold text-slate-500">
                    <FaTriangleExclamation className="text-slate-400" />
                    Currently unavailable
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {hasDiscount ? (
                      <div className="relative flex items-center gap-4 overflow-hidden rounded-[22px] bg-gradient-to-br from-[#BE185D] via-[#9D174D] to-[#831843] px-5 py-4 text-white shadow-lg shadow-pink-100/50">
                        {/* Decorative Background Icon */}
                        <FaBolt className="absolute -right-4 -top-4 text-[7rem] opacity-10" />
                        
                        <div className="relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/20 text-xl backdrop-blur-md">
                          <FaBolt className="animate-pulse text-yellow-300" />
                        </div>
                        
                        <div className="relative z-10 flex-1">
                          <div className="flex items-center gap-2 text-[0.7rem] font-black uppercase tracking-[0.15em] text-pink-100/90">
                            <FaClock className="text-[0.65rem]" /> Flash Promo Active
                          </div>
                          <div className="mt-0.5 text-[1.05rem] font-black leading-tight tracking-tight">
                            Hurry now, promo ends soon!
                          </div>
                        </div>

                        <div className="relative z-10 hidden sm:block">
                           <div className="rounded-full bg-white/10 px-3 py-1 text-[0.65rem] font-black uppercase tracking-tighter backdrop-blur-sm">
                             Limited Time
                           </div>
                        </div>
                      </div>
                    ) : null}

                    <div className="flex items-center gap-3">
                      <div className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[0.85rem] font-black ${
                        stockCount <= 5 ? 'bg-orange-50 text-[#B12704] border border-orange-100' : 'bg-emerald-50 text-[#007185] border border-emerald-100'
                      }`}>
                        {stockCount <= 5 ? <FaTriangleExclamation className="text-[0.75rem]" /> : <FaCircleCheck className="text-[0.75rem]" />}
                        {stockCount} in stock
                      </div>
                      {stockCount <= 5 && (
                        <span className="text-[0.8rem] font-bold text-slate-500 italic">
                          (Limited availability)
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </section>

            <section className="content-block mb-2 flex-1 bg-white px-5 py-6 lg:mb-6 lg:rounded-lg lg:border lg:border-slate-300 lg:shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
              <div className="flex flex-col gap-6">
                {currentProduct?.attributes?.["Key Features"] ? (
                  <div>
                    <div className="mb-2 flex items-center border-b-2 border-slate-100 pb-1.5 text-[1.05rem] font-extrabold text-[#0F1111]">
                      <FaStar className="mr-2 text-pink-600" /> Key Features
                    </div>
                    <p className="whitespace-pre-wrap text-[0.95rem] leading-7 text-slate-600">
                      {currentProduct.attributes["Key Features"]}
                    </p>
                  </div>
                ) : null}

                <div>
                  <div className="mb-2 border-b-2 border-slate-100 pb-1.5 text-[1.05rem] font-extrabold text-[#0F1111]">
                    Full Description
                  </div>
                  <p className="line-clamp-2 whitespace-pre-wrap text-[0.95rem] leading-7 text-slate-600">
                    {productDescription}
                  </p>
                  {currentProduct?.description?.trim() ? (
                    <button
                      type="button"
                      onClick={() => setDescriptionModalOpen(true)}
                      className="mt-2 text-[0.85rem] font-black text-pink-600 transition hover:text-pink-700 hover:underline"
                    >
                      View all
                    </button>
                  ) : null}
                </div>

                {Object.keys(technicalAttributes).length > 0 ? (
                  <div className="overflow-hidden rounded-md border border-slate-300">
                    {Object.entries(technicalAttributes).map(([key, value]) => {
                      const cleanKey = key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
                      return (
                        <div key={key} className="flex border-b border-slate-300 bg-white px-4 py-3 last:border-b-0">
                          <span className="flex-1 text-[0.9rem] font-bold text-[#0F1111]">{cleanKey}</span>
                          <span className="flex-[2] text-[0.9rem] font-medium text-slate-600">{String(value)}</span>
                        </div>
                      )
                    })}
                  </div>
                ) : null}

                {currentProduct?.attributes?.["What's in the Box"] ? (
                  <div>
                    <div className="mb-2 flex items-center border-b-2 border-slate-100 pb-1.5 text-[1.05rem] font-extrabold text-[#0F1111]">
                      <FaBoxOpen className="mr-2 text-pink-600" /> What's in the Box
                    </div>
                    <p className="whitespace-pre-wrap text-[0.95rem] leading-7 text-slate-600">
                      {currentProduct.attributes["What's in the Box"]}
                    </p>
                  </div>
                ) : null}

                {currentProduct?.attributes?.Warranty ? (
                  <div>
                    <div className="mb-2 flex items-center border-b-2 border-slate-100 pb-1.5 text-[1.05rem] font-extrabold text-[#0F1111]">
                      <FaShieldHalved className="mr-2 text-pink-600" /> Warranty
                    </div>
                    <p className="whitespace-pre-wrap text-[0.95rem] leading-7 text-slate-600">
                      {currentProduct.attributes.Warranty}
                    </p>
                  </div>
                ) : null}
              </div>
            </section>

            <section className="content-block bg-white px-5 py-6 lg:rounded-lg lg:border lg:border-slate-300 lg:shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
              <div className="mb-3 text-[0.85rem] font-extrabold uppercase tracking-[0.5px] text-pink-600">
                Retailer Information
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-5">
                <div className="mb-2 flex items-center font-extrabold text-[#0F1111]">
                  <FaMapPin className="mr-2 text-pink-600" />
                  <span>{currentShop?.name || "Loading..."}</span>
                </div>
                <div className="flex items-start text-[0.9rem] text-slate-600">
                  <FaLocationDot className="mr-2 mt-1 shrink-0 text-slate-400" />
                  <span className="leading-6">{currentShop?.address || "..."}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!currentShop?.id) return
                  const repoSuffix = isPublicRepoMode ? buildRepoSearchQuerySuffix(repoRef, repoSearchIntent) : ""
                  navigate(`/shop-detail?id=${currentShop.id}${repoSuffix}`, {
                    state: {
                      fromRepoSearch: isRepoSearchEntry,
                      repoSearchConfirmed: isRepoSearchEntry,
                      repoSearchIntent,
                    },
                  })
                }}
                className="mt-3 w-full rounded-lg border border-slate-300 bg-transparent px-4 py-3 font-bold text-[#0F1111] transition hover:border-slate-400 hover:bg-white"
              >
                View Full Shop Catalog
              </button>
            </section>
          </div>
        </div>

        {recommendations.length > 0 ? (
          <section className="mt-2 bg-white px-5 py-6 lg:mt-0 lg:rounded-lg lg:border lg:border-slate-300 lg:shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
            <h2 className="mb-4 text-[1.05rem] font-extrabold text-[#0F1111]">Recommended For You</h2>
            <div className="flex gap-4 overflow-x-auto pb-3">
              {recommendations.map(renderMiniRecommendation)}
            </div>
          </section>
        ) : null}
      </div>

      <AiAssistantWidget 
        mode="shopping" 
        isRepoSearch={isPublicRepoMode}
        shopData={currentShop ? { 
          id: currentShop.id, 
          name: currentShop.name, 
          category: currentShop.category,
          city: currentShop.cities?.name 
        } : null}
        productData={currentProduct ? {
          id: currentProduct.id,
          name: currentProduct.name,
          price: currentProduct.discount_price || currentProduct.price
        } : null}
      />

      {securityModalOpen ? (
        <div className="fixed inset-0 z-[5000] flex items-center justify-center bg-[rgba(19,25,33,0.8)] px-4 backdrop-blur-[2px]">
          <div className="w-full max-w-[350px] rounded-lg border border-slate-300 bg-white p-8 text-center shadow-[0_20px_25px_-5px_rgba(0,0,0,0.2)]">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-pink-100">
              <FaShieldHalved className="text-[1.8rem] text-pink-600" />
            </div>
            <h3 className="mb-3 text-[1.25rem] font-extrabold text-[#0F1111]">Security Notice</h3>
            <p className="text-[0.9rem] leading-6 text-slate-600">
              To protect merchants from spam, your User ID will be securely recorded. Please ensure this inquiry is business-related.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={hideSecurityModal}
                className="flex-1 rounded-md border border-slate-300 bg-white px-4 py-3 font-bold text-[#0F1111] transition hover:bg-[#F7FAFA]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={launchWhatsApp}
                disabled={openingWhatsApp}
                className="flex-1 rounded-md bg-[#25D366] px-4 py-3 font-bold text-white transition hover:bg-green-600 disabled:cursor-wait disabled:opacity-70"
              >
                {openingWhatsApp ? "Opening WhatsApp..." : "Continue to Chat"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {descriptionModalOpen ? (
        <div className="fixed inset-0 z-[5000] flex items-end justify-center bg-[rgba(15,23,42,0.72)] px-3 pb-3 backdrop-blur-[2px] sm:items-center sm:p-4">
          <div className="max-h-[82vh] w-full max-w-[560px] overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.35)]">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div className="min-w-0">
                <p className="text-[0.68rem] font-black uppercase tracking-[0.2em] text-pink-600">
                  Product Details
                </p>
                <h3 className="truncate text-[1.05rem] font-black text-slate-950">
                  Full Description
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setDescriptionModalOpen(false)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700 transition hover:bg-slate-200"
                aria-label="Close full description"
              >
                <FaXmark />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto px-5 py-5">
              <p className="whitespace-pre-wrap text-[0.95rem] leading-7 text-slate-700">
                {productDescription}
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

export default ProductDetail
