import { useEffect } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { FaArrowLeft } from "react-icons/fa6"
import { supabase } from "../lib/supabase"
import useCachedFetch from "../hooks/useCachedFetch"
import PageSeo from "../components/common/PageSeo"
import { PageLoadingScreen } from "../components/common/PageStatusScreen"
import RetryingNotice, { getRetryingMessage } from "../components/common/RetryingNotice"

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
  const { data, loading, error: dataError } = useCachedFetch(
    cacheKey,
    fetchMerchant,
    { dependencies: [merchantId], ttl: 1000 * 60 * 60 } // Cache results for 1 hour
  )

  const shop = data?.shop || null

  useEffect(() => {
    if (shop?.id) {
      navigate(`/shop-detail?id=${shop.id}`, { replace: true })
    }
  }, [navigate, shop?.id])

  function handleBack() {
    navigate("/")
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
          <PageLoadingScreen
            fullScreen={false}
            title="Loading shop"
            message="Please wait while we prepare this merchant profile."
          />
        ) : dataError && !data ? (
          <RetryingNotice fullScreen={false} message={getRetryingMessage(dataError)} className="w-full max-w-[420px]" />
        ) : shop ? (
          <PageLoadingScreen
            fullScreen={false}
            title="Opening shop"
            message="Please wait while we finish preparing this merchant profile."
          />
        ) : null}
      </main>
    </div>
  )
}

export default MerchantDiscovery
