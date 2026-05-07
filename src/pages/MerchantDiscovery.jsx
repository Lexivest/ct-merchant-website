import { useEffect } from "react"
import { useLocation, useNavigate, useSearchParams } from "react-router-dom"
import { FaArrowLeft, FaMagnifyingGlass, FaShieldHalved } from "react-icons/fa6"
import useCachedFetch from "../hooks/useCachedFetch"
import PageSeo from "../components/common/PageSeo"
import PageTransitionOverlay from "../components/common/PageTransitionOverlay"
import {
  buildRepoSearchQuerySuffix,
  buildShopDetailPrefetchFromRepoSearch,
  getRepoSearchCooldownMessage,
  invokeRepoSearch,
  normalizeRepoSearchId,
  REPO_SEARCH_INTENT_PARAM,
  REPO_SEARCH_INVALID_MESSAGE,
} from "../lib/repoSearch"
import { prepareShopDetailTransition } from "../lib/detailPageTransitions"
import {
  createRepoSearchIntent,
  hasValidRepoSearchIntent,
} from "../lib/routeIntents"
import { isServiceCategory, isServiceShop } from "../lib/serviceCategories"

function buildRepoSearchPath(merchantId, repoSearchIntent = "") {
  const params = new URLSearchParams({ merchantId })
  if (repoSearchIntent) params.set(REPO_SEARCH_INTENT_PARAM, repoSearchIntent)
  return `/reposearch?${params.toString()}`
}

function RepoSearchResumeScreen({ merchantId }) {
  const navigate = useNavigate()

  function confirmSearch() {
    const repoSearchIntent = createRepoSearchIntent(merchantId)
    navigate(buildRepoSearchPath(merchantId, repoSearchIntent), {
      replace: true,
      state: {
        fromRepoSearch: true,
        repoSearchConfirmed: true,
        repoSearchIntent,
      },
    })
  }

  const hasMerchantId = Boolean(merchantId)

  return (
    <div className="min-h-screen bg-[#F3F4F6]">
      <PageSeo
        title="Confirm Repository Search | CTMerchant"
        description="Confirm before opening a CTMerchant repository result."
        canonicalPath={hasMerchantId ? `/reposearch?merchantId=${encodeURIComponent(merchantId)}` : "/reposearch"}
        noindex
      />

      <header className="sticky top-0 z-[100] w-full bg-[#131921] text-white shadow">
        <div className="mx-auto flex w-full max-w-[600px] items-center gap-4 px-4 py-3">
          <button
            type="button"
            onClick={() => navigate("/", { replace: true })}
            className="text-[1.2rem] transition hover:text-pink-500"
            aria-label="Return home"
          >
            <FaArrowLeft />
          </button>
          <span className="text-[1.15rem] font-bold tracking-[0.5px]">
            Repository Search
          </span>
        </div>
      </header>

      <main className="flex min-h-[70vh] items-center justify-center px-5 py-10">
        <div className="w-full max-w-md rounded-[30px] border border-slate-200 bg-white p-7 text-center shadow-xl">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-pink-50 text-pink-600">
            <FaShieldHalved className="text-2xl" />
          </div>
          <h1 className="mt-5 text-2xl font-black text-slate-950">
            Confirm this repository search
          </h1>
          <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">
            We paused this route so CTMerchant will not open a shop from an old browser history entry, failed login refresh, or stale cached route.
          </p>
          <div className="mt-5 rounded-2xl bg-slate-50 px-4 py-3 text-sm font-black text-slate-900">
            {hasMerchantId ? merchantId : REPO_SEARCH_INVALID_MESSAGE}
          </div>
          <div className="mt-6 flex flex-col gap-3">
            {hasMerchantId ? (
              <button
                type="button"
                onClick={confirmSearch}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-pink-600 px-5 text-sm font-black text-white transition hover:bg-pink-700"
              >
                <FaMagnifyingGlass />
                Open store
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => navigate("/", { replace: true })}
              className="h-12 rounded-2xl bg-slate-100 px-5 text-sm font-bold text-slate-700 transition hover:bg-slate-200"
            >
              Back to home
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}

function MerchantDiscoveryRunner({ merchantId, repoSearchIntent }) {
  const navigate = useNavigate()

  // 1. Data Fetching Logic for Edge Function
  const fetchMerchant = async () => {
    if (!merchantId) {
      throw new Error(REPO_SEARCH_INVALID_MESSAGE)
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

        const repoShop = prefetchedShopData?.shop || shop
        const isServiceResult =
          isServiceShop(repoShop) ||
          isServiceCategory(repoShop?.category)
        const targetPath = isServiceResult
          ? `/service-provider?id=${shop.id}&service=${encodeURIComponent(repoShop?.category || "")}${buildRepoSearchQuerySuffix(repoRef, repoSearchIntent)}`
          : `/shop-detail?id=${shop.id}${buildRepoSearchQuerySuffix(repoRef, repoSearchIntent)}`

        navigate(targetPath, {
          replace: true,
          state: {
            fromDiscoveryTransition: true,
            fromRepoSearch: true,
            repoSearchConfirmed: true,
            repoSearchIntent,
            ...(isServiceResult
              ? { prefetchedServiceProviderData: prefetchedShopData }
              : { prefetchedShopData }),
          },
        })
      } catch {
        if (cancelled) return
        const isServiceResult =
          isServiceShop(shop) ||
          isServiceCategory(shop?.category)
        const targetPath = isServiceResult
          ? `/service-provider?id=${shop.id}&service=${encodeURIComponent(shop?.category || "")}${buildRepoSearchQuerySuffix(repoRef, repoSearchIntent)}`
          : `/shop-detail?id=${shop.id}${buildRepoSearchQuerySuffix(repoRef, repoSearchIntent)}`

        navigate(targetPath, {
          replace: true,
          state: {
            fromDiscoveryTransition: true,
            fromRepoSearch: true,
            repoSearchConfirmed: true,
            repoSearchIntent,
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
  }, [data, merchantId, navigate, repoSearchIntent, shop])

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
          noindex
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

function MerchantDiscovery() {
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const rawMerchantId = searchParams.get("merchantId")?.trim() || ""
  const merchantId = normalizeRepoSearchId(rawMerchantId)
  const repoSearchIntent =
    searchParams.get(REPO_SEARCH_INTENT_PARAM)?.trim() ||
    location.state?.repoSearchIntent ||
    ""
  const hasRouteIntent =
    hasValidRepoSearchIntent(repoSearchIntent, merchantId) ||
    (location.state?.fromRepoSearch === true &&
      location.state?.repoSearchConfirmed === true)

  if (!merchantId || !hasRouteIntent) {
    return <RepoSearchResumeScreen merchantId={merchantId} />
  }

  return (
    <MerchantDiscoveryRunner
      merchantId={merchantId}
      repoSearchIntent={repoSearchIntent}
    />
  )
}

export default MerchantDiscovery
