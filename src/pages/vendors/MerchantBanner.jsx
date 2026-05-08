import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  FaArrowLeft,
  FaCheck,
  FaCircleNotch,
  FaCloudArrowUp,
  FaImage,
  FaPanorama,
  FaWandMagicSparkles,
} from "react-icons/fa6";
import { supabase } from "../../lib/supabase";
import useAuthSession from "../../hooks/useAuthSession";
import usePreventPullToRefresh from "../../hooks/usePreventPullToRefresh";
import { PageLoadingScreen } from "../../components/common/PageStatusScreen";
import GlobalErrorScreen from "../../components/common/GlobalErrorScreen";
import { useGlobalFeedback } from "../../components/common/GlobalFeedbackProvider";
import { getFriendlyErrorMessage } from "../../lib/friendlyErrors";
import { UPLOAD_RULES } from "../../lib/uploadRules";
import {
  FEATURED_BANNER_BACKGROUNDS,
  buildStandaloneFeaturedBannerSvg,
  getProfileDisplayName,
  svgToJpegBlob,
} from "../../lib/featuredBannerEngine";

const BANNER_RULE = UPLOAD_RULES.shopBanners;
const BANNER_BUCKET = BANNER_RULE.bucket;
const BANNER_WIDTH = 1600;
const BANNER_HEIGHT = 600;

function BannerShimmer() {
  return (
    <PageLoadingScreen
      title="Opening banner"
      message="Please wait while we prepare your generated banner."
    />
  );
}

function statusLabel(status) {
  if (status === "pending") return "Pending Approval";
  if (status === "approved") return "Approved";
  if (status === "rejected") return "Rejected";
  return "New Generated Banner";
}

function statusClass(status) {
  if (status === "pending") return "border-amber-200 bg-amber-100 text-amber-800";
  if (status === "approved") return "border-emerald-200 bg-emerald-100 text-emerald-800";
  if (status === "rejected") return "border-rose-200 bg-rose-100 text-rose-800";
  return "border-slate-200 bg-slate-100 text-slate-700";
}

