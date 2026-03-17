import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  FaArrowLeft,
  FaChevronRight,
  FaCircleCheck,
  FaLocationDot,
  FaMagnifyingGlass,
  FaStoreSlash,
  FaTriangleExclamation,
} from "react-icons/fa6"
import { supabase } from "../lib/supabase"

function ShopIndex() {
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState("")
  const [headerTitle, setHeaderTitle] = useState("Shop Index")
  const [searchInput, setSearchInput] = useState("")
  const [allShops, setAllShops] = useState([])

  useEffect(() => {
    async function fetchIndex() {
      try {
        setLoading(true)
        setErrorMessage("")

        const {
          data: { session },
        } = await supabase.auth.getSession()

        if (!session?.user) {
          navigate("/", { replace: true })
          return
        }

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("city_id, cities(name)")
          .eq("id", session.user.id)
          .single()

        if (profileError) throw profileError

        if (!profile?.city_id) {
          setErrorMessage("City data not found. Please complete your profile.")
          return
        }

        setHeaderTitle(`${profile.cities?.name || "City"} Directory`)

        const { data: shops, error: shopsError } = await supabase
          .from("shops")
          .select("*")
          .eq("city_id", profile.city_id)
          .order("name", { ascending: true })

        if (shopsError) throw shopsError

        setAllShops(Array.isArray(shops) ? shops : [])
      } catch (error) {
        console.error(error)
        setErrorMessage(error.message || "Failed to load directory.")
      } finally {
        setLoading(false)
      }
    }

    fetchIndex()
  }, [navigate])

  const filteredShops = useMemo(() => {
    const query = String(searchInput || "").trim().toLowerCase()

    if (!query) return allShops

    return allShops.filter((shop) => {
      const name = String(shop?.name || "").toLowerCase()
      const category = String(shop?.category || "").toLowerCase()
      const uniqueId = String(shop?.unique_id || "").toLowerCase()
      const address = String(shop?.address || "").toLowerCase()

      return (
        name.includes(query) ||
        category.includes(query) ||
        uniqueId.includes(query) ||
        address.includes(query)
      )
    })
  }, [allShops, searchInput])

  function getDisplayImage(shop) {
    if (shop?.image_url) return shop.image_url
    if (shop?.store_front_url) return shop.store_front_url
    if (Array.isArray(shop?.banners) && shop.banners.length > 0) {
      return shop.banners[0]
    }
    return ""
  }

  function getDisplayId(shop) {
    const rawId = String(shop?.unique_id || "N/A")
    return rawId.includes("-") ? rawId.split("-").pop() : rawId
  }

  return (
    <div className="flex h-screen flex-col bg-[#F3F4F6] text-[#0F1111]">
      <div className="sticky top-0 z-50 bg-[#131921] shadow-[0_4px_6px_rgba(0,0,0,0.1)]">
        <header className="mx-auto flex w-full max-w-[800px] items-center gap-4 px-4 py-3 text-white">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="ml-[-4px] p-1 text-[1.2rem] transition hover:text-pink-500"
          >
            <FaArrowLeft />
          </button>

          <div className="truncate text-[1.15rem] font-bold tracking-[0.5px]">
            {headerTitle}
          </div>
        </header>

        <div className="mx-auto w-full max-w-[800px] px-4 pb-4">
          <div className="flex h-11 overflow-hidden rounded-md border-[3px] border-transparent bg-white transition focus-within:border-pink-600">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by Name, ID, or Category..."
              className="flex-1 border-none px-4 text-base text-[#0F1111] outline-none"
            />
            <button
              type="button"
              className="flex w-[52px] items-center justify-center bg-pink-600 text-white"
              aria-label="Search"
            >
              <FaMagnifyingGlass className="text-[1.1rem]" />
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[800px] flex-1 overflow-y-auto px-4 py-5">
        {loading ? (
          <div className="flex h-full flex-col items-center justify-center px-5 text-center text-slate-400">
            <div className="mb-4 h-10 w-10 animate-spin rounded-full border-4 border-pink-100 border-t-pink-600" />
            <span className="font-semibold">Loading Directory...</span>
          </div>
        ) : errorMessage ? (
          <div className="flex h-full flex-col items-center justify-center px-5 text-center">
            <FaTriangleExclamation className="mb-4 text-[2.5rem] text-red-700" />
            <span className="font-semibold text-[#0F1111]">{errorMessage}</span>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 border-none bg-transparent text-base font-bold text-pink-600"
            >
              Tap to Retry
            </button>
          </div>
        ) : filteredShops.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-5 text-center text-slate-400">
            <FaStoreSlash className="mb-4 text-5xl opacity-30" />
            <span className="font-semibold text-[#0F1111]">
              No matching shops found.
            </span>
            <span className="mt-1 text-[0.85rem]">
              Try adjusting your search criteria.
            </span>
          </div>
        ) : (
          filteredShops.map((shop) => {
            const imageUrl = getDisplayImage(shop)
            const displayId = getDisplayId(shop)

            return (
              <div
                key={shop.id}
                onClick={() => navigate(`/shop-detail?id=${shop.id}`)}
                className="mb-3 flex cursor-pointer items-center gap-4 rounded-lg border border-[#D5D9D9] bg-white p-4 shadow-[0_2px_4px_rgba(0,0,0,0.02)] transition hover:-translate-y-0.5 hover:border-slate-400 hover:shadow-[0_4px_10px_rgba(0,0,0,0.08)] active:scale-[0.98]"
              >
                {imageUrl ? (
                  <img
                    src={imageUrl}
                    alt={shop.name}
                    loading="lazy"
                    className="h-16 w-16 shrink-0 rounded-lg border border-slate-200 bg-slate-50 object-cover"
                  />
                ) : (
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-pink-200 bg-pink-50 text-[1.4rem] font-extrabold text-pink-600">
                    {String(shop?.name || "S").charAt(0).toUpperCase()}
                  </div>
                )}

                <div className="min-w-0 flex-1 overflow-hidden">
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <span className="truncate text-[1.05rem] font-extrabold text-[#0F1111]">
                      {shop.name}
                    </span>

                    {shop.is_verified ? (
                      <FaCircleCheck
                        className="shrink-0 text-[0.9rem] text-[#007185]"
                        title="Verified"
                      />
                    ) : null}
                  </div>

                  <div className="mb-1.5 flex items-center gap-2">
                    <span className="rounded bg-pink-50 px-2 py-1 text-[0.7rem] font-bold text-pink-600">
                      {shop.category || "Uncategorized"}
                    </span>

                    {shop.is_verified ? (
                      <span className="text-[0.75rem] font-semibold text-slate-500">
                        ID: {displayId}
                      </span>
                    ) : null}
                  </div>

                  <div className="truncate text-[0.85rem] font-medium text-slate-500">
                    <FaLocationDot className="mr-1 inline text-slate-400" />
                    {shop.address || "No address"}
                  </div>
                </div>

                <FaChevronRight className="shrink-0 text-[1.1rem] text-slate-300" />
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

export default ShopIndex