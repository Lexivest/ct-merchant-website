import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  FaCircleNotch,
  FaCloudArrowUp,
  FaImage,
  FaPause,
  FaPlay,
  FaTrashCan,
  FaWandMagicSparkles,
} from "react-icons/fa6"
import { supabase } from "../../lib/supabase"
import { canvasToBlobWithMaxBytes } from "../../lib/imagePipeline"
import { getFriendlyErrorMessage } from "../../lib/friendlyErrors"
import { UPLOAD_RULES } from "../../lib/uploadRules"
import { useGlobalFeedback } from "../../components/common/GlobalFeedbackProvider"
import StableImage from "../../components/common/StableImage"
import { SectionHeading, StaffPortalShell, formatDateTime } from "./StaffPortalShared"

let html2canvasPromise = null

function loadHtml2canvas() {
  if (!html2canvasPromise) {
    html2canvasPromise = import("html2canvas").then((module) => module.default)
  }
  return html2canvasPromise
}

const BANNER_RULE = UPLOAD_RULES.featuredCityBanners
const BACKGROUND_OPTIONS = [
  {
    key: "lagoon-blue",
    label: "Lagoon Blue",
    bg: "from-[#043C83] via-[#0969B9] to-[#20B7E8]",
    texture: "radial-gradient(circle_at_15%_20%,rgba(255,255,255,0.38),transparent_22%),radial-gradient(circle_at_82%_12%,rgba(236,72,153,0.3),transparent_20%),linear-gradient(135deg,rgba(255,255,255,0.14)_0_1px,transparent_1px_18px)",
  },
  {
    key: "sunset-coral",
    label: "Sunset Coral",
    bg: "from-[#7C2D12] via-[#EA580C] to-[#F9A8D4]",
    texture: "radial-gradient(circle_at_20%_18%,rgba(255,255,255,0.42),transparent_20%),radial-gradient(circle_at_78%_28%,rgba(254,240,138,0.34),transparent_24%),linear-gradient(45deg,rgba(255,255,255,0.12)_0_2px,transparent_2px_20px)",
  },
  {
    key: "emerald-market",
    label: "Emerald Market",
    bg: "from-[#064E3B] via-[#059669] to-[#A7F3D0]",
    texture: "radial-gradient(circle_at_12%_74%,rgba(255,255,255,0.34),transparent_22%),radial-gradient(circle_at_86%_18%,rgba(190,242,100,0.38),transparent_18%),linear-gradient(120deg,rgba(255,255,255,0.14)_0_1px,transparent_1px_16px)",
  },
  {
    key: "royal-night",
    label: "Royal Night",
    bg: "from-[#111827] via-[#312E81] to-[#DB2777]",
    texture: "radial-gradient(circle_at_18%_16%,rgba(255,255,255,0.22),transparent_18%),radial-gradient(circle_at_78%_70%,rgba(244,114,182,0.42),transparent_24%),linear-gradient(150deg,rgba(255,255,255,0.1)_0_1px,transparent_1px_22px)",
  },
  {
    key: "golden-commerce",
    label: "Golden Commerce",
    bg: "from-[#78350F] via-[#D97706] to-[#FDE68A]",
    texture: "radial-gradient(circle_at_20%_24%,rgba(255,255,255,0.45),transparent_18%),radial-gradient(circle_at_88%_16%,rgba(251,113,133,0.3),transparent_22%),linear-gradient(135deg,rgba(255,255,255,0.16)_0_1px,transparent_1px_14px)",
  },
  {
    key: "berry-silk",
    label: "Berry Silk",
    bg: "from-[#831843] via-[#DB2777] to-[#FBCFE8]",
    texture: "radial-gradient(circle_at_18%_20%,rgba(255,255,255,0.34),transparent_22%),radial-gradient(circle_at_80%_75%,rgba(147,197,253,0.3),transparent_24%),linear-gradient(60deg,rgba(255,255,255,0.16)_0_1px,transparent_1px_18px)",
  },
  {
    key: "indigo-grid",
    label: "Indigo Grid",
    bg: "from-[#1E1B4B] via-[#3730A3] to-[#60A5FA]",
    texture: "linear-gradient(rgba(255,255,255,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.12)_1px,transparent_1px),radial-gradient(circle_at_80%_20%,rgba(236,72,153,0.3),transparent_20%)",
  },
  {
    key: "clean-sky",
    label: "Clean Sky",
    bg: "from-[#0F766E] via-[#22D3EE] to-[#EFF6FF]",
    texture: "radial-gradient(circle_at_22%_22%,rgba(255,255,255,0.48),transparent_20%),radial-gradient(circle_at_78%_68%,rgba(14,165,233,0.28),transparent_26%),linear-gradient(140deg,rgba(255,255,255,0.18)_0_1px,transparent_1px_20px)",
  },
]

