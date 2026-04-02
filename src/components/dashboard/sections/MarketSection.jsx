import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { FaChevronRight, FaImage } from "react-icons/fa6"
// IMPORT OUR NEW SHIMMERS
import { ShimmerBlock, ShimmerCard } from "../../common/Shimmers"
import StableImage from "../../common/StableImage"
import RetryingNotice, { getRetryingMessage } from "../../common/RetryingNotice"

function PromoSlider({ promos }) {
  const [currentSlide, setCurrentSlide] = useState(0)

  useEffect(() => {
    if (!promos?.length || promos.length <= 1) return

    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % promos.length)
    }, 8000)

    return () => clearInterval(interval)
  }, [promos])

  if (!promos?.length) return null

  return (
    <div className="promo-banner-slider relative mb-4 aspect-video w-full max-h-[400px] overflow-hidden bg-white">
      {promos.map((promo, idx) => (
        <div
          key={promo.id || idx}
          className={`promo-slide absolute left-0 top-0 h-full w-full transition-opacity duration-1000 ease-in-out ${
            idx === currentSlide ? "z-[2] opacity-100" : "z-[1] opacity-0"
          }`}
        >
          <StableImage
            src={promo.image_url}
            alt="Promo Banner"
            containerClassName="h-full w-full bg-white"
            className="block h-full w-full object-cover object-center bg-white"
          />
        </div>
      ))}
    </div>
  )
}

function ShopCard({ shop, products, onOpenShop }) {
  const shopProducts = (products || [])
    .filter(
      (item) =>
        item.shop_id === shop.id &&
        item.image_url &&
        item.condition !== "Fairly Used"
    )
    .slice(0, 4)

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
      <div className="premium-shop-card" onClick={() => onOpenShop(shop.id)}>
        <div className="shop-card-title">{shop.name}</div>
        <div className="shop-image-grid">{cells}</div>
        <div className="shop-cta">
          Visit shop <FaChevronRight className="ml-1 text-[0.75rem]" />
        </div>
      </div>
    </div>
  )
}

function MarketSection({
  dashboardData,
  featuredShops = [],
  groupedShopsByArea = [],
  navigateCategory,
  loading, // NEW PROP
  error    // NEW PROP
}) {
  const navigate = useNavigate()

  const dashboardShellEmpty =
    !dashboardData ||
    (!dashboardData.profile &&
      (dashboardData.promos || []).length === 0 &&
      (dashboardData.categories || []).length === 0 &&
      (dashboardData.areas || []).length === 0 &&
      (dashboardData.shops || []).length === 0 &&
      (dashboardData.products || []).length === 0)

  function openShop(shopId) {
    navigate(`/shop-detail?id=${shopId}`)
  }

  // 1. PROFESSIONAL ERROR STATE (Only shows if no cache is available)
  if (error && dashboardShellEmpty) {
    return <RetryingNotice fullScreen={false} message={getRetryingMessage(error)} />
  }

  // 2. PROFESSIONAL SHIMMER STATE (Mirrors the actual layout)
  if (loading || (!dashboardData && !error)) {
    return (
      <div className="screen active w-full pb-8 bg-slate-50">
        {/* Promo Skeleton */}
        <ShimmerBlock className="mb-4 aspect-video w-full max-h-[400px] rounded-none" />
        
        {/* Featured Shops Skeleton */}
        <div className="area-block-wrap mb-2 bg-white pt-4">
          <div className="mb-3 px-4">
            <ShimmerBlock className="h-8 w-[200px] rounded-md" />
          </div>
          <div className="flex gap-4 overflow-hidden px-4 pb-5 pt-1">
            <div className="min-w-[280px] w-[85vw] max-w-[340px] shrink-0">
              <ShimmerCard />
            </div>
            <div className="min-w-[280px] w-[85vw] max-w-[340px] shrink-0">
              <ShimmerCard />
            </div>
          </div>
        </div>
      </div>
    )
  }

  // 3. ACTUAL RENDER
  return (
    <div className="screen active">
      {dashboardData.promos?.length > 0 ? (
        <PromoSlider promos={dashboardData.promos} />
      ) : null}

      {featuredShops.length > 0 ? (
        <div className="area-block-wrap mb-2 bg-white pt-4">
          <h2 className="sec-title mb-3 flex items-center gap-[10px] overflow-x-auto whitespace-nowrap px-4 text-[1.35rem] font-extrabold text-[#0F1111]">
            Featured Shops{" "}
            <span className="text-[0.85em] font-bold text-pink-600">
              (Top Rated)
            </span>
          </h2>

          <div className="h-scroll flex gap-4 overflow-x-auto px-4 pb-5 pt-1">
            {featuredShops.map((shop) => (
              <ShopCard
                key={shop.id}
                shop={shop}
                products={dashboardData.products}
                onOpenShop={openShop}
              />
            ))}
          </div>
        </div>
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
                products={dashboardData.products}
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
              const matchingShopIds = (dashboardData.shops || [])
                .filter((shop) => shop.category === category.name)
                .map((shop) => shop.id)

              const previewProduct = (dashboardData.products || []).find(
                (product) =>
                  matchingShopIds.includes(product.shop_id) &&
                  product.image_url
              )

              const imageUrl =
                previewProduct?.image_url ||
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
