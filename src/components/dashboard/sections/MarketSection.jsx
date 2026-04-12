import { memo, useEffect, useMemo, useState } from "react"
import { FaImage } from "react-icons/fa6"
// IMPORT OUR NEW SHIMMERS
import { ShimmerBlock } from "../../common/Shimmers"
import StableImage from "../../common/StableImage"
import RetryingNotice, { getRetryingMessage } from "../../common/RetryingNotice"

const EMPTY_PRODUCTS = []
let shopDetailPrefetchPromise = null

function getCategoryImageUrl(category) {
  return (
    category?.image_url ||
    category?.icon_url ||
    category?.photo_url ||
    category?.thumbnail_url ||
    category?.cover_image_url ||
    ""
  )
}

function prefetchShopDetailPage() {
  if (!shopDetailPrefetchPromise) {
    shopDetailPrefetchPromise = import("../../../pages/ShopDetail")
  }

  return shopDetailPrefetchPromise
}

function FeaturedCitySlider({ banners, onOpenShop }) {
  const [currentSlide, setCurrentSlide] = useState(0)

  useEffect(() => {
    if (!banners?.length || banners.length <= 1) return

    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % banners.length)
    }, 8000)

    return () => clearInterval(interval)
  }, [banners])

  if (!banners?.length) return null

  return (
    <section className="relative mb-2 overflow-hidden bg-white p-[6px]">
      <div className="promo-banner-slider relative aspect-[8/3] w-full max-h-[420px] overflow-hidden bg-white">
        {banners.map((banner, idx) => {
          const imageUrl = banner.desktop_image_url || banner.mobile_image_url

          return (
            <button
              type="button"
              key={banner.id || idx}
              onClick={() => onOpenShop?.(banner.shop_id)}
              onMouseEnter={prefetchShopDetailPage}
              onFocus={prefetchShopDetailPage}
              onPointerDown={prefetchShopDetailPage}
              className={`promo-slide absolute left-0 top-0 h-full w-full text-left transition-opacity duration-1000 ease-in-out ${
                idx === currentSlide ? "z-[2] opacity-100" : "z-[1] opacity-0"
              }`}
            >
              <img
                src={imageUrl}
                alt={banner.title || banner.shops?.name || "Featured shop"}
                className="absolute inset-0 block h-full w-full bg-white object-contain object-center"
                loading={idx === currentSlide ? "eager" : "lazy"}
                fetchPriority={idx === currentSlide ? "high" : "auto"}
              />

            </button>
          )
        })}
      </div>

      {banners.length > 1 ? (
        <div className="absolute bottom-3 right-4 z-[3] flex gap-1.5">
          {banners.map((banner, idx) => (
            <button
              key={banner.id || idx}
              type="button"
              aria-label={`Show featured shop ${idx + 1}`}
              onClick={() => setCurrentSlide(idx)}
              className={`h-1.5 rounded-full transition-all ${
                idx === currentSlide ? "w-7 bg-white" : "w-2 bg-white/45"
              }`}
            />
          ))}
        </div>
      ) : null}
    </section>
  )
}

const ShopCard = memo(function ShopCard({ shop, products, onOpenShop }) {
  const shopProducts = products || EMPTY_PRODUCTS

  const cells = Array.from({ length: 4 }).map((_, index) => {
    const item = shopProducts[index]

    if (!item) {
      return (
        <div key={`empty-${index}`} className="shop-grid-item-wrap">
          <div className="shop-grid-item empty">
            <FaImage className="text-[1.2rem] text-slate-300" />
          </div>
          <div className="shop-grid-caption select-none text-transparent">
            <div className="sg-name">-</div>
            <div className="sg-price">-</div>
          </div>
        </div>
      )
    }

    const name = item.name || item.product_name || item.title || "Product"
    const price = item.price || item.product_price
    const discount = item.discount_price
    const discounted = discount && price && discount < price
    const discountPct =
      discounted && price ? Math.round(((price - discount) / price) * 100) : 0

    return (
        <div key={`${shop.id}-${item.id}-${index}`} className="shop-grid-item-wrap">
        <div className="shop-grid-item">
          <StableImage
            src={item.image_url}
            alt={name}
            containerClassName="h-full w-full bg-[#F8FAFC]"
            className="h-full w-full object-contain p-2"
          />
          {discounted ? (
            <div className="grid-badge flash-offer">-{discountPct}%</div>
          ) : null}
        </div>

        <div className="shop-grid-caption">
          <div className="sg-name" title={name}>
            {name}
          </div>

          <div className={discounted ? "sg-price flash-price" : "sg-price"}>
            {discounted ? (
              <>
                <span className="sg-price-old">
                  ₦{Number(price).toLocaleString()}
                </span>
                ₦{Number(discount).toLocaleString()}
              </>
            ) : price ? (
              <>₦{Number(price).toLocaleString()}</>
            ) : (
              ""
            )}
          </div>
        </div>
      </div>
    )
  })

  return (
    <div className="premium-shop-card-wrap min-w-[280px] w-[85vw] max-w-[340px] shrink-0">
      <div
        className="premium-shop-card"
        onClick={() => onOpenShop(shop.id)}
        onMouseEnter={prefetchShopDetailPage}
        onFocus={prefetchShopDetailPage}
        onPointerDown={prefetchShopDetailPage}
      >
        <div className="shop-card-title">{shop.name}</div>
        <div className="shop-image-grid">{cells}</div>
      </div>
    </div>
  )
})

