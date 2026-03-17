import { useEffect, useState } from "react"
import { FaArrowLeft, FaHeart } from "react-icons/fa6"
import { supabase } from "../../../lib/supabase"

function WishlistDashboardView({ onBack, user, onOpenProduct }) {
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState([])

  useEffect(() => {
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
  }, [user?.id])

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
                        ? onOpenProduct(product.id)
                        : window.location.assign(`/product-detail?id=${product.id}`)
                    }
                    className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm transition hover:-translate-y-1 hover:border-[#2E1065] hover:shadow-md"
                  >
                    <img
                      src={product.image_url || "https://via.placeholder.com/150"}
                      alt={product.name || "Product"}
                      className="h-40 w-full object-cover"
                    />

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
                      <div className="mb-1 truncate text-sm font-bold text-slate-700">
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