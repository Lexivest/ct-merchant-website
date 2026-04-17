import { useEffect, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { FaArrowLeft } from "react-icons/fa6"
import useCachedFetch from "../hooks/useCachedFetch"
import PageSeo from "../components/common/PageSeo"
import PageTransitionOverlay from "../components/common/PageTransitionOverlay"
import {
  buildRepoSearchQuerySuffix,
  buildShopDetailPrefetchFromRepoSearch,
  getRepoSearchCooldownMessage,
  invokeRepoSearch,
} from "../lib/repoSearch"
import { prepareShopDetailTransition } from "../lib/detailPageTransitions"

function MerchantDiscovery() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const merchantId = searchParams.get("merchantId")?.trim() || ""

  // 1. Data Fetching Logic for Edge Function
  const fetchMerchant = async () => {
    if (!merchantId) {
      throw new Error("No Merchant ID provided.")
    }

    const { data, error } = await invokeRepoSearch(merchantId)

    if (error) {
      throw new Error("Service unavailable. Please try again.")
    }

    if (data?.rate_limited) {
      throw new Error(getRepoSearchCooldownMessage(data))
    }

    if (data?.error || data?.not_found || !data?.shop) {
      throw new Error("Merchant not found in repository.")
    }

    return data
  }

  // 2. Smart Caching Hook
  const cacheKey = `merchant_discovery_v2_${merchantId || 'empty'}`
  const { data, loading, error: dataError, mutate } = useCachedFetch(
    cacheKey,
    fetchMerchant,
    { dependencies: [merchantId], ttl: 1000 * 60 * 60 } // Cache results for 1 hour
  )

  const shop = data?.shop || null

  useEffect(() => {
    let cancelled = false

    async function openShopWhenReady() {
      if (!shop?.id) return
      const repoRef = shop?.unique_id || merchantId

      try {
        const prefetchedShopData =
          buildShopDetailPrefetchFromRepoSearch(data) ||
          (await prepareShopDetailTransition({
            shopId: shop.id,
            userId: null,
          }))

        if (cancelled) return

        navigate(`/shop-detail?id=${shop.id}${buildRepoSearchQuerySuffix(repoRef)}`, {
          replace: true,
          state: {
            fromDiscoveryTransition: true,
            fromRepoSearch: true,
            prefetchedShopData,
          },
        })
      } catch {
        if (cancelled) return
        navigate(`/shop-detail?id=${shop.id}${buildRepoSearchQuerySuffix(repoRef)}`, {
          replace: true,
          state: {
            fromDiscoveryTransition: true,
            fromRepoSearch: true,
          },
        })
      }
    }

    if (shop?.id) {
      void openShopWhenReady()
    }

    return () => {
      cancelled = true
    }
  }, [data, merchantId, navigate, shop?.id, shop?.unique_id])

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
      
      <PageTransitionOverlay
        visible={loading && !data}
        error={dataError}
        onRetry={() => mutate()}
        onDismiss={handleBack}
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
         {/* Silently preparing... */}
         {!data && !dataError && (
           <div className="text-center">
             <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-pink-600"></div>
             <p className="mt-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Entering Storefront</p>
           </div>
         )}
      </main>
    </div>
  )
}

export default MerchantDiscovery
