import { useEffect, useMemo, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import {
  FaArrowLeft,
  FaBoxOpen,
  FaChevronRight,
  FaCircleCheck,
  FaMagnifyingGlass,
} from "react-icons/fa6"
import { supabase } from "../lib/supabase"

function Search() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const initialQuery = searchParams.get("q") || ""

  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState(initialQuery)
  const [currentUser, setCurrentUser] = useState(null)
  const [allShops, setAllShops] = useState([])
  const [allProducts, setAllProducts] = useState([])
  const [shopContextProducts, setShopContextProducts] = useState([])

  useEffect(() => {
    async function bootstrap() {
      try {
        setLoading(true)

        const {
          data: { session },
        } = await supabase.auth.getSession()

        if (!session?.user) {
          navigate("/", { replace: true })
          return
        }

        setCurrentUser(session.user)

        const cacheKey = Object.keys(localStorage).find((key) =>
          key.startsWith("ctm_dashboard_")
        )

        if (cacheKey) {
          try {
            const cached = JSON.parse(localStorage.getItem(cacheKey) || "{}")
            const cachedShops = Array.isArray(cached.shops) ? cached.shops : []
            const cachedProducts = Array.isArray(cached.products)
              ? cached.products
              : []

            setAllShops(cachedShops)
            setAllProducts(cachedProducts)
            setShopContextProducts(cachedProducts)
            setLoading(false)
            return
          } catch {
            // fall through to database
          }
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("city_id")
          .eq("id", session.user.id)
          .single()

        if (!profile?.city_id) {
          setAllShops([])
          setAllProducts([])
          setShopContextProducts([])
          setLoading(false)
          return
        }

        const { data: shops } = await supabase
          .from("shops")
          .select("*")
          .eq("city_id", profile.city_id)
          .order("name", { ascending: true })

        const safeShops = Array.isArray(shops) ? shops : []
        setAllShops(safeShops)

        const shopIds = safeShops.map((shop) => shop.id)

        if (shopIds.length > 0) {
          const { data: products } = await supabase
            .from("products")
            .select("*")
            .in("shop_id", shopIds)
            .eq("is_available", true)

          const safeProducts = Array.isArray(products) ? products : []
          setAllProducts(safeProducts)
          setShopContextProducts(safeProducts)
        } else {
          setAllProducts([])
          setShopContextProducts([])
        }
      } finally {
        setLoading(false)
      }
    }

    bootstrap()
  }, [navigate])

  const normalizedQuery = useMemo(
    () => String(query || "").trim().toLowerCase(),
    [query]
  )

  const matchedShops = useMemo(() => {
    if (!normalizedQuery) return []

    return allShops.filter((shop) => {
      const name = String(shop?.name || "").toLowerCase()
      const category = String(shop?.category || "").toLowerCase()
      const description = String(shop?.description || "").toLowerCase()
      const uniqueId = String(shop?.unique_id || "").toLowerCase()
      const address = String(shop?.address || "").toLowerCase()

      return (
        name.includes(normalizedQuery) ||
        category.includes(normalizedQuery) ||
        description.includes(normalizedQuery) ||
        uniqueId.includes(normalizedQuery) ||
        address.includes(normalizedQuery)
      )
    })
  }, [allShops, normalizedQuery])

  const matchedProducts = useMemo(() => {
    if (!normalizedQuery) return []

    return allProducts.filter((product) => {
      const name = String(
        product?.name || product?.product_name || product?.title || ""
      ).toLowerCase()
      const description = String(product?.description || "").toLowerCase()
      const category = String(product?.category || "").toLowerCase()
      const condition = String(product?.condition || "").toLowerCase()
      const brand = String(product?.brand || "").toLowerCase()

      return (
        name.includes(normalizedQuery) ||
        description.includes(normalizedQuery) ||
        category.includes(normalizedQuery) ||
        condition.includes(normalizedQuery) ||
        brand.includes(normalizedQuery)
      )
    })
  }, [allProducts, normalizedQuery])

  function runSearch() {
    const trimmed = query.trim()
    if (!trimmed) return
    navigate(`/search?q=${encodeURIComponent(trimmed)}`)
  }

  function buildShopCard(shop) {
    const products = shopContextProducts
      .filter(
        (item) =>
          item.shop_id === shop.id &&
          item.image_url &&
          item.condition !== "Fairly Used"
      )
      .slice(0, 4)

    const cells = Array.from({ length: 4 }).map((_, index) => {
      const item = products[index]

      if (!item) {
        return (
          <div key={`empty-${shop.id}-${index}`} className="shop-grid-item-wrap">
            <div className="shop-grid-item empty">
              <FaBoxOpen className="text-[1.1rem] text-slate-300" />
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
      const hasDiscount = discount && price && Number(discount) < Number(price)

      const percent = hasDiscount
        ? Math.round(((Number(price) - Number(discount)) / Number(price)) * 100)
        : 0

      return (
        <div key={`${shop.id}-${item.id}-${index}`} className="shop-grid-item-wrap">
          <div className="shop-grid-item">
            <img src={item.image_url} alt={name} loading="lazy" />
            {hasDiscount ? (
              <div className="grid-badge flash-offer">-{percent}%</div>
            ) : null}
          </div>

          <div className="shop-grid-caption">
            <div className="sg-name" title={name}>
              {name}
            </div>
            <div className={hasDiscount ? "sg-price flash-price" : "sg-price"}>
              {hasDiscount ? (
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
      <div
        key={shop.id}
        className="premium-shop-card cursor-pointer rounded-lg border border-[#D5D9D9] bg-white p-6 transition hover:-translate-y-0.5 hover:border-slate-400 hover:shadow-[0_8px_16px_rgba(0,0,0,0.08)]"
        onClick={() => navigate(`/shop-detail?id=${shop.id}`)}
      >
        <div className="shop-card-title">
          {shop.name}
          {shop.is_verified ? (
            <FaCircleCheck
              className="ml-1 inline text-[0.9rem] text-[#007185]"
              title="Verified"
            />
          ) : null}
        </div>

        <div className="shop-image-grid">{cells}</div>

        <div className="shop-cta">
          Visit shop <FaChevronRight className="ml-1 text-[0.75rem]" />
        </div>
      </div>
    )
  }

  function buildProductCard(product) {
    const name = product.name || product.product_name || product.title || "Product"
    const price = product.price || product.product_price
    const discount = product.discount_price
    const hasDiscount = discount && price && Number(discount) < Number(price)

    const percent = hasDiscount
      ? Math.round(((Number(price) - Number(discount)) / Number(price)) * 100)
      : 0

    return (
      <div
        key={product.id}
        className="product-card cursor-pointer rounded-lg border border-[#D5D9D9] bg-white transition hover:-translate-y-0.5 hover:border-slate-400 hover:shadow-[0_8px_16px_rgba(0,0,0,0.08)]"
        onClick={() =>
          navigate(
            `/product-detail?id=${product.id}${
              product.shop_id ? `&shop_src=${product.shop_id}` : ""
            }`
          )
        }
      >
        <div className="prod-img-wrap relative aspect-square w-full overflow-hidden bg-[#F7F7F7]">
          <img
            src={product.image_url || "https://via.placeholder.com/300"}
            alt={name}
            loading="lazy"
            className="prod-img h-full w-full object-contain p-2"
          />

          {hasDiscount ? (
            <span className="badge badge-discount flash-offer absolute left-2 top-2 rounded bg-red-600 px-2 py-1 text-[0.65rem] font-extrabold text-white">
              -{percent}%
            </span>
          ) : null}

          {product.condition === "Fairly Used" ? (
            <span className="badge badge-used absolute right-2 top-2 rounded bg-orange-600 px-2 py-1 text-[0.65rem] font-extrabold text-white">
              Used
            </span>
          ) : null}
        </div>

        <div className="prod-info flex flex-1 flex-col p-3">
          <div
            className="prod-name mb-1 line-clamp-2 text-[0.85rem] font-bold leading-[1.3] text-[#0F1111]"
            title={name}
          >
            {name}
          </div>

          <div className={hasDiscount ? "prod-price flash-price" : "prod-price"}>
            {hasDiscount ? (
              <>
                <span className="prod-old-price mr-1 text-[0.75rem] text-slate-400 line-through">
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
  }

  const hasResults = matchedShops.length > 0 || matchedProducts.length > 0

  return (
    <div className="min-h-screen bg-[#E3E6E6]">
      <header className="sticky top-0 z-[1000] bg-[#131921] text-white shadow-[0_4px_6px_rgba(0,0,0,0.1)]">
        <div className="mx-auto flex w-full max-w-[1600px] items-center gap-4 px-4 py-[10px]">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="text-[1.2rem] transition hover:text-pink-500"
          >
            <FaArrowLeft />
          </button>

          <div className="flex h-[42px] flex-1 overflow-hidden rounded-md border-[3px] border-transparent bg-white transition focus-within:border-pink-600">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") runSearch()
              }}
              placeholder="Search shops and products..."
              className="flex-1 border-none px-4 text-base text-[#0F1111] outline-none"
            />
            <button
              type="button"
              onClick={runSearch}
              className="flex w-[52px] items-center justify-center bg-pink-600 text-white transition hover:bg-pink-700"
            >
              <FaMagnifyingGlass />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1600px] px-5 py-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="mb-4 h-11 w-11 animate-spin rounded-full border-4 border-pink-100 border-t-pink-600" />
            <span className="font-semibold text-[#0F1111]">
              Searching repository...
            </span>
          </div>
        ) : (
          <>
            <h2 className="mb-6 text-[1.1rem] font-semibold text-slate-600">
              Results for{" "}
              <span className="font-extrabold text-pink-600">
                "{query.trim()}"
              </span>
            </h2>

            {matchedShops.length > 0 ? (
              <section className="mb-10">
                <h2 className="sec-title mb-4 flex items-center gap-3 text-[1.35rem] font-extrabold text-[#0F1111]">
                  <span className="inline-block h-[22px] w-[6px] rounded bg-pink-600" />
                  Shops Matching Search
                </h2>

                <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-5">
                  {matchedShops.map(buildShopCard)}
                </div>
              </section>
            ) : null}

            {matchedProducts.length > 0 ? (
              <section>
                <h2 className="sec-title mb-4 flex items-center gap-3 text-[1.35rem] font-extrabold text-[#0F1111]">
                  <span className="inline-block h-[22px] w-[6px] rounded bg-pink-600" />
                  Products Matching Search
                </h2>

                <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-4">
                  {matchedProducts.map(buildProductCard)}
                </div>
              </section>
            ) : null}

            {!hasResults ? (
              <div className="state-box rounded-lg border border-[#D5D9D9] bg-white px-5 py-16 text-center">
                <FaMagnifyingGlass className="mx-auto mb-4 text-5xl opacity-30" />
                <span className="block text-[1.1rem] font-extrabold text-[#0F1111]">
                  No results found
                </span>
                <span className="mt-1 block text-[0.9rem] text-slate-500">
                  Try adjusting your search query or check spelling.
                </span>
              </div>
            ) : null}
          </>
        )}
      </main>
    </div>
  )
}

export default Search