export default function MerchantBanner() {
  const navigate = useNavigate();
  const location = useLocation();
  usePreventPullToRefresh();
  const { notify, confirm } = useGlobalFeedback();
  const [searchParams] = useSearchParams();
  const urlShopId = searchParams.get("shop_id");
  const prefetchedData =
    location.state?.prefetchedData?.kind === "merchant-banner" &&
    (!urlShopId || String(location.state.prefetchedData.shopId) === String(urlShopId))
      ? location.state.prefetchedData
      : null;

  const { user, loading: authLoading, isOffline } = useAuthSession();

  const [loading, setLoading] = useState(() => !prefetchedData);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [shopData, setShopData] = useState(() => prefetchedData?.shopData || null);
  const [products, setProducts] = useState(() => prefetchedData?.products || []);
  const [proprietorName, setProprietorName] = useState(() => prefetchedData?.proprietorName || "");
  const [existingBanners, setExistingBanners] = useState(() => prefetchedData?.existingBanners || []);
  const [status, setStatus] = useState(() => prefetchedData?.status || "");
  const [backgroundKey, setBackgroundKey] = useState(FEATURED_BANNER_BACKGROUNDS[0].key);
  const [renderRequest, setRenderRequest] = useState(0);
  const [generatedBlob, setGeneratedBlob] = useState(null);
  const [generatedPreviewUrl, setGeneratedPreviewUrl] = useState("");

  const shopId = shopData?.id || prefetchedData?.shopId || urlShopId;
  const isServiceMode = shopData?.is_service === true;
  const entityName = isServiceMode ? "service" : "shop";
  const entityTitle = isServiceMode ? "Service" : "Shop";
  const itemPlural = isServiceMode ? "services" : "products";
  const selectedBackground = useMemo(
    () => FEATURED_BANNER_BACKGROUNDS.find((background) => background.key === backgroundKey) || FEATURED_BANNER_BACKGROUNDS[0],
    [backgroundKey]
  );

  const getBannerPathFromUrl = (url) => {
    if (!url) return null;
    try {
      const cleanUrl = String(url).split("?")[0];
      const escapedBucket = BANNER_BUCKET.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
      const regex = new RegExp(`/storage/v1/object/(?:public|authenticated)/${escapedBucket}/(.+)$`, "i");
      const match = cleanUrl.match(regex);
      return match?.[1] || null;
    } catch {
      return null;
    }
  };

  useEffect(() => {
    if (prefetchedData) {
      setShopData(prefetchedData.shopData || null);
      setProducts(prefetchedData.products || []);
      setProprietorName(prefetchedData.proprietorName || "");
      setExistingBanners(prefetchedData.existingBanners || []);
      setStatus(prefetchedData.status || "");
      setError(null);
      setLoading(false);
      return;
    }

    async function init() {
      if (!user) return;
      if (isOffline) {
        setError("Network offline. Please connect to the internet to manage your banner.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        const { data: profile } = await supabase.from("profiles").select("is_suspended").eq("id", user.id).maybeSingle();
        if (profile?.is_suspended) throw new Error("Account restricted.");

        let currentShopId = urlShopId;
        if (!currentShopId) {
          const { data: shopRows } = await supabase
            .from("shops")
            .select("id")
            .eq("owner_id", user.id)
            .order("created_at", { ascending: false })
            .limit(1);
          const shopLookup = shopRows?.[0] || null;
          if (!shopLookup) throw new Error("Shop not found.");
          currentShopId = shopLookup.id;
        }

        const { data: shop, error: shopErr } = await supabase
          .from("shops")
          .select("id, owner_id, name, category, address, image_url, status, is_service, cities(name)")
          .eq("id", currentShopId)
          .eq("owner_id", user.id)
          .maybeSingle();

        if (shopErr || !shop) throw new Error("Shop not found or access denied.");
        if (shop.status !== "approved") {
          const modeEntity = shop.is_service ? "service" : "shop";
          throw new Error(`Your ${modeEntity} application must be approved before you can manage your banner.`);
        }

        const [bannerResult, productResult, profileResult] = await Promise.all([
          supabase
            .from("shop_banners_news")
            .select("*")
            .eq("shop_id", shop.id)
            .eq("content_type", "banner")
            .order("created_at", { ascending: false }),
          supabase
            .from("products")
            .select("id, shop_id, image_url, is_available")
            .eq("shop_id", shop.id)
            .eq("is_available", true)
            .not("image_url", "is", null)
            .order("id", { ascending: true })
            .limit(5),
          shop.owner_id
            ? supabase.rpc("get_public_profiles", { profile_ids: [shop.owner_id] })
            : Promise.resolve({ data: [], error: null }),
        ]);

        if (bannerResult.error) throw bannerResult.error;
        if (productResult.error) throw productResult.error;
        if (profileResult.error) throw profileResult.error;

        setShopData(shop);
        setProducts(productResult.data || []);
        setProprietorName(getProfileDisplayName(profileResult.data?.[0]));
        setExistingBanners(bannerResult.data || []);
        setStatus(bannerResult.data?.[0]?.status || "");
      } catch (err) {
        setError(getFriendlyErrorMessage(err, "Could not load this page. Retry."));
      } finally {
        setLoading(false);
      }
    }

    if (!authLoading) init();
  }, [user, authLoading, isOffline, prefetchedData, urlShopId]);

  useEffect(() => {
    if (!shopData) {
      setGeneratedBlob(null);
      setGeneratedPreviewUrl("");
      return undefined;
    }

    let cancelled = false;
    let objectUrl = "";

    async function renderGeneratedBanner() {
      try {
        setRendering(true);
        const svg = await buildStandaloneFeaturedBannerSvg({
          shop: shopData,
          products,
          backgroundKey,
          proprietorName,
          width: BANNER_WIDTH,
          height: BANNER_HEIGHT,
        });
        const blob = await svgToJpegBlob(svg, BANNER_WIDTH, BANNER_HEIGHT, {
          maxBytes: BANNER_RULE.maxBytes,
          qualityStart: 0.86,
          qualityFloor: 0.2,
          qualityStep: 0.08,
        });
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setGeneratedBlob(blob);
        setGeneratedPreviewUrl((current) => {
          if (current) URL.revokeObjectURL(current);
          return objectUrl;
        });
      } catch (renderError) {
        console.warn("Could not render generated banner:", renderError);
        if (!cancelled) {
          setGeneratedBlob(null);
          setGeneratedPreviewUrl("");
          notify({
            type: "error",
            title: "Banner preview failed",
            message: getFriendlyErrorMessage(renderError, "Could not generate this banner preview."),
          });
        }
      } finally {
        if (!cancelled) setRendering(false);
      }
    }

    void renderGeneratedBanner();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [shopData, products, backgroundKey, proprietorName, renderRequest, notify]);

  const handleSubmit = async () => {
    if (saving) return;
    if (isOffline) {
      notify({ type: "error", title: "Network unavailable", message: "You must be online to submit your banner." });
      return;
    }
    if (!generatedBlob || !shopId) {
      notify({ type: "error", title: "Banner not ready", message: "Please wait for the generated preview before submitting." });
      return;
    }

    try {
      setSaving(true);

      const idsToDelete = [];
      const pathsToDelete = [];
      existingBanners.forEach((banner) => {
        if (banner?.id) idsToDelete.push(banner.id);
        const oldPath = getBannerPathFromUrl(banner?.content_data);
        if (oldPath) pathsToDelete.push(oldPath);
      });

      const path = `${shopId}/${Date.now()}_generated_banner.jpg`;
      const { error: uploadError } = await supabase.storage
        .from(BANNER_BUCKET)
        .upload(path, generatedBlob, {
          contentType: "image/jpeg",
          upsert: false,
          cacheControl: "31536000",
        });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from(BANNER_BUCKET).getPublicUrl(path);
      const { error: insertError } = await supabase.from("shop_banners_news").insert({
        shop_id: Number(shopId),
        merchant_id: user.id,
        content_type: "banner",
        content_data: data.publicUrl,
        status: "pending",
      });

      if (insertError) {
        await supabase.storage.from(BANNER_BUCKET).remove([path]);
        throw insertError;
      }

      if (idsToDelete.length > 0) {
        const { error: deleteRowsError } = await supabase.from("shop_banners_news").delete().in("id", idsToDelete);
        if (deleteRowsError) throw deleteRowsError;
      }

      if (pathsToDelete.length > 0) {
        const { error: cleanupError } = await supabase.storage.from(BANNER_BUCKET).remove([...new Set(pathsToDelete)]);
        if (cleanupError) console.warn("Old banner storage cleanup failed:", cleanupError);
      }

      setStatus("pending");
      const goBack = await confirm({
        type: "success",
        title: "Banner submitted",
        message: `Your generated ${entityName} banner has been sent for staff approval.`,
        confirmText: "Back to dashboard",
        cancelText: "Stay here",
      });
      if (goBack) navigate("/vendor-panel");
    } catch (err) {
      notify({ type: "error", title: "Submission failed", message: getFriendlyErrorMessage(err, "Could not submit this banner.") });
    } finally {
      setSaving(false);
    }
  };

  const handleGenerate = () => {
    setRenderRequest((current) => current + 1);
  };

  if (authLoading || loading) return <BannerShimmer />;

  if (error) {
    return (
      <GlobalErrorScreen
        error={error}
        message={error}
        onRetry={() => window.location.reload()}
        onBack={() => navigate("/vendor-panel")}
      />
    );
  }

  return (
    <div
      className={`flex min-h-screen flex-col bg-[#F3F4F6] text-[#0F1111] ${
        location.state?.fromVendorTransition ? "ctm-page-enter" : ""
      }`}
    >
      <header className="sticky top-0 z-40 flex items-center justify-between bg-[#131921] px-4 py-3 text-white shadow-sm">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate("/vendor-panel")} className="text-xl transition hover:text-[#db2777]">
            <FaArrowLeft />
          </button>
          <div className="text-[1.15rem] font-bold">{entityTitle} Banner</div>
        </div>
        <button
          onClick={handleSubmit}
          disabled={saving || rendering || !generatedBlob}
          className="flex items-center gap-2 rounded-md border border-[#be185d] bg-[#db2777] px-4 py-1.5 text-[0.95rem] font-bold text-white shadow-[0_2px_5px_rgba(219,39,119,0.3)] transition hover:bg-[#be185d] disabled:cursor-not-allowed disabled:border-[#D5D9D9] disabled:bg-[#E3E6E6] disabled:text-[#888C8C] disabled:shadow-none"
        >
          {saving ? <><FaCircleNotch className="animate-spin" /> Submitting</> : <><FaCheck /> Submit</>}
        </button>
      </header>

      <main className="mx-auto w-full max-w-[760px] flex-1 p-5">
        <div className="mb-5 rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-pink-50 text-pink-600">
              <FaWandMagicSparkles />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-950">Generated {entityName} banner</h3>
              <p className="text-sm font-semibold text-slate-500">Choose a background. CT Studio generates the banner from your {entityName} profile and {itemPlural}.</p>
            </div>
          </div>
          <div className="rounded-2xl bg-slate-50 px-4 py-3 text-xs font-bold text-slate-500">
            Submitted banners remain pending until staff approval.
          </div>
        </div>

        <div className="mb-5 rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
          <label className="mb-3 block text-xs font-black uppercase tracking-wide text-slate-500">Background Design</label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {FEATURED_BANNER_BACKGROUNDS.map((background) => (
              <button
                key={background.key}
                type="button"
                onClick={() => setBackgroundKey(background.key)}
                className={`overflow-hidden rounded-2xl border p-2 text-left text-xs font-black transition ${
                  backgroundKey === background.key
                    ? "border-pink-500 bg-pink-50 text-pink-700"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                <span className={`relative mb-2 block h-10 overflow-hidden rounded-xl bg-gradient-to-br ${background.bg}`}>
                  <span className="absolute inset-0 opacity-70" style={{ backgroundImage: background.texture }} />
                </span>
                {background.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={rendering || !shopData}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-[0_10px_24px_rgba(15,23,42,0.18)] transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {rendering ? <FaCircleNotch className="animate-spin" /> : <FaWandMagicSparkles />}
            {rendering ? "Generating Banner..." : "Generate Banner"}
          </button>
        </div>

        <div className="rounded-[24px] border border-slate-200 bg-white p-[6px] shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3 px-1">
            <div className="flex items-center gap-2 text-sm font-black text-slate-900">
              <FaPanorama className="text-[#007185]" />
              Preview
            </div>
            <span className={`rounded-full border px-3 py-1 text-[0.7rem] font-black uppercase ${statusClass(status)}`}>
              {statusLabel(status)}
            </span>
          </div>
          <div className="sponsored-product-slider relative aspect-[8/3] w-full overflow-hidden rounded-[18px] bg-white">
            {generatedPreviewUrl ? (
              <img src={generatedPreviewUrl} alt={`${shopData?.name || entityTitle} generated banner`} className="absolute inset-0 block h-full w-full bg-white object-contain object-center" />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center text-slate-400">
                {rendering ? <FaCircleNotch className="mb-3 animate-spin text-3xl text-pink-600" /> : <FaImage className="mb-3 text-4xl" />}
              </div>
            )}
            {rendering ? (
              <div className="absolute inset-0 flex items-center justify-center bg-white/55 backdrop-blur-[1px]">
                <FaCircleNotch className="animate-spin text-3xl text-pink-600" />
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving || rendering || !generatedBlob}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-pink-600 px-5 py-3.5 text-sm font-black text-white shadow-[0_10px_25px_rgba(219,39,119,0.25)] transition hover:bg-pink-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {saving ? <FaCircleNotch className="animate-spin" /> : <FaCloudArrowUp />}
            {saving ? "Submitting for approval..." : `Submit ${selectedBackground.label} Banner for Approval`}
          </button>
        </div>
      </main>

    </div>
  );
}
