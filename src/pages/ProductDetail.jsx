import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import {
  FaArrowLeft,
  FaBoxOpen,
  FaHeart,
  FaLocationDot,
  FaMapPin,
  FaPaperPlane,
  FaPhone,
  FaRobot,
  FaShareNodes,
  FaShieldHalved,
  FaStar,
  FaTriangleExclamation,
  FaXmark,
} from "react-icons/fa6"
import { FaWhatsapp } from "react-icons/fa"
import { supabase } from "../lib/supabase"
import useAuthSession from "../hooks/useAuthSession"
import useCachedFetch from "../hooks/useCachedFetch"
import { ShimmerBlock } from "../components/common/Shimmers"
import usePreventPullToRefresh from "../hooks/usePreventPullToRefresh"
import StableImage from "../components/common/StableImage"
import PageSeo from "../components/common/PageSeo"
import { getFriendlyErrorMessage } from "../lib/friendlyErrors"

// --- PROFESSIONAL SHIMMER COMPONENT ---
function ProductDetailShimmer() {
  return (
    <div className="min-h-screen bg-[#E3E6E6] pb-[90px]">
      <header className="sticky top-0 z-[100] flex items-center justify-between bg-[#131921] px-4 py-3 shadow-[0_4px_6px_rgba(0,0,0,0.1)]">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <ShimmerBlock className="h-6 w-6 rounded bg-white/20" />
          <div className="flex flex-col gap-1">
            <ShimmerBlock className="h-5 w-32 rounded bg-white/20" />
            <ShimmerBlock className="h-3 w-20 rounded bg-white/10" />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-4">
          <ShimmerBlock className="h-6 w-6 rounded bg-white/20" />
          <ShimmerBlock className="h-6 w-6 rounded bg-white/20" />
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1200px] flex-col lg:flex-row lg:gap-6 lg:p-10">
        <div className="lg:flex-1">
          <ShimmerBlock className="aspect-square w-full rounded-none bg-white lg:rounded-lg" />
        </div>
        <div className="mt-2 flex flex-col gap-4 px-4 lg:mt-0 lg:flex-[1.2] lg:px-0">
          <ShimmerBlock className="h-12 w-full max-w-[400px] rounded-lg bg-white p-6" />
          <ShimmerBlock className="h-[250px] w-full rounded-lg bg-white p-6" />
        </div>
      </div>
    </div>
  )
}

