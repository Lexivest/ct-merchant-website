import { useMemo } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import {
  FaArrowLeft,
  FaLocationDot,
  FaMobileScreen,
  FaStore,
  FaTriangleExclamation,
} from "react-icons/fa6"
import { FaWhatsapp } from "react-icons/fa"
import { supabase } from "../lib/supabase"
import useCachedFetch from "../hooks/useCachedFetch"
import { ShimmerBlock } from "../components/common/Shimmers"
import StableImage from "../components/common/StableImage"
import PageSeo from "../components/common/PageSeo"

// --- PROFESSIONAL SHIMMER COMPONENT ---
function MerchantDiscoveryShimmer() {
  return (
    <div className="w-full max-w-[420px] overflow-hidden rounded-lg border border-[#D5D9D9] bg-white shadow-[0_4px_12px_rgba(0,0,0,0.05)]">
      <ShimmerBlock className="h-[100px] w-full rounded-none" />
      <div className="-mt-10 px-6 pb-6 flex flex-col items-center text-center">
        <ShimmerBlock className="relative z-10 mb-4 h-20 w-20 rounded-lg border-[3px] border-white shadow" />
        <ShimmerBlock className="mb-2 h-8 w-3/4 rounded" />
        <ShimmerBlock className="mb-6 h-4 w-1/2 rounded" />
        <ShimmerBlock className="mb-6 h-12 w-full rounded" />
        <div className="mb-6 flex w-full gap-3">
          <ShimmerBlock className="h-12 flex-1 rounded-md" />
          <ShimmerBlock className="h-12 flex-1 rounded-md" />
        </div>
        <ShimmerBlock className="h-20 w-full rounded-md" />
      </div>
    </div>
  )
}

