import { memo, useEffect, useMemo, useState } from "react"
import {
  FaArrowRight,
  FaBolt,
  FaBriefcase,
  FaChevronRight,
  FaImage,
  FaMagnifyingGlass,
  FaScrewdriverWrench,
  FaXmark,
} from "react-icons/fa6"
// IMPORT OUR NEW SHIMMERS
import { ShimmerBlock } from "../../common/Shimmers"
import StableImage from "../../common/StableImage"
import RetryingNotice, { getRetryingMessage } from "../../common/RetryingNotice"
import { PROMO_EXTENDED_COLORS } from "../../../lib/promoBannerEngine"
import {
  SERVICE_CATEGORY_GROUPS,
  getServiceProviderImage,
  isServiceCategory,
} from "../../../lib/serviceCategories"

function SponsoredProductCard({ sponsored, onOpenProduct }) {
  const product = useMemo(() => {
    if (sponsored?.product) return sponsored.product
    if (!sponsored) return null

    return {
      id: sponsored.product_id || sponsored.template_key || sponsored.id,
      name: sponsored.product_name || sponsored.name || "Sponsored Product",
      price: sponsored.price ?? sponsored.product_price ?? 0,
      image_url: sponsored.image_url || "",
      image_url_2: sponsored.image_url_2 || null,
      image_url_3: sponsored.image_url_3 || null,
      shops: sponsored.shop_name
        ? { name: sponsored.shop_name }
        : sponsored.shops || null,
    }
  }, [sponsored])

  // Image rotation logic
  const [imgIndex, setImgIndex] = useState(0)
  const images = useMemo(() => {
    if (!product) return []
    return [product.image_url, product.image_url_2, product.image_url_3].filter(Boolean)
  }, [product])

  useEffect(() => {
    if (images.length <= 1) return
    const interval = setInterval(() => {
      setImgIndex((prev) => (prev + 1) % images.length)
    }, 3000)
    return () => clearInterval(interval)
  }, [images.length])

  const handleClick = () => {
    if (typeof onOpenProduct === "function") {
      onOpenProduct(product.id)
    }
  }

  if (!product) return null

  const activeImageIndex = images.length ? imgIndex % images.length : 0

  return (
    <div 
      onClick={handleClick}
      className="group relative overflow-hidden rounded-[28px] cursor-pointer transition-all duration-500 hover:shadow-2xl active:scale-[0.98] bg-white border border-slate-100 flex flex-col p-4 w-[180px] md:w-[210px] shrink-0 shadow-md"
    >
      <div className="absolute top-3 left-3 z-10">
        <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-pink-600 text-white text-[9px] font-black uppercase tracking-tighter shadow-xl">
          <FaBolt className="text-[8px] animate-pulse" /> Sponsored
        </span>
      </div>
      
      <div className="relative aspect-square w-full rounded-[20px] overflow-hidden bg-slate-50 mb-4">
        {images.map((img, idx) => (
          <div 
            key={`${img}-${idx}`}
            className={`absolute inset-0 transition-all duration-1000 ease-in-out ${idx === activeImageIndex ? 'opacity-100 scale-100' : 'opacity-0 scale-110 pointer-events-none'}`}
          >
            <StableImage 
              src={img} 
              alt={product.name} 
              width={400}
              height={400}
              aspectRatio={1}
              className="h-full w-full object-cover" 
            />
          </div>
        ))}
        
        {/* Pagination Dots for images */}
        {images.length > 1 && (
          <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1 z-10">
            {images.map((_, idx) => (
              <div key={idx} className={`h-1 rounded-full transition-all duration-500 ${idx === activeImageIndex ? 'w-4 bg-white shadow-sm' : 'w-1 bg-white/40'}`} />
            ))}
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <div className="text-xs md:text-sm font-black text-slate-900 truncate leading-tight">{product.name}</div>
        <div className="text-xs font-black text-pink-600">₦{Number(product.price).toLocaleString()}</div>
        <div className="pt-2 border-t border-slate-50 flex items-center justify-between mt-1">
           <span className="text-[9px] md:text-[10px] font-black text-blue-800 uppercase tracking-tight truncate max-w-[70%]">{product.shops?.name}</span>
           <FaArrowRight className="text-[9px] text-slate-300 group-hover:text-pink-500 transition-colors" />
        </div>
      </div>
    </div>
  )
}


const EMPTY_PRODUCTS = []
let shopDetailPrefetchPromise = null
let serviceCategoryPrefetchPromise = null
let serviceProviderPrefetchPromise = null

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

function prefetchServiceCategoryPage() {
  if (!serviceCategoryPrefetchPromise) {
    serviceCategoryPrefetchPromise = import("../../../pages/ServiceCategory")
  }

  return serviceCategoryPrefetchPromise
}

function prefetchServiceProviderPage() {
  if (!serviceProviderPrefetchPromise) {
    serviceProviderPrefetchPromise = import("../../../pages/ServiceProvider")
  }

  return serviceProviderPrefetchPromise
}

function formatServicePrice(value) {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount) || amount <= 0) return "Request quote"
  return `From N${amount.toLocaleString()}`
}