function MarketSection({
  dashboardData,
  groupedShopsByArea = [],
  navigateCategory,
  onOpenShop,
  loading, // NEW PROP
  error    // NEW PROP
}) {
  const dashboardShellEmpty =
    !dashboardData ||
    (!dashboardData.profile &&
      (dashboardData.featuredCityBanners || []).length === 0 &&
      (dashboardData.categories || []).length === 0 &&
      (dashboardData.areas || []).length === 0 &&
      (dashboardData.shops || []).length === 0 &&
      (dashboardData.products || []).length === 0)

  function openShop(shopId) {
    if (typeof onOpenShop === "function") {
      onOpenShop(shopId)
    }
  }

  const productsByShopId = useMemo(() => {
    const grouped = new Map()

    ;(dashboardData?.products || []).forEach((product) => {
      if (!product?.shop_id || !product.image_url || product.condition === "Fairly Used") {
        return
      }

      const existing = grouped.get(product.shop_id)
      if (existing && existing.length >= 4) return

      if (existing) {
        existing.push(product)
      } else {
        grouped.set(product.shop_id, [product])
      }
    })

    return grouped
  }, [dashboardData?.products])

  const categoryPreviewImageByName = useMemo(() => {
    const shopCategoryById = new Map(
      (dashboardData?.shops || []).map((shop) => [shop.id, shop.category])
    )
    const previews = new Map()

    ;(dashboardData?.products || []).forEach((product) => {
      const categoryName = shopCategoryById.get(product.shop_id)
      if (!categoryName || !product?.image_url || previews.has(categoryName)) return
      previews.set(categoryName, product.image_url)
    })

    return previews
  }, [dashboardData?.products, dashboardData?.shops])

  const sortedCategories = useMemo(() => {
    return [...(dashboardData?.categories || [])].sort((a, b) => {
      const aHasCategoryImage = Boolean(getCategoryImageUrl(a))
      const bHasCategoryImage = Boolean(getCategoryImageUrl(b))

      if (aHasCategoryImage !== bHasCategoryImage) {
        return aHasCategoryImage ? -1 : 1
      }

      return String(a?.name || "").localeCompare(String(b?.name || ""))
    })
  }, [dashboardData?.categories])

  // 1. PROFESSIONAL ERROR STATE (Only shows if no cache is available)
  if (error && dashboardShellEmpty) {
    return <RetryingNotice fullScreen={false} message={getRetryingMessage(error)} />
  }

  // 2. PROFESSIONAL SHIMMER STATE (Mirrors the actual layout)
  if (loading || (!dashboardData && !error)) {
    return (
      <div className="screen active w-full pb-8 bg-slate-50">
        {/* Featured City Banner Skeleton */}
        <ShimmerBlock className="mb-4 aspect-video w-full max-h-[400px] rounded-none" />
      </div>
    )
  }

  // 3. ACTUAL RENDER
  return (
    <div className="screen active">
      {dashboardData.featuredCityBanners?.length > 0 ? (
        <FeaturedCitySlider
          banners={dashboardData.featuredCityBanners}
          onOpenShop={openShop}
        />
      ) : null}

      {groupedShopsByArea.map(({ area, shops }) => (
        <div key={area.id} className="area-block-wrap mb-2 bg-white pt-4">
          <h2 className="sec-title mb-3 flex items-center gap-[10px] overflow-x-auto whitespace-nowrap px-4 text-[1.35rem] font-extrabold text-[#0F1111]">
            {area.id === dashboardData.profile?.area_id ? (
              <>
                Top stores in {area.name}{" "}
                <span className="text-[0.85em] font-bold text-pink-600">
                  (Near You)
                </span>
              </>
            ) : (
              <>{area.name}</>
            )}
          </h2>

          <div className="h-scroll flex gap-4 overflow-x-auto px-4 pb-5 pt-1">
            {shops.map((shop) => (
              <ShopCard
                key={shop.id}
                shop={shop}
                products={productsByShopId.get(shop.id)}
                onOpenShop={openShop}
              />
            ))}
          </div>
        </div>
      ))}

      {sortedCategories.length > 0 ? (
        <div className="cat-section-wrap mb-2 bg-white pt-4">
          <h2 className="sec-title mb-3 flex items-center gap-[10px] overflow-x-auto whitespace-nowrap px-4 text-[1.35rem] font-extrabold text-[#0F1111]">
            Browse Categories
          </h2>

          <div className="cat-grid px-4 pb-6">
            {sortedCategories.map((category) => {
              const categoryImageUrl = getCategoryImageUrl(category)
              const imageUrl =
                categoryImageUrl ||
                categoryPreviewImageByName.get(category.name) ||
                `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
                  category.name
                )}`

              return (
                <div
                  key={category.id || category.name}
                  className="cat-card"
                  onClick={() => navigateCategory(category.name)}
                >
                  <StableImage
                    src={imageUrl}
                    alt={category.name}
                    containerClassName="cat-card-image"
                    className="h-full w-full object-contain bg-white"
                  />
                  <span className="cat-card-title">
                    {category.name}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default MarketSection