function MerchantDiscovery() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const merchantId = searchParams.get("merchantId")?.trim() || ""

  // 1. Data Fetching Logic for Edge Function
  const fetchMerchant = async () => {
    if (!merchantId) {
      throw new Error("No Merchant ID provided.")
    }

    const { data, error } = await supabase.functions.invoke("repo-search", {
      body: { merchantId },
    })

    if (error) {
      throw new Error("Service unavailable. Please try again.")
    }

    if (data?.error || data?.not_found || !data?.shop) {
      throw new Error("Merchant not found in repository.")
    }

    return data
  }

  // 2. Smart Caching Hook
  const cacheKey = `merchant_discovery_${merchantId || 'empty'}`
  const { data, loading, error: dataError, isOffline } = useCachedFetch(
    cacheKey,
    fetchMerchant,
    { dependencies: [merchantId], ttl: 1000 * 60 * 60 } // Cache results for 1 hour
  )

  const shop = data?.shop || null
  const profile = data?.profile || null
  const statusLabel = shop?.is_verified ? "Physically Verified" : "Approved Listing"
  const statusToneClass = shop?.is_verified ? "text-[#007185]" : "text-[#B45309]"

  // Helper Functions
  function getLogo() {
    if (!shop) return ""
    return (
      shop.storefront_url ||
      shop.image_url ||
      "https://via.placeholder.com/150"
    )
  }

  function getWhatsappUrl() {
    if (!shop?.whatsapp) return ""
    let num = shop.whatsapp.replace(/\D/g, "")
    if (num.startsWith("0")) {
      num = `234${num.slice(1)}`
    }
    return `https://wa.me/${num}`
  }

  function handleBack() {
    navigate("/")
  }

  function handleViewShop() {
    if (!shop?.id) return
    navigate(`/shop-detail?id=${shop.id}`)
  }

  return (
    <div className="min-h-screen bg-[#F3F4F6]">
      <PageSeo
        title={shop?.name ? `${shop.name} | CTMerchant Merchant Profile` : "Merchant Profile | CTMerchant"}
        description={
          shop?.description ||
          "Discover verified merchant profiles, contact details, and storefront information on CTMerchant."
        }
        canonicalPath={`/reposearch${merchantId ? `?merchantId=${encodeURIComponent(merchantId)}` : ""}`}
        image={getLogo()}
      />
      <header className="sticky top-0 z-[100] w-full bg-[#131921] text-white shadow">
        <div className="mx-auto flex w-full max-w-[600px] items-center gap-4 px-4 py-3">
          <button
            type="button"
            onClick={handleBack}
            className="text-[1.2rem] transition hover:text-pink-500"
            aria-label="Go back"
          >
            <FaArrowLeft />
          </button>
          <span className="text-[1.15rem] font-bold tracking-[0.5px]">
            Merchant Discovery
          </span>
        </div>
      </header>

      <main className="flex justify-center px-5 py-10">
        {loading && !data ? (
          <MerchantDiscoveryShimmer />
        ) : dataError && !data ? (
          <div className="w-full max-w-[420px] rounded-lg border border-[#D5D9D9] bg-white px-5 py-16 text-center shadow-sm">
            <FaTriangleExclamation className="mx-auto mb-4 text-5xl text-red-700" />
            <h3 className="mb-2 text-xl font-extrabold text-[#0F1111]">
              Merchant Not Found
            </h3>
            <p className="text-[0.95rem] text-slate-600">{dataError}</p>
            <button
              type="button"
              onClick={handleBack}
              className="mt-5 rounded-md border border-[#D5D9D9] bg-white px-6 py-3 font-semibold text-[#0F1111] shadow-sm transition hover:bg-slate-50"
            >
              Go Back
            </button>
          </div>
        ) : shop ? (
          <div className="w-full max-w-[420px] overflow-hidden rounded-lg border border-[#D5D9D9] bg-white shadow-[0_4px_12px_rgba(0,0,0,0.05)]">
            <div className="h-[100px] bg-[#232F3E]" />

            <div className="-mt-10 px-6 pb-6 text-center">
              <div className="relative mx-auto h-20 w-20 overflow-hidden rounded-lg border-[3px] border-white bg-slate-50 shadow">
                <StableImage
                  src={getLogo()}
                  alt={shop.name}
                  containerClassName="h-full w-full bg-white"
                  className="h-full w-full object-contain bg-white p-1"
                />
              </div>

              <div
                className={`relative mx-auto -mt-4 h-4 w-4 translate-x-8 rounded-full border-2 border-white ${
                  shop.is_verified ? "bg-green-600" : "bg-red-700"
                }`}
              />

              <div className="mt-4">
                <h2 className="flex items-center justify-center gap-2 text-[1.4rem] font-extrabold text-[#0F1111]">
                  <span>{shop.name}</span>
                </h2>

                <p className="mt-1 text-[0.9rem] font-medium text-slate-600">
                  Proprietor: {profile?.full_name || "Registered Merchant"}
                </p>
              </div>

              <div className="my-4 flex flex-wrap justify-center gap-2">
                <span className="rounded border border-pink-200 bg-pink-100 px-3 py-1 text-[0.75rem] font-extrabold tracking-[0.5px] text-pink-600">
                  {shop.unique_id || "ID Pending"}
                </span>

                <span className="flex items-center gap-1 rounded border border-[#D5D9D9] bg-slate-50 px-3 py-1 text-[0.8rem] font-semibold text-slate-600">
                  <FaLocationDot className="text-pink-600" />
                  {shop.cities?.name || "Local"}
                </span>
              </div>

              <div className="mb-6 flex rounded-md border border-[#D5D9D9] bg-slate-50 p-3 text-left">
                <div className="min-w-0 flex-1 px-3">
                  <span className="mb-1 block text-[0.7rem] font-extrabold uppercase text-slate-500">
                    Address
                  </span>
                  <span className="block break-words whitespace-normal text-[0.9rem] font-bold leading-5 text-[#0F1111]">
                    {shop.address || "Address not listed"}
                  </span>
                </div>

                <div className="shrink-0 border-l border-[#D5D9D9] px-3">
                  <span className="mb-1 block text-[0.7rem] font-extrabold uppercase text-slate-500">
                    Status
                  </span>
                  <span className={`block whitespace-nowrap text-[0.9rem] font-bold ${statusToneClass}`}>
                    {statusLabel}
                  </span>
                </div>
              </div>

              <div
                className={`mb-6 grid gap-3 ${
                  shop.whatsapp ? "grid-cols-2" : "grid-cols-1"
                }`}
              >
                {shop.whatsapp ? (
                  <a
                    href={getWhatsappUrl()}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-center gap-2 rounded-md bg-[#25D366] px-4 py-3 font-bold text-white shadow transition hover:-translate-y-0.5 hover:bg-green-600"
                  >
                    <FaWhatsapp className="text-[1.1rem]" />
                    Chat
                  </a>
                ) : null}

                <button
                  type="button"
                  onClick={handleViewShop}
                  className="flex items-center justify-center gap-2 rounded-md bg-pink-600 px-4 py-3 font-bold text-white shadow transition hover:-translate-y-0.5 hover:bg-pink-700"
                >
                  <FaStore className="text-[1rem]" />
                  View Shop
                </button>
              </div>

              <div className="flex items-center gap-4 rounded-md border border-[#D5D9D9] bg-slate-50 p-4 text-left">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#D5D9D9] bg-white text-[#007185] shadow-sm">
                  <FaMobileScreen />
                </div>

                <div>
                  <p className="text-[0.95rem] font-extrabold text-[#0F1111]">
                    Full Experience
                  </p>
                  <p className="mt-1 text-[0.8rem] text-slate-600">
                    Access live inventory directly via the CT-Merchant portal.
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  )
}

export default MerchantDiscovery
