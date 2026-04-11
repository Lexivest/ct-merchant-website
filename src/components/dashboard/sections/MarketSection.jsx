import { memo, useEffect, useMemo, useState } from "react"
import { FaChevronRight, FaCircleCheck, FaImage, FaLocationDot, FaStore } from "react-icons/fa6"
// IMPORT OUR NEW SHIMMERS
import { ShimmerBlock } from "../../common/Shimmers"
import StableImage from "../../common/StableImage"
import RetryingNotice, { getRetryingMessage } from "../../common/RetryingNotice"

const EMPTY_PRODUCTS = []
let shopDetailPrefetchPromise = null

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
    <section className="relative mb-2 overflow-hidden bg-[#101827]">
      <div className="px-4 pb-2 pt-4 text-white">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-pink-500/20 text-pink-200">
            <FaStore />
          </div>
          <div>
            <h2 className="text-[1.15rem] font-black leading-tight">Featured Shops Near You</h2>
            <p className="text-xs font-semibold text-white/60">Selected marketplace highlights in your city</p>
          </div>
        </div>
      </div>

      <div className="promo-banner-slider relative aspect-[16/9] w-full max-h-[420px] overflow-hidden bg-[#101827] sm:aspect-[8/3]">
        {banners.map((banner, idx) => {
          const shop = banner.shops || {}
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
              <picture>
                {banner.mobile_image_url ? (
                  <source media="(max-width: 640px)" srcSet={banner.mobile_image_url} />
                ) : null}
                <img
                  src={imageUrl}
                  alt={banner.title || shop.name || "Featured shop"}
                  className="h-full w-full bg-[#101827] object-cover object-center"
                  loading={idx === currentSlide ? "eager" : "lazy"}
                  fetchPriority={idx === currentSlide ? "high" : "auto"}
                />
              </picture>

              <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent px-4 pb-4 pt-16 text-white">
                <div className="max-w-[680px]">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    {shop.is_verified ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/95 px-2.5 py-1 text-[0.68rem] font-black uppercase tracking-wide">
                        <FaCircleCheck /> Verified
                      </span>
                    ) : null}
                    {shop.category ? (
                      <span className="rounded-full bg-white/90 px-2.5 py-1 text-[0.68rem] font-black uppercase tracking-wide text-[#101827]">
                        {shop.category}
                      </span>
                    ) : null}
                  </div>

                  <div className="text-xl font-black leading-tight sm:text-3xl">
                    {banner.title || shop.name}
                  </div>
                  {banner.subtitle || shop.address ? (
                    <div className="mt-1 flex items-center gap-1.5 text-xs font-bold text-white/80 sm:text-sm">
                      <FaLocationDot className="shrink-0 text-pink-200" />
                      <span className="line-clamp-1">{banner.subtitle || shop.address}</span>
                    </div>
                  ) : null}
                  <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-pink-600 px-4 py-2 text-xs font-black text-white shadow-[0_10px_24px_rgba(219,39,119,0.3)]">
                    Visit Shop <FaChevronRight className="text-[0.72rem]" />
                  </div>
                </div>
              </div>
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
        <div className="shop-cta">
          Visit shop <FaChevronRight className="ml-1 text-[0.75rem]" />
        </div>
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
              <>Explore stores in {area.name}</>
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

      {(dashboardData.categories || []).length > 0 ? (
        <div className="cat-section-wrap mb-2 bg-white pt-4">
          <h2 className="sec-title mb-3 flex items-center gap-[10px] overflow-x-auto whitespace-nowrap px-4 text-[1.35rem] font-extrabold text-[#0F1111]">
            Browse Categories
          </h2>

          <div className="cat-grid flex flex-wrap gap-3 px-4 pb-6">
            {(dashboardData.categories || []).map((category) => {
              const imageUrl =
                categoryPreviewImageByName.get(category.name) ||
                `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
                  category.name
                )}`

              return (
                <div
                  key={category.id || category.name}
                  className="cat-chip flex cursor-pointer items-center gap-[10px] rounded-[50px] border border-[#D5D9D9] bg-white px-4 py-[6px] pl-[6px] transition hover:-translate-y-[2px] hover:border-pink-600 hover:bg-[#F7F7F7]"
                  onClick={() => navigateCategory(category.name)}
                >
                  <StableImage
                    src={imageUrl}
                    alt={category.name}
                    containerClassName="h-8 w-8 rounded-full border border-[#E5E7EB] bg-white"
                    className="h-8 w-8 rounded-full object-contain bg-white"
                  />
                  <span className="text-[0.85rem] font-bold text-[#0F1111]">
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