function ProductDetail() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const chatBodyRef = useRef(null)

  const productId = searchParams.get("id")
  const shopSrc = searchParams.get("shop_src")

  usePreventPullToRefresh()

  // 1. Unified Auth State
  const { user, loading: authLoading } = useAuthSession()

  // 2. Extracted Data Fetching Logic for Hook
  const fetchProductData = async () => {
    const { data: product, error: productError } = await supabase
      .from("products")
      .select("*")
      .eq("id", productId)
      .single()

    if (productError || !product) {
      throw new Error("Product fetch failed.")
    }

    let shop = null
    let recs = []
    let initialWishlist = false

    const tasks = []

    if (product.shop_id) {
      tasks.push(
        supabase
          .from("shops")
          .select("id, name, whatsapp, phone, address, city_id, areas(name), cities(name)")
          .eq("id", product.shop_id)
          .maybeSingle()
          .then((res) => {
            if (res.data) shop = res.data
          })
      )
    }

    if (product.category) {
      tasks.push(
        supabase
          .from("products")
          .select("id, name, price, discount_price, image_url")
          .eq("category", product.category)
          .neq("id", product.id)
          .eq("is_available", true)
          .limit(10)
          .then((res) => {
            if (res.data) recs = res.data
          })
      )
    }

    if (user?.id) {
      tasks.push(
        supabase
          .from("wishlist")
          .select("id")
          .eq("user_id", user.id)
          .eq("product_id", productId)
          .maybeSingle()
          .then((res) => {
            initialWishlist = Boolean(res.data)
          })
      )
    }

    await Promise.all(tasks)

    return { product, shop, recommendations: recs, initialWishlist }
  }

  // 3. Smart Caching Hook
  const cacheKey = `prod_detail_${productId}_${user?.id || 'anon'}`
  const { data, loading: dataLoading, error, isOffline } = useCachedFetch(
    cacheKey,
    fetchProductData,
    { dependencies: [productId, user?.id], ttl: 1000 * 60 * 5 }
  )

  // 4. Local Optimistic States
  const [selectedImage, setSelectedImage] = useState("")
  const [isInWishlist, setIsInWishlist] = useState(false)
  const [securityModalOpen, setSecurityModalOpen] = useState(false)

  // Chat States
  const [chatOpen, setChatOpen] = useState(false)
  const [chatInput, setChatInput] = useState("")
  const [chatHistory, setChatHistory] = useState([])
  const [chatMessages, setChatMessages] = useState([
    {
      role: "assistant",
      content: "Hi! I'm the CTMerchant Assistant. What would you like to know about this product?",
    },
  ])
  const [sendingChat, setSendingChat] = useState(false)

  // Computed Values from Cache
  const currentProduct = data?.product
  const currentShop = data?.shop
  const recommendations = data?.recommendations || []
  const isLoggedIn = Boolean(user?.id)

  // Sync optimistic states once data arrives
  useEffect(() => {
    if (data) {
      setIsInWishlist(data.initialWishlist)
      if (!selectedImage && data.product?.image_url) {
        setSelectedImage(data.product.image_url)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  const galleryImages = useMemo(() => {
    const images = [
      currentProduct?.image_url,
      currentProduct?.image_url_2,
      currentProduct?.image_url_3,
    ].filter(Boolean)

    return [...new Set(images)]
  }, [currentProduct])

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

  const stockMeta = useMemo(() => {
    if (!currentProduct) return { text: "", className: "text-slate-500" }

    if (stockCount <= 0) {
      return { text: "Currently unavailable.", className: "text-slate-500" }
    }

    if (stockCount <= 5 || hasDiscount) {
      return {
        text: `${stockCount} in stock${hasDiscount ? " - hurry now promo ends soon" : ""}`,
        className: "text-[#B12704]",
      }
    }

    return { text: `${stockCount} in stock`, className: "text-[#007185]" }
  }, [currentProduct, stockCount, hasDiscount])

  const technicalAttributes = useMemo(() => {
    if (!currentProduct?.attributes) return {}
    const attrs = { ...currentProduct.attributes }
    delete attrs["Key Features"]
    delete attrs["What's in the Box"]
    delete attrs["Warranty"]
    return attrs
  }, [currentProduct])

  useEffect(() => {
    if (!chatBodyRef.current) return
    chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight
  }, [chatMessages, sendingChat, chatOpen])

  function goBack() {
    if (shopSrc) {
      navigate(`/shop-detail?id=${shopSrc}`)
      return
    }
    if (document.referrer && document.referrer.includes(window.location.hostname)) {
      navigate(-1)
      return
    }
    if (currentProduct?.shop_id) {
      navigate(`/shop-detail?id=${currentProduct.shop_id}`)
      return
    }
    navigate("/user-dashboard")
  }

  async function toggleWishlist() {
    if (!user) {
      window.alert("Please login to save items to your wishlist.")
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
      } else {
        const { error: removeError } = await supabase
          .from("wishlist")
          .delete()
          .eq("user_id", user.id)
          .eq("product_id", productId)
        if (removeError) throw removeError
      }
    } catch (error) {
      console.error("Wishlist error:", error)
      setIsInWishlist(!next) // Rollback
      window.alert("Failed to update wishlist.")
    }
  }

  async function callMerchant() {
    if (!currentShop?.phone) {
      window.alert("No phone number provided.")
      return
    }

    if (user && currentShop) {
      supabase
        .from("call_clicks")
        .insert({
          clicker_id: user.id,
          shop_id: currentShop.id,
          product_id: parseInt(productId, 10),
        })
        .then(() => {})
        .catch(() => {})
    }

    window.open(`tel:${currentShop.phone}`, "_self")
  }

  function showSecurityModal() {
    if (!currentShop?.whatsapp) {
      window.alert("This merchant hasn't provided a WhatsApp number.")
      return
    }
    setSecurityModalOpen(true)
  }

  function hideSecurityModal() {
    setSecurityModalOpen(false)
  }

  async function launchWhatsApp() {
    hideSecurityModal()

    if (!currentShop?.whatsapp || !currentProduct) return

    let phone = currentShop.whatsapp.replace(/\D/g, "")
    if (phone.startsWith("0")) phone = `234${phone.slice(1)}`

    const price = currentProduct.discount_price || currentProduct.price
    const message = `Hello *${currentShop.name}*, I found this on CTMerchant. I am interested in: ${currentProduct.name} (₦${Number(
      price || 0
    ).toLocaleString()})`

    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer")

    if (currentShop?.id) {
      try {
        await supabase.from("whatsapp_clicks").insert({
          shop_id: currentShop.id,
          clicker_id: user ? user.id : null,
          product_id: parseInt(productId, 10),
        })
      } catch (error) {
        console.error("Failed to record WhatsApp click", error)
      }
    }
  }

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
        window.alert("Link copied to clipboard!")
      }
    } catch (error) {
      console.error("Error sharing:", error)
    }
  }

  function toggleChat() {
    setChatOpen((prev) => !prev)
  }

  async function sendMsg() {
    const text = chatInput.trim()
    if (!text || sendingChat || !currentProduct) return

    const nextUserMessage = { role: "user", content: text }
    setChatMessages((prev) => [...prev, nextUserMessage])
    setChatHistory((prev) => [...prev, nextUserMessage])
    setChatInput("")
    setSendingChat(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()

      const headers = {
        "Content-Type": "application/json",
        apikey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhkY2hhY2RqY2dhenlja2FjYnBjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1NDA2MzMsImV4cCI6MjA4NTExNjYzM30.41V3RaUX-ii-EHysbcVpUCgm0-RsNmuOb8FmYsz72Ow",
      }

      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`
      }

      const contextData = {
        page: "product_detail",
        product: currentProduct,
        shop: currentShop,
      }

      const response = await fetch(
        "https://xdchacdjcgazyckacbpc.supabase.co/functions/v1/ai-assistant",
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            query: text,
            history: [...chatHistory, nextUserMessage],
            context: contextData,
          }),
        }
      )

      if (!response.ok) throw new Error(`Server returned ${response.status}`)

      const resData = await response.json()
      const reply = resData.reply || "No response received."
      const isError = reply.startsWith("Error:") || reply.startsWith("System") || reply.startsWith("Config")

      const assistantMessage = { role: isError ? "error" : "assistant", content: reply }
      setChatMessages((prev) => [...prev, assistantMessage])

      if (!isError) {
        setChatHistory((prev) => [
          ...prev,
          nextUserMessage,
          { role: "assistant", content: reply },
        ])
      }
    } catch (error) {
      setChatMessages((prev) => [
        ...prev,
        { role: "error", content: getFriendlyErrorMessage(error, "Connection Error.") },
      ])
    } finally {
      setSendingChat(false)
    }
  }

  function formatCurrency(value) {
    return `₦${Number(value || 0).toLocaleString()}`
  }

  function renderMiniRecommendation(product) {
    const itemHasDiscount = product.discount_price && Number(product.discount_price) < Number(product.price)
    const itemDiscountPercent = itemHasDiscount
      ? Math.round(((Number(product.price) - Number(product.discount_price)) / Number(product.price)) * 100)
      : 0

    return (
      <div
        key={product.id}
        className="mini-card flex w-[150px] shrink-0 cursor-pointer flex-col overflow-hidden rounded-lg border border-slate-200 bg-white transition hover:border-pink-600 hover:shadow-[0_4px_8px_rgba(0,0,0,0.05)]"
        onClick={() => navigate(`/product-detail?id=${product.id}${currentShop?.id ? `&shop_src=${currentShop.id}` : ""}`)}
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
      </div>
    )
  }

  // --- EARLY RETURNS (Loading, Errors) ---
  if (!productId) {
    navigate("/user-dashboard", { replace: true })
    return null
  }

  if (authLoading || (dataLoading && !data)) {
    return <ProductDetailShimmer />
  }

  if (error && !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#E3E6E6] px-4">
        <div className="text-center">
          <FaTriangleExclamation className="mx-auto mb-4 text-5xl text-red-700" />
          <h3 className="mb-2 text-2xl font-extrabold text-[#0F1111]">Could not load this product</h3>
          <p className="text-slate-600">
            {getFriendlyErrorMessage(error, "Retry to load this product.")}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 rounded-md border border-slate-300 bg-white px-6 py-3 font-semibold shadow-sm transition hover:bg-slate-50"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
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
        image={selectedImage || currentProduct?.image_url || "/ctm-logo.jpg"}
      />
      <div className="mx-auto flex min-h-screen max-w-[1200px] flex-col bg-[#E3E6E6] pb-[90px]">
        <header className="sticky top-0 z-[100] flex items-center justify-between bg-[#131921] px-4 py-3 text-white shadow-[0_4px_6px_rgba(0,0,0,0.1)]">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <button type="button" onClick={goBack} className="shrink-0 text-[1.2rem] transition hover:text-pink-500">
              <FaArrowLeft />
            </button>
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-[1.05rem] font-bold">Product Details</span>
              <span className="flex items-center gap-1 text-[0.75rem] font-semibold text-slate-300">
                <FaLocationDot />
                {currentShop?.areas?.name || "Loading..."}
              </span>
            </div>
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
                <div className="main-img-wrapper relative flex aspect-square w-full items-center justify-center bg-[#F7F7F7] lg:max-h-[500px]">
                  {hasDiscount ? (
                    <div className="flash-offer absolute left-4 top-4 z-10 rounded-md bg-red-600 px-2.5 py-1 text-[0.85rem] font-extrabold text-white shadow-[0_4px_10px_rgba(220,38,38,0.3)] lg:left-5 lg:top-5 lg:px-3 lg:py-1.5 lg:text-[0.95rem]">
                      -{discountPercent}% OFF
                    </div>
                  ) : null}

                  <StableImage
                    src={selectedImage}
                    alt={currentProduct?.name || "Product"}
                    containerClassName="h-full w-full bg-[#F7F7F7]"
                    className="block h-full w-full object-contain mix-blend-multiply"
                  />
                </div>

                {galleryImages.length > 1 ? (
                  <div className="flex w-full gap-3 overflow-x-auto p-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {galleryImages.map((image) => (
                      <button
                        type="button"
                        key={image}
                        onClick={() => setSelectedImage(image)}
                        className={`h-[60px] w-[60px] shrink-0 overflow-hidden rounded-md transition ${
                          selectedImage === image
                            ? "border-2 border-pink-600 shadow-[0_2px_8px_rgba(219,39,119,0.2)]"
                            : "border-2 border-transparent"
                        }`}
                      >
                        <StableImage
                          src={image}
                          alt="Thumbnail"
                          containerClassName="h-full w-full bg-white"
                          className="h-full w-full object-cover"
                        />
                      </button>
                    ))}
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

              <div className={`text-[1rem] font-bold lg:text-[1.05rem] ${stockMeta.className}`}>
                {stockMeta.text}
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
                  <p className="whitespace-pre-wrap text-[0.95rem] leading-7 text-slate-600">
                    {currentProduct?.description || "No description provided by the merchant."}
                  </p>
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

              {currentShop && isLoggedIn ? (
                <div className="mt-5 flex w-full flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={callMerchant}
                    disabled={!currentShop.phone || stockCount <= 0}
                    className="min-w-[140px] flex-1 rounded-lg bg-[#007185] px-4 py-3.5 text-[1.05rem] font-bold text-white transition hover:bg-[#005A6A] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
                  >
                    <span className="inline-flex items-center gap-2">
                      <FaPhone /> {stockCount > 0 ? "Call Seller" : "Out of Stock"}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={showSecurityModal}
                    disabled={!currentShop.whatsapp || stockCount <= 0}
                    className="min-w-[140px] flex-1 rounded-lg bg-[#25D366] px-4 py-3.5 text-[1.05rem] font-bold text-white transition hover:bg-green-600 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
                  >
                    <span className="inline-flex items-center gap-2">
                      <FaWhatsapp /> {stockCount > 0 ? "WhatsApp" : "Out of Stock"}
                    </span>
                  </button>
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => (currentShop?.id ? navigate(`/shop-detail?id=${currentShop.id}`) : null)}
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

      {/* CHAT AI BUTTON & MODAL */}
      <div className="fixed bottom-5 right-5 z-[4000] flex flex-col items-center gap-1.5">
        <button
          type="button"
          onClick={toggleChat}
          className="flex h-14 w-14 items-center justify-center rounded-full border-none bg-pink-600 text-[1.5rem] text-white shadow-[0_4px_12px_rgba(219,39,119,0.4)] transition active:scale-95"
        >
          <FaRobot />
        </button>
        <span className="pointer-events-none whitespace-nowrap rounded-xl border border-slate-200 bg-white px-2 py-1 text-[0.7rem] font-extrabold text-pink-600 shadow">
          Ask AI
        </span>
      </div>

      <div
        className={`fixed bottom-[90px] right-5 z-[4000] flex h-[500px] w-[350px] flex-col overflow-hidden rounded-lg border border-slate-300 bg-white shadow-[0_10px_25px_rgba(0,0,0,0.15)] transition-all duration-300 max-[480px]:bottom-0 max-[480px]:left-0 max-[480px]:right-0 max-[480px]:h-[85vh] max-[480px]:w-full max-[480px]:rounded-b-none ${
          chatOpen ? "pointer-events-auto translate-y-0 opacity-100" : "pointer-events-none translate-y-5 opacity-0"
        }`}
      >
        <div className="flex items-center justify-between bg-[#131921] px-4 py-3 text-white">
          <span className="font-bold">
            <FaRobot className="mr-2 inline" /> Product Concierge
          </span>
          <button type="button" onClick={toggleChat} className="border-none bg-transparent text-[1.2rem] text-white">
            <FaXmark />
          </button>
        </div>

        <div ref={chatBodyRef} className="flex flex-1 flex-col gap-3 overflow-y-auto bg-slate-50 p-4">
          {chatMessages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={`max-w-[85%] rounded-lg px-3.5 py-2.5 text-[0.9rem] leading-[1.4] ${
                message.role === "assistant"
                  ? "self-start border border-slate-300 bg-white text-[#0F1111]"
                  : message.role === "error"
                  ? "self-center border border-red-200 bg-red-100 text-[0.8rem] text-red-600"
                  : "self-end bg-pink-600 text-white"
              }`}
            >
              {message.content}
            </div>
          ))}

          {sendingChat ? (
            <div className="self-start rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-[0.9rem] italic text-slate-500">
              Thinking...
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-2 border-t border-slate-300 bg-white p-3">
          <div className="flex w-full gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") sendMsg() }}
              placeholder="Type a message..."
              className="flex-1 rounded border border-slate-400 px-3 py-2.5 text-[0.9rem] outline-none focus:border-pink-600 focus:shadow-[0_0_0_2px_rgba(219,39,119,0.1)]"
            />
            <button
              type="button"
              onClick={sendMsg}
              className="flex h-10 w-10 items-center justify-center rounded bg-pink-600 text-white"
            >
              <FaPaperPlane />
            </button>
          </div>
          <div className="text-[0.75rem] text-slate-600">
            AI can make mistakes. Please verify important details directly with the merchant.
          </div>
        </div>
      </div>

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
                className="flex-1 rounded-md bg-[#25D366] px-4 py-3 font-bold text-white transition hover:bg-green-600"
              >
                Continue to Chat
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

export default ProductDetail
