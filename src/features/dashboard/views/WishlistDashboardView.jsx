import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { FaArrowLeft, FaHeart } from "react-icons/fa6"
import { supabase } from "../../../lib/supabase"
import StableImage from "../../../components/common/StableImage"

function WishlistDashboardView({
  onBack,
  user,
  onOpenProduct,
  prefetchedItems = null,
}) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(() => !prefetchedItems)
  const [items, setItems] = useState(() => prefetchedItems || [])

  useEffect(() => {
    if (prefetchedItems) {
      setItems(prefetchedItems)
      setLoading(false)
      return
    }

    async function fetchWishlist() {
      if (!user?.id) {
        setItems([])
        setLoading(false)
        return
      }

      try {
        setLoading(true)

        const { data, error } = await supabase
          .from("wishlist")
          .select("product_id, created_at, products(*)")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })

        if (error) throw error

        setItems((data || []).filter((item) => item.products))
      } catch (err) {
        console.error("Error fetching wishlist:", err)
        setItems([])
      } finally {
        setLoading(false)
      }
    }

    fetchWishlist()
  }, [prefetchedItems, user?.id])

  function renderPrice(product) {
    const hasDiscount =
      product.discount_price &&
      product.price &&
      Number(product.discount_price) < Number(product.price)

    if (hasDiscount) {
      return (
        <div className="text-base font-extrabold text-red-600">
          <span className="mr-1 text-xs font-medium text-slate-400 line-through">
            ₦{Number(product.price).toLocaleString()}
          </span>
          ₦{Number(product.discount_price).toLocaleString()}
        </div>
      )
    }

    return (
      <div className="text-base font-extrabold text-[#2E1065]">
        ₦{Number(product.discount_price || product.price || 0).toLocaleString()}
      </div>
    )
  }

  return (
    <div className="screen active">
      <section className="bg-slate-50 px-4 py-5 md:py-6">
        <div className="mx-auto max-w-[800px]">
          <div className="mb-6 flex items-center gap-4 rounded-2xl bg-[#2E1065] px-4 py-4 text-white shadow-md">
            <button
              type="button"
              onClick={onBack}
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 text-white transition hover:bg-white/30"
              aria-label="Go back"
            >
              <FaArrowLeft />
            </button>
            <div className="text-xl font-bold">My Wishlist</div>
          </div>

          {loading ? (
            <div className="py-20">
              <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-[#2E1065]" />
            </div>
          ) : items.length === 0 ? (
            <div className="py-16 text-center text-slate-500">
              <FaHeart className="mx-auto mb-4 text-6xl text-slate-200" />
              <p>Your wishlist is empty.</p>
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4">
              {items.map((item) => {
                const product = item.products
                const hasDiscount =
                  product.discount_price &&
                  product.price &&
                  Number(product.discount_price) < Number(product.price)
                const percent = hasDiscount
                  ? Math.round(
                      ((Number(product.price) - Number(product.discount_price)) /
                        Number(product.price)) *
                        100
                    )
                  : 0

              return (
                <button
                  key={item.product_id}
                    type="button"
                    onClick={() =>
                      onOpenProduct
                        ? onOpenProduct(product.id, product.shop_id)
                        : navigate(`/product-detail?id=${product.id}`)
                    }
                  className="relative overflow-hidden rounded-[22px] border border-slate-200 bg-white text-left shadow-[0_2px_6px_rgba(15,23,42,0.04)] transition hover:-translate-y-1 hover:border-pink-200 hover:shadow-[0_14px_28px_rgba(15,23,42,0.08)]"
                >
                    <div className="relative aspect-square border-b border-slate-200 bg-slate-50 p-2">
                      <StableImage
                        src={product.image_url || "https://via.placeholder.com/150"}
                        alt={product.name || "Product"}
                        containerClassName="flex h-full w-full items-center justify-center overflow-hidden rounded-[18px] bg-white"
                        className="h-full w-full object-contain p-2"
                      />
                    </div>

                    {hasDiscount ? (
                      <span className="absolute left-2 top-2 rounded bg-red-600 px-2 py-1 text-[11px] font-bold text-white">
                        -{percent}%
                      </span>
                    ) : null}

                    {product.condition === "Fairly Used" ? (
                      <span className="absolute right-2 top-2 rounded bg-orange-600 px-2 py-1 text-[11px] font-bold text-white">
                        Used
                      </span>
                    ) : null}

                    <div className="p-3">
                      <div
                        className="mb-1 line-clamp-2 min-h-[2.5rem] text-[0.9rem] font-bold leading-[1.35] text-[#0F1111]"
                        title={product.name}
                      >
                        {product.name}
                      </div>
                      {renderPrice(product)}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

export default WishlistDashboardView