function ServiceCategoryPicker({ open, onClose, onOpenServiceCategory }) {
  const [query, setQuery] = useState("")
  const normalizedQuery = query.trim().toLowerCase()

  const visibleGroups = useMemo(() => {
    if (!normalizedQuery) return SERVICE_CATEGORY_GROUPS

    return SERVICE_CATEGORY_GROUPS.map((group) => ({
      ...group,
      categories: group.categories.filter((category) =>
        category.toLowerCase().includes(normalizedQuery) ||
        group.title.toLowerCase().includes(normalizedQuery),
      ),
    })).filter((group) => group.categories.length > 0)
  }, [normalizedQuery])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[950] flex items-end justify-start bg-slate-950/30 px-3 pb-4 pt-20 backdrop-blur-[2px]">
      <div className="w-full max-w-[520px] overflow-hidden rounded-[30px] border border-white/70 bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-[linear-gradient(135deg,#fff7fb_0%,#eef8ff_100%)] px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[0.7rem] font-black uppercase tracking-[0.16em] text-pink-700">
              <FaScrewdriverWrench /> Local Services
            </div>
            <h3 className="mt-0.5 truncate text-xl font-black text-slate-950">
              What service do you need?
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-slate-700 shadow-sm transition hover:bg-slate-100"
            aria-label="Close services"
          >
            <FaXmark />
          </button>
        </div>

        <div className="border-b border-slate-100 px-4 py-3">
          <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-500">
            <FaMagnifyingGlass className="text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search plumbing, AC, catering..."
              className="min-w-0 flex-1 bg-transparent text-slate-900 outline-none placeholder:text-slate-400"
            />
          </label>
        </div>

        <div className="max-h-[62vh] overflow-y-auto px-4 py-3">
          {visibleGroups.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
              <p className="text-sm font-bold text-slate-500">
                No service matched that search.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {visibleGroups.map((group) => (
                <section key={group.key}>
                  <div className="mb-2">
                    <h4 className="text-sm font-black text-slate-950">{group.title}</h4>
                    <p className="text-[0.72rem] font-semibold leading-5 text-slate-500">
                      {group.description}
                    </p>
                  </div>
                  <div className="grid gap-2">
                    {group.categories.map((category) => (
                      <button
                        type="button"
                        key={category}
                        onClick={() => {
                          onClose()
                          onOpenServiceCategory?.(category)
                        }}
                        onMouseEnter={prefetchServiceCategoryPage}
                        onFocus={prefetchServiceCategoryPage}
                        onPointerDown={prefetchServiceCategoryPage}
                        className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white px-3 py-3 text-left text-sm font-black text-slate-800 shadow-sm transition hover:border-pink-200 hover:bg-pink-50 active:scale-[0.99]"
                      >
                        <span className="min-w-0 flex-1 truncate">{category}</span>
                        <FaChevronRight className="shrink-0 text-xs text-pink-600" />
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
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
    <section className="relative overflow-hidden bg-white p-[6px]">
      <div className="sponsored-product-slider relative aspect-[8/3] w-full max-h-[420px] overflow-hidden bg-white">
        {banners.map((banner, idx) => {
          const imageUrl = banner.desktop_image_url || banner.mobile_image_url || ""

          return (
            <button
              type="button"
              key={banner.id || idx}
              onClick={() => {
                if (banner.shop_id) {
                  onOpenShop?.(banner.shop_id)
                }
              }}
              onMouseEnter={prefetchShopDetailPage}
              onFocus={prefetchShopDetailPage}
              onPointerDown={prefetchShopDetailPage}
              className={`sponsored-product-slide absolute left-0 top-0 h-full w-full text-left transition-opacity duration-1000 ease-in-out ${
                idx === currentSlide ? "z-[2] opacity-100" : "z-[1] opacity-0"
              }`}
            >
              <StableImage
                src={imageUrl}
                alt={banner.title || (banner.shops && banner.shops.name) || "Featured shop"}
                containerClassName="absolute inset-0 h-full w-full bg-white"
                className="h-full w-full object-contain object-center"
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
            width={300}
            height={300}
            aspectRatio={1}
            containerClassName="h-full w-full bg-[#F8FAFC]"
            className="h-full w-full object-cover"
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

const ServiceMarketCard = memo(function ServiceMarketCard({ provider, onOpenServiceProvider }) {
  const shop = provider?.shop || {}
  const serviceProducts = provider?.products || EMPTY_PRODUCTS
  const heroImage = getServiceProviderImage(shop, serviceProducts)
  const pricedProducts = serviceProducts
    .map((product) => Number(product?.price))
    .filter((price) => Number.isFinite(price) && price > 0)
    .sort((a, b) => a - b)
  const minPrice = pricedProducts[0]
  const cells = Array.from({ length: 4 }).map((_, index) => {
    const item = serviceProducts[index]

    if (!item && index === 0 && heroImage) {
      return (
        <div key={`${shop.id}-service-hero`} className="shop-grid-item-wrap">
          <div className="shop-grid-item">
            <StableImage
              src={heroImage}
              alt={shop.name || "Service provider"}
              width={300}
              height={300}
              aspectRatio={1}
              containerClassName="h-full w-full bg-[#F8FAFC]"
              className="h-full w-full object-cover"
            />
            <div className="grid-badge bg-pink-600 text-white">Service</div>
          </div>
          <div className="shop-grid-caption">
            <div className="sg-name">{shop.category || "Local Service"}</div>
            <div className="sg-price">{formatServicePrice(minPrice)}</div>
          </div>
        </div>
      )
    }

    if (!item) {
      return (
        <div key={`${shop.id}-service-empty-${index}`} className="shop-grid-item-wrap">
          <div className="shop-grid-item empty">
            <FaBriefcase className="text-[1.2rem] text-pink-200" />
          </div>
          <div className="shop-grid-caption select-none text-transparent">
            <div className="sg-name">-</div>
            <div className="sg-price">-</div>
          </div>
        </div>
      )
    }

    return (
      <div key={`${shop.id}-${item.id}-${index}`} className="shop-grid-item-wrap">
        <div className="shop-grid-item">
          <StableImage
            src={item.image_url || heroImage}
            alt={item.name || shop.name || "Service"}
            width={300}
            height={300}
            aspectRatio={1}
            containerClassName="h-full w-full bg-[#F8FAFC]"
            className="h-full w-full object-cover"
          />
          {index === 0 ? <div className="grid-badge bg-pink-600 text-white">Service</div> : null}
        </div>

        <div className="shop-grid-caption">
          <div className="sg-name" title={item.name || shop.category || "Service"}>
            {item.name || shop.category || "Service"}
          </div>
          <div className="sg-price">{formatServicePrice(item.price)}</div>
        </div>
      </div>
    )
  })

  return (
    <div className="premium-shop-card-wrap min-w-[280px] w-[85vw] max-w-[340px] shrink-0">
      <div
        className="premium-shop-card"
        onClick={() => onOpenServiceProvider?.(shop.id, shop.category || "")}
        onMouseEnter={prefetchServiceProviderPage}
        onFocus={prefetchServiceProviderPage}
        onPointerDown={prefetchServiceProviderPage}
      >
        <div className="shop-card-title">
          <span className="mr-2 rounded-full bg-pink-100 px-2 py-0.5 text-[0.62rem] font-black uppercase tracking-wide text-pink-700">
            Service
          </span>
          {shop.name}
        </div>
        <div className="shop-image-grid">{cells}</div>
      </div>
    </div>
  )
})

function DiscoveryCard({ item, onOpenDiscovery }) {
  const handleClick = () => {
    if (typeof onOpenDiscovery === "function") {
      onOpenDiscovery(item.id)
    }
  }

  return (
    <div 
      onClick={handleClick}
      className="group relative flex w-[160px] md:w-[190px] shrink-0 cursor-pointer flex-col overflow-hidden rounded-[24px] bg-white border border-slate-100 shadow-sm transition-all hover:shadow-xl active:scale-[0.98]"
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden">
        <StableImage 
          src={item.image_url} 
          alt={item.title} 
          width={380}
          height={570}
          aspectRatio={2/3}
          className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110" 
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      </div>
      <div className="p-3">
        <div className="truncate text-[0.85rem] font-black text-slate-900 leading-tight">{item.title}</div>
        {item.price && (
          <div className="mt-1 text-[0.85rem] font-bold text-pink-600">₦{Number(item.price).toLocaleString()}</div>
        )}
      </div>
    </div>
  )
}

function FairlyUsedProductCard({ product, onOpenProduct }) {
  const handleClick = () => {
    if (typeof onOpenProduct === "function") {
      onOpenProduct(product.id)
    }
  }

  return (
    <div 
      onClick={handleClick}
      className="group relative flex w-[150px] md:w-[170px] shrink-0 cursor-pointer flex-col overflow-hidden rounded-[24px] bg-white border border-slate-100 shadow-sm transition-all hover:shadow-lg active:scale-[0.98]"
    >
      <div className="relative aspect-square w-full overflow-hidden bg-slate-50">
        <StableImage 
          src={product.image_url} 
          alt={product.name} 
          width={300}
          height={300}
          aspectRatio={1}
          className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110" 
        />
        <div className="absolute left-1.5 top-1.5 rounded-md bg-slate-900/80 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-tighter text-white backdrop-blur-sm">
          Fairly Used
        </div>
      </div>
      <div className="p-3">
        <div className="truncate text-[0.8rem] font-bold text-slate-800 leading-tight">{product.name}</div>
        <div className="mt-1 flex items-baseline gap-1">
          <span className="text-[0.9rem] font-black text-slate-900">₦{Number(product.price).toLocaleString()}</span>
        </div>
        {product.shops?.name && (
          <div className="mt-1 truncate text-[0.65rem] font-bold text-slate-400">
             {product.shops.name}
          </div>
        )}
      </div>
    </div>
  )
}

function MarketSection({
  dashboardData,
  groupedShopsByArea = [],
  navigateCategory,
  onOpenShop,
  onOpenServiceProvider,
  onOpenProduct,
  onOpenArea,
  onOpenDiscovery,
  onOpenServiceCategory,
  loading,
  error,
  onRetry,
}) {
  const [servicePickerOpen, setServicePickerOpen] = useState(false)
  const dashboardShellEmpty =
    !dashboardData ||
    (!dashboardData.profile &&
      (dashboardData.featuredCityBanners || []).length === 0 &&
      (dashboardData.categories || []).length === 0 &&
      (dashboardData.areas || []).length === 0 &&
      (dashboardData.shops || []).length === 0 &&
      (dashboardData.products || []).length === 0)

  const sponsoredProducts = dashboardData?.sponsoredProducts || []
  const fairlyUsedProducts = dashboardData?.fairlyUsedProducts || []

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
    return [...(dashboardData?.categories || [])]
      .filter((category) => !isServiceCategory(category?.name))
      .sort((a, b) => {
      const aHasCategoryImage = Boolean(getCategoryImageUrl(a))
      const bHasCategoryImage = Boolean(getCategoryImageUrl(b))

      if (aHasCategoryImage !== bHasCategoryImage) {
        return aHasCategoryImage ? -1 : 1
      }

      return String(a?.name || "").localeCompare(String(b?.name || ""))
    })
  }, [dashboardData?.categories])

  const serviceLauncher = (
    <>
      <ServiceCategoryPicker
        open={servicePickerOpen}
        onClose={() => setServicePickerOpen(false)}
        onOpenServiceCategory={onOpenServiceCategory}
      />

      <button
        type="button"
        onClick={() => setServicePickerOpen(true)}
        onMouseEnter={prefetchServiceCategoryPage}
        onFocus={prefetchServiceCategoryPage}
        onPointerDown={prefetchServiceCategoryPage}
        className="fixed bottom-4 left-3 z-[880] flex items-center gap-1.5 rounded-full bg-slate-950 px-2.5 py-2 text-[0.78rem] font-black text-white shadow-[0_14px_34px_rgba(15,23,42,0.24)] transition hover:-translate-y-0.5 hover:bg-pink-700 active:scale-[0.98]"
        aria-label="Open local services"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-pink-600 text-[0.8rem] text-white">
          <FaBriefcase />
        </span>
        Services
      </button>
    </>
  )

  // 1. PROFESSIONAL ERROR STATE (Only shows if no cache is available)
  if (error && dashboardShellEmpty) {
    return (
      <>
        {serviceLauncher}
        <RetryingNotice
          fullScreen={false}
          message={getRetryingMessage(error)}
          onRetry={onRetry}
        />
      </>
    )
  }

  // 2. PROFESSIONAL SHIMMER STATE (Mirrors the actual layout)
  if (loading || (!dashboardData && !error)) {
    return (
      <div className="screen active w-full pb-8 bg-slate-50">
        {serviceLauncher}
        {/* Featured City Banner Skeleton */}
        <ShimmerBlock className="mb-4 aspect-video w-full max-h-[400px] rounded-none" />
      </div>
    )
  }

  // 3. ACTUAL RENDER
  return (
    <div className="screen active bg-slate-50">
      {serviceLauncher}

      {dashboardData.featuredCityBanners?.length > 0 ? (
        <FeaturedCitySlider
          banners={dashboardData.featuredCityBanners}
          onOpenShop={openShop}
        />
      ) : null}

      {sponsoredProducts.length > 0 && (
        <div className="sponsored-wrap bg-white pt-2 pb-4 border-b border-slate-50">
           <div className="flex gap-4 overflow-x-auto pl-4 pb-2 no-scrollbar">
             {sponsoredProducts.map((sponsored) => (
               <SponsoredProductCard 
                 key={sponsored.id} 
                 sponsored={sponsored} 
                 onOpenProduct={onOpenProduct}
               />
             ))}
             <div className="w-4 shrink-0" aria-hidden="true" />
           </div>
        </div>
      )}


      {groupedShopsByArea.map(({ area, shops, entries }, index) => {
        const areaEntries = entries || shops.map((shop) => ({ type: "shop", shop }))
        const hasOnlyServices =
          areaEntries.length > 0 && areaEntries.every((entry) => entry.type === "service")
        const areaTitle = hasOnlyServices
          ? `Services in ${area.name}`
          : area.id && area.id === dashboardData.profile?.area_id
            ? `Top stores in ${area.name}`
            : area.name

        return (
        <div key={area.id}>
          <div className="area-block-wrap bg-white">
            <div className="flex items-center justify-between px-4 pb-0 pt-2">
              <h2 className="sec-title flex items-center gap-[10px] overflow-x-auto whitespace-nowrap text-[1.25rem] font-extrabold text-[#0F1111] !p-0">
                {areaTitle}
              </h2>
              {area.id ? (
                <button
                  onClick={() => {
                    if (typeof onOpenArea === "function") {
                      onOpenArea(area.id)
                    }
                  }}
                  className="text-[0.85rem] font-bold text-[#007185] hover:text-pink-600 active:scale-95 transition-all shrink-0"
                >
                  See All
                </button>
              ) : null}
            </div>

            <div className="h-scroll flex gap-4 overflow-x-auto pl-4 pb-3 pt-1">
              {areaEntries.map((entry) => {
                if (entry.type === "service") {
                  const serviceShop = entry.provider?.shop

                  return (
                    <ServiceMarketCard
                      key={`service-${serviceShop?.id}`}
                      provider={entry.provider}
                      onOpenServiceProvider={onOpenServiceProvider}
                    />
                  )
                }

                const shop = entry.shop

                return (
                  <ShopCard
                    key={`shop-${shop.id}`}
                    shop={shop}
                    products={productsByShopId.get(shop.id)}
                    onOpenShop={openShop}
                  />
                )
              })}
              <div className="w-4 shrink-0" aria-hidden="true" />
            </div>
          </div>

          {index === 2 && dashboardData.staffDiscoveries?.length > 0 && (
            <div className="discoveries-section-wrap bg-white py-2 mb-1">
              <h2 className="sec-title px-4 pb-2 text-[1.25rem] font-extrabold text-[#0F1111]">
                Recommended for you
              </h2>
              <div className="flex gap-4 overflow-x-auto pl-4 pb-2 no-scrollbar">
                {dashboardData.staffDiscoveries.map((item) => (
                  <DiscoveryCard 
                    key={item.id} 
                    item={item} 
                    onOpenDiscovery={onOpenDiscovery}
                  />
                ))}
                <div className="w-4 shrink-0" aria-hidden="true" />
              </div>
            </div>
          )}
        </div>
        )
      })}

      {groupedShopsByArea.length < 3 && dashboardData.staffDiscoveries?.length > 0 && (
        <div className="discoveries-section-wrap bg-white py-2 mb-1">
          <h2 className="sec-title px-4 pb-2 text-[1.25rem] font-extrabold text-[#0F1111]">
            Recommended for you
          </h2>
          <div className="flex gap-4 overflow-x-auto pl-4 pb-2 no-scrollbar">
            {dashboardData.staffDiscoveries.map((item) => (
              <DiscoveryCard 
                key={item.id} 
                item={item} 
                onOpenDiscovery={onOpenDiscovery}
              />
            ))}
            <div className="w-4 shrink-0" aria-hidden="true" />
          </div>
        </div>
      )}

      {fairlyUsedProducts.length > 0 && (
        <div className="fairly-used-section-wrap bg-white py-2 mb-1">
          <h2 className="sec-title px-4 pb-2 text-[1.25rem] font-extrabold text-[#0F1111]">
            Fairly Used Items
          </h2>
          <div className="flex gap-4 overflow-x-auto pl-4 pb-2 no-scrollbar">
            {fairlyUsedProducts.map((product) => (
              <FairlyUsedProductCard 
                key={product.id} 
                product={product} 
                onOpenProduct={onOpenProduct}
              />
            ))}
            <div className="w-4 shrink-0" aria-hidden="true" />
          </div>
        </div>
      )}

      {sortedCategories.length > 0 ? (
        <div className="cat-section-wrap bg-white py-1">
          <h2 className="sec-title flex items-center gap-[10px] overflow-x-auto whitespace-nowrap px-4 pb-2 pt-1 text-[1.25rem] font-extrabold text-[#0F1111]">
            Browse Categories
          </h2>

          <div className="cat-grid px-4 pb-4">
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
                    width={160}
                    height={160}
                    aspectRatio={1}
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