function getBackground(key) {
  return BACKGROUND_OPTIONS.find((item) => item.key === key) || BACKGROUND_OPTIONS[0]
}

function FeaturedBannerArtwork({
  shop,
  products,
  backgroundKey,
  exportMode = false,
  variant = "desktop",
}) {
  const background = getBackground(backgroundKey)
  const isMobile = variant === "mobile"
  const shellClass = exportMode
    ? isMobile ? "h-[700px] w-[1200px]" : "h-[600px] w-[1600px]"
    : "aspect-[16/9] w-full sm:aspect-[8/3]"
  const titleClass = exportMode ? (isMobile ? "text-[50px]" : "text-[54px]") : "text-lg sm:text-3xl"
  const addressClass = exportMode ? "text-[24px]" : "text-[10px] sm:text-base"
  const tileClass = exportMode ? (isMobile ? "h-[210px] w-[170px]" : "h-[190px] w-[205px]") : "h-14 w-12 sm:h-24 sm:w-24"
  const ctaClass = exportMode ? "px-12 py-4 text-[24px]" : "px-4 py-1.5 text-[10px] sm:px-6 sm:py-2.5 sm:text-xs"
  const productList = (products || []).filter((product) => product?.image_url).slice(0, 5)
  const productTiles = Array.from({ length: 5 }, (_, index) => productList[index] || null)
  const displayAddress = shop?.address || shop?.category || "Visit this shop for available products and services."

  return (
    <div className={`relative overflow-hidden rounded-[30px] bg-gradient-to-br ${background.bg} text-white shadow-2xl ${shellClass}`}>
      <div className="absolute inset-0 opacity-70" style={{ backgroundImage: background.texture, backgroundSize: "auto, auto, 28px 28px" }} />
      <div className="absolute inset-0 bg-gradient-to-b from-black/18 via-black/4 to-black/24" />
      <div className="absolute -left-[7%] -top-[28%] h-[52%] w-[34%] rounded-full bg-white/22 blur-2xl" />
      <div className="absolute -bottom-[24%] right-[4%] h-[46%] w-[32%] rounded-full bg-pink-300/30 blur-2xl" />

      <div className={`relative z-[2] flex h-full flex-col items-center ${exportMode ? "px-20 py-10" : "px-4 py-3 sm:px-8 sm:py-6"}`}>
        <div className="w-full text-center">
          <div className={`mx-auto flex max-w-[92%] items-end justify-center text-balance font-black leading-[1.02] tracking-tight drop-shadow-lg ${exportMode ? "min-h-[112px]" : "min-h-[42px] sm:min-h-[68px]"} ${titleClass}`}>
            {shop?.name || "Featured Shop"}
          </div>
          <div className={`mx-auto mt-1 line-clamp-2 max-w-[84%] font-bold leading-tight text-white/88 drop-shadow ${addressClass}`}>
            {displayAddress}
          </div>
        </div>

        <div className={`flex flex-1 items-center justify-center gap-2 sm:gap-4 ${exportMode ? "mt-8" : "mt-2 sm:mt-3"}`}>
          {productTiles.map((product, index) => (
            <div
              key={product?.id || `placeholder-${index}`}
              className={`overflow-hidden border border-white/35 bg-white/96 shadow-2xl ring-1 ring-black/5 ${tileClass} ${
                index === 0 || index === 4 ? "rotate-[-3deg] rounded-[26px]" : index === 2 ? "scale-110 rounded-[30px]" : "rotate-[3deg] rounded-[26px]"
              }`}
            >
              {product?.image_url ? (
                <img
                  crossOrigin="anonymous"
                  src={product.image_url}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-slate-100 text-slate-300">
                  <FaImage />
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="flex w-full justify-center">
          <div className={`rounded-full bg-pink-600 font-black uppercase tracking-[0.18em] text-white shadow-[0_18px_45px_rgba(219,39,119,0.4)] ring-4 ring-white/28 ${ctaClass}`}>
            Visit Shop
          </div>
        </div>
      </div>
    </div>
  )
}

export default function StaffFeaturedCityBanners() {
  const { notify, confirm } = useGlobalFeedback()
  const desktopExportRef = useRef(null)
  const mobileExportRef = useRef(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [cities, setCities] = useState([])
  const [shops, setShops] = useState([])
  const [productsByShopId, setProductsByShopId] = useState({})
  const [banners, setBanners] = useState([])
  const [selectedCityId, setSelectedCityId] = useState("")
  const [selectedShopId, setSelectedShopId] = useState("")
  const [backgroundKey, setBackgroundKey] = useState(BACKGROUND_OPTIONS[0].key)
  const [sortOrder, setSortOrder] = useState(0)

  const selectedShop = useMemo(() => shops.find((shop) => String(shop.id) === String(selectedShopId)) || null, [shops, selectedShopId])
  const selectedProducts = selectedShop ? productsByShopId[String(selectedShop.id)] || [] : []

  const loadInitialData = useCallback(async () => {
    setLoading(true)
    try {
      const [citiesResult, bannersResult] = await Promise.all([
        supabase.from("cities").select("id, name, state").order("state").order("name"),
        supabase
          .from("featured_city_banners")
          .select("*, cities(name, state), shops(name, category, address, image_url)")
          .order("created_at", { ascending: false })
          .limit(100),
      ])

      if (citiesResult.error) throw citiesResult.error
      if (bannersResult.error) throw bannersResult.error

      const cityRows = citiesResult.data || []
      setCities(cityRows)
      setBanners(bannersResult.data || [])
      setSelectedCityId((current) => current || (cityRows[0]?.id ? String(cityRows[0].id) : ""))
    } catch (error) {
      notify({
        type: "error",
        title: "Could not load banner studio",
        message: getFriendlyErrorMessage(error, "Could not load city banner tools."),
      })
    } finally {
      setLoading(false)
    }
  }, [notify])

  const loadCityShops = useCallback(async (cityId) => {
    if (!cityId) return

    try {
      const { data: shopRows, error: shopsError } = await supabase
        .from("shops")
        .select("id, name, category, address, image_url, is_open, status, subscription_end_date")
        .eq("city_id", cityId)
        .order("name", { ascending: true })
        .limit(120)

      if (shopsError) throw shopsError

      const safeShops = shopRows || []
      setShops(safeShops)
      setSelectedShopId((current) =>
        current && safeShops.some((shop) => String(shop.id) === String(current))
          ? current
          : safeShops[0]?.id
            ? String(safeShops[0].id)
            : ""
      )

      const shopIds = safeShops.map((shop) => shop.id)
      const productsResult = shopIds.length
        ? await supabase
            .from("products")
            .select("id, shop_id, image_url, is_available")
            .in("shop_id", shopIds)
            .eq("is_available", true)
            .not("image_url", "is", null)
            .order("id", { ascending: true })
            .limit(600)
        : { data: [], error: null }

      if (productsResult.error) throw productsResult.error

      const nextProducts = {}
      ;(productsResult.data || []).forEach((product) => {
        if (!product.shop_id || !product.image_url) return
        const key = String(product.shop_id)
        if (!nextProducts[key]) nextProducts[key] = []
        if (nextProducts[key].length < 5) nextProducts[key].push(product)
      })
      setProductsByShopId(nextProducts)
    } catch (error) {
      notify({
        type: "error",
        title: "Could not load city shops",
        message: getFriendlyErrorMessage(error, "Could not load shops for this city."),
      })
    }
  }, [notify])

  useEffect(() => {
    void loadInitialData()
  }, [loadInitialData])

  useEffect(() => {
    void loadCityShops(selectedCityId)
  }, [loadCityShops, selectedCityId])

  async function waitForAssets(node) {
    if (!node) return
    if (document.fonts?.ready) {
      try {
        await document.fonts.ready
      } catch {
        // continue
      }
    }

    const images = Array.from(node.querySelectorAll("img"))
    await Promise.all(images.map((img) => new Promise((resolve) => {
      if (img.complete && img.naturalWidth > 0) {
        if (typeof img.decode === "function") img.decode().then(resolve).catch(resolve)
        else resolve()
        return
      }
      img.addEventListener("load", resolve, { once: true })
      img.addEventListener("error", resolve, { once: true })
    })))
    await new Promise((resolve) => requestAnimationFrame(() => resolve()))
  }

  async function captureBanner(node) {
    const html2canvas = await loadHtml2canvas()
    await waitForAssets(node)
    const canvas = await html2canvas(node, {
      useCORS: true,
      allowTaint: false,
      backgroundColor: null,
      scale: 1,
      logging: false,
    })
    const blob = await canvasToBlobWithMaxBytes(canvas, {
      maxBytes: BANNER_RULE.maxBytes,
      mimeType: "image/jpeg",
      qualityStart: 0.9,
      qualityFloor: 0.55,
      qualityStep: 0.06,
    })
    if (!blob) throw new Error("Generated banner is too large. Try fewer images or a simpler photo.")
    return blob
  }

  async function publishBanner() {
    if (!selectedCityId || !selectedShop) {
      notify({ type: "error", title: "Select a shop", message: "Choose a city and shop before publishing." })
      return
    }

    try {
      setSaving(true)
      const timestamp = Date.now()
      const basePath = `city-${selectedCityId}/shop-${selectedShop.id}/${timestamp}`
      const [desktopBlob, mobileBlob] = await Promise.all([
        captureBanner(desktopExportRef.current),
        captureBanner(mobileExportRef.current),
      ])
      const desktopPath = `${basePath}-desktop.jpg`
      const mobilePath = `${basePath}-mobile.jpg`

      const [desktopUpload, mobileUpload] = await Promise.all([
        supabase.storage.from(BANNER_RULE.bucket).upload(desktopPath, desktopBlob, {
          contentType: "image/jpeg",
          cacheControl: "31536000",
          upsert: false,
        }),
        supabase.storage.from(BANNER_RULE.bucket).upload(mobilePath, mobileBlob, {
          contentType: "image/jpeg",
          cacheControl: "31536000",
          upsert: false,
        }),
      ])

      if (desktopUpload.error) throw desktopUpload.error
      if (mobileUpload.error) throw mobileUpload.error

      const desktopUrl = supabase.storage.from(BANNER_RULE.bucket).getPublicUrl(desktopPath).data.publicUrl
      const mobileUrl = supabase.storage.from(BANNER_RULE.bucket).getPublicUrl(mobilePath).data.publicUrl

      const { error } = await supabase.from("featured_city_banners").insert({
        city_id: Number(selectedCityId),
        shop_id: Number(selectedShop.id),
        title: selectedShop.name,
        subtitle: selectedShop.address || selectedShop.category || "",
        template_key: backgroundKey,
        desktop_image_path: desktopPath,
        desktop_image_url: desktopUrl,
        mobile_image_path: mobilePath,
        mobile_image_url: mobileUrl,
        status: "published",
        sort_order: Number(sortOrder) || 0,
      })

      if (error) throw error

      notify({
        type: "success",
        title: "Featured banner published",
        message: "The banner is now available in the city marketplace carousel.",
      })
      await loadInitialData()
    } catch (error) {
      notify({
        type: "error",
        title: "Publish failed",
        message: getFriendlyErrorMessage(error, "Could not publish this city banner."),
      })
    } finally {
      setSaving(false)
    }
  }

  async function updateBannerStatus(banner, status) {
    try {
      const { error } = await supabase.from("featured_city_banners").update({ status }).eq("id", banner.id)
      if (error) throw error
      await loadInitialData()
    } catch (error) {
      notify({
        type: "error",
        title: "Update failed",
        message: getFriendlyErrorMessage(error, "Could not update this banner."),
      })
    }
  }

  async function deleteBanner(banner) {
    const approved = await confirm({
      type: "error",
      title: "Delete featured banner?",
      message: "This removes the carousel record and generated images from storage.",
      confirmText: "Delete",
      cancelText: "Keep",
    })
    if (!approved) return

    try {
      const paths = [banner.desktop_image_path, banner.mobile_image_path].filter(Boolean)
      if (paths.length) await supabase.storage.from(BANNER_RULE.bucket).remove(paths)
      const { error } = await supabase.from("featured_city_banners").delete().eq("id", banner.id)
      if (error) throw error
      await loadInitialData()
    } catch (error) {
      notify({
        type: "error",
        title: "Delete failed",
        message: getFriendlyErrorMessage(error, "Could not delete this banner."),
      })
    }
  }

  return (
    <StaffPortalShell
      activeKey="city-banners"
      title="Featured City Banners"
      description="Generate polished marketplace carousel banners that spotlight selected shops in each city."
    >
      <SectionHeading
        eyebrow="Marketplace Feature"
        title="City Featured Shop Carousel"
        description="Choose a city and shop, pick a textured background, then publish a shop-first banner to the market screen."
      />

      {loading ? (
        <div className="rounded-[28px] border border-slate-200 bg-white p-10 text-center shadow-sm">
          <FaCircleNotch className="mx-auto mb-4 animate-spin text-4xl text-pink-600" />
          <p className="font-bold text-slate-600">Loading banner engine...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[400px_1fr]">
          <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="mb-4 text-lg font-black text-slate-950">Banner Controls</h3>
            <label className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-500">City</label>
            <select value={selectedCityId} onChange={(event) => setSelectedCityId(event.target.value)} className="mb-4 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-pink-400">
              {cities.map((city) => <option key={city.id} value={city.id}>{city.name}{city.state ? `, ${city.state}` : ""}</option>)}
            </select>

            <label className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-500">Shop</label>
            <select value={selectedShopId} onChange={(event) => setSelectedShopId(event.target.value)} className="mb-4 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-pink-400">
              {shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.name}</option>)}
            </select>

            <label className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-500">Background</label>
            <div className="mb-4 grid grid-cols-2 gap-2">
              {BACKGROUND_OPTIONS.map((background) => (
                <button
                  key={background.key}
                  type="button"
                  onClick={() => setBackgroundKey(background.key)}
                  className={`overflow-hidden rounded-2xl border p-2 text-left text-xs font-black transition ${
                    backgroundKey === background.key ? "border-pink-500 bg-pink-50 text-pink-700" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <span className={`relative mb-2 block h-10 overflow-hidden rounded-xl bg-gradient-to-br ${background.bg}`}>
                    <span className="absolute inset-0 opacity-70" style={{ backgroundImage: background.texture }} />
                  </span>
                  {background.label}
                </button>
              ))}
            </div>

            <label className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-500">Sort Order</label>
            <input type="number" value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} className="mb-5 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-pink-400" />

            <button type="button" onClick={publishBanner} disabled={saving || !selectedShop} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-pink-600 px-5 py-3.5 text-sm font-black text-white shadow-[0_10px_25px_rgba(219,39,119,0.25)] transition hover:bg-pink-700 disabled:cursor-not-allowed disabled:bg-slate-300">
              {saving ? <FaCircleNotch className="animate-spin" /> : <FaCloudArrowUp />}
              {saving ? "Generating..." : "Generate and Publish"}
            </button>
          </div>

          <div className="space-y-6">
            <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <div className="text-xs font-black uppercase tracking-[0.2em] text-pink-600">Live Preview</div>
                  <h3 className="mt-1 text-xl font-black text-slate-950">Marketplace banner</h3>
                </div>
                <FaWandMagicSparkles className="text-2xl text-pink-600" />
              </div>
              <FeaturedBannerArtwork shop={selectedShop} products={selectedProducts} backgroundKey={backgroundKey} />
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="mb-4 text-lg font-black text-slate-950">Published Banners</h3>
              <div className="space-y-4">
                {banners.length ? banners.map((banner) => (
                  <div key={banner.id} className="grid gap-4 rounded-3xl border border-slate-200 bg-slate-50 p-3 md:grid-cols-[180px_1fr]">
                    <StableImage
                      src={banner.mobile_image_url || banner.desktop_image_url}
                      alt={banner.title}
                      containerClassName="aspect-[16/9] overflow-hidden rounded-2xl bg-white"
                      className="h-full w-full object-cover"
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-3 py-1 text-xs font-black uppercase ${banner.status === "published" ? "bg-emerald-100 text-emerald-700" : banner.status === "paused" ? "bg-amber-100 text-amber-700" : "bg-slate-200 text-slate-600"}`}>
                          {banner.status}
                        </span>
                        <span className="text-xs font-bold text-slate-500">{formatDateTime(banner.created_at)}</span>
                      </div>
                      <div className="mt-2 truncate text-base font-black text-slate-950">{banner.title}</div>
                      <div className="mt-1 text-sm font-semibold text-slate-500">
                        {banner.cities?.name || "City"} • {banner.shops?.name || "Shop"}
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => updateBannerStatus(banner, banner.status === "published" ? "paused" : "published")}
                          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-black text-white"
                        >
                          {banner.status === "published" ? <FaPause /> : <FaPlay />}
                          {banner.status === "published" ? "Pause" : "Publish"}
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteBanner(banner)}
                          className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-xs font-black text-white"
                        >
                          <FaTrashCan /> Delete
                        </button>
                      </div>
                    </div>
                  </div>
                )) : (
                  <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
                    <FaImage className="mx-auto mb-3 text-3xl text-slate-300" />
                    <p className="font-bold text-slate-500">No featured city banners published yet.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="pointer-events-none fixed left-[-10000px] top-0 opacity-0">
        <div ref={desktopExportRef}>
          <FeaturedBannerArtwork shop={selectedShop} products={selectedProducts} backgroundKey={backgroundKey} exportMode variant="desktop" />
        </div>
        <div ref={mobileExportRef}>
          <FeaturedBannerArtwork shop={selectedShop} products={selectedProducts} backgroundKey={backgroundKey} exportMode variant="mobile" />
        </div>
      </div>
    </StaffPortalShell>
  )
}
