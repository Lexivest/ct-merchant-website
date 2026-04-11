import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  FaCircleCheck,
  FaCircleNotch,
  FaCloudArrowUp,
  FaImage,
  FaLocationDot,
  FaPause,
  FaPlay,
  FaTrashCan,
  FaWandMagicSparkles,
} from "react-icons/fa6"
import { supabase } from "../../lib/supabase"
import { canvasToBlobWithMaxBytes, fileToDataUrl } from "../../lib/imagePipeline"
import { getFriendlyErrorMessage } from "../../lib/friendlyErrors"
import { UPLOAD_RULES } from "../../lib/uploadRules"
import { useGlobalFeedback } from "../../components/common/GlobalFeedbackProvider"
import StableImage from "../../components/common/StableImage"
import { SectionHeading, StaffPortalShell, formatDateTime } from "./StaffPortalShared"
import logoImage from "../../assets/images/logo.jpg"

let html2canvasPromise = null

function loadHtml2canvas() {
  if (!html2canvasPromise) {
    html2canvasPromise = import("html2canvas").then((module) => module.default)
  }
  return html2canvasPromise
}

const BANNER_RULE = UPLOAD_RULES.featuredCityBanners
const TEMPLATE_OPTIONS = [
  { key: "lifestyle", label: "Lifestyle Spotlight", bg: "from-[#101827] via-[#2E1065] to-[#BE185D]", accent: "#DB2777" },
  { key: "products", label: "Product Rack", bg: "from-[#0F172A] via-[#1D4ED8] to-[#F97316]", accent: "#F97316" },
  { key: "local", label: "Local Trust", bg: "from-[#052E2B] via-[#065F46] to-[#0EA5E9]", accent: "#10B981" },
]

function getTemplate(key) {
  return TEMPLATE_OPTIONS.find((item) => item.key === key) || TEMPLATE_OPTIONS[0]
}

function formatPrice(value) {
  const amount = Number(value || 0)
  return amount ? `NGN ${amount.toLocaleString()}` : ""
}

function initials(name) {
  return String(name || "CT")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "CT"
}

function FeaturedBannerArtwork({
  shop,
  profile,
  products,
  title,
  subtitle,
  templateKey,
  lifestyleImage,
  exportMode = false,
  variant = "desktop",
}) {
  const template = getTemplate(templateKey)
  const isMobile = variant === "mobile"
  const shellClass = exportMode
    ? isMobile ? "h-[700px] w-[1200px]" : "h-[600px] w-[1600px]"
    : "aspect-[16/9] w-full sm:aspect-[8/3]"
  const titleClass = exportMode ? "text-[72px]" : "text-3xl sm:text-5xl"
  const copyClass = exportMode ? "text-[32px]" : "text-sm sm:text-xl"
  const avatarClass = exportMode ? "h-28 w-28" : "h-16 w-16 sm:h-20 sm:w-20"
  const tileClass = exportMode ? "h-[180px] w-[180px]" : "h-20 w-20 sm:h-32 sm:w-32"
  const productList = (products || []).slice(0, isMobile ? 3 : 4)

  return (
    <div className={`relative overflow-hidden rounded-[30px] bg-gradient-to-br ${template.bg} text-white shadow-2xl ${shellClass}`}>
      <div className="absolute inset-0 opacity-25 [background-image:radial-gradient(circle_at_18%_22%,white_0,transparent_24%),radial-gradient(circle_at_80%_10%,white_0,transparent_18%)]" />
      {lifestyleImage ? (
        <img crossOrigin="anonymous" src={lifestyleImage} alt="" className="absolute inset-y-0 right-0 h-full w-[48%] object-cover opacity-80" />
      ) : (
        <div className="absolute inset-y-0 right-0 w-[50%] overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_34%_30%,rgba(255,255,255,0.5),transparent_25%),radial-gradient(circle_at_70%_62%,rgba(244,114,182,0.55),transparent_28%)]" />
          <div className="absolute bottom-[12%] right-[18%] h-[48%] w-[28%] rotate-6 rounded-[32px] border-[10px] border-slate-950 bg-white shadow-2xl">
            <div className="h-full rounded-[20px] bg-gradient-to-br from-pink-100 via-white to-blue-100 p-4" />
          </div>
          <div className="absolute bottom-[10%] left-[14%] flex h-[34%] w-[34%] items-center justify-center rounded-full bg-gradient-to-br from-pink-200 to-emerald-400 text-xl font-black text-white shadow-2xl">
            CTM
          </div>
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-r from-black/82 via-black/40 to-black/8" />

      <div className={`relative z-[2] flex h-full flex-col justify-between ${exportMode ? "p-16" : "p-5 sm:p-9"}`}>
        <div>
          <div className="mb-5 flex items-center gap-4">
            {profile?.avatar_url || shop?.image_url ? (
              <img crossOrigin="anonymous" src={profile?.avatar_url || shop?.image_url} alt={shop?.name || "Shop"} className={`${avatarClass} rounded-3xl border-4 border-white/20 bg-white object-cover shadow-xl`} />
            ) : (
              <div className={`${avatarClass} flex items-center justify-center rounded-3xl border-4 border-white/20 bg-white/15 text-3xl font-black shadow-xl`}>
                {initials(shop?.name)}
              </div>
            )}
            <div>
              <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-pink-100 sm:text-sm">
                <img src={logoImage} alt="" className="h-5 w-5 rounded bg-white object-cover" />
                CTMerchant Featured
              </div>
              {shop?.is_verified ? (
                <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-500 px-3 py-1 text-xs font-black uppercase tracking-wide text-white">
                  <FaCircleCheck /> Verified Shop
                </div>
              ) : null}
            </div>
          </div>

          <div className={`max-w-[58%] font-black leading-[0.98] tracking-tight ${titleClass}`}>
            {title || shop?.name || "Featured Shop"}
          </div>
          <div className={`mt-4 max-w-[56%] font-bold leading-snug text-white/86 ${copyClass}`}>
            {subtitle || shop?.address || "Discover selected products and trusted service near you."}
          </div>
          {shop?.address ? (
            <div className="mt-5 flex max-w-[54%] items-center gap-2 text-xs font-black uppercase tracking-wide text-pink-100 sm:text-sm">
              <FaLocationDot className="shrink-0" />
              <span className="line-clamp-1">{shop.address}</span>
            </div>
          ) : null}
        </div>

        <div className="flex items-end justify-between gap-6">
          <div className="flex gap-3">
            {productList.map((product, index) => (
              <div key={product.id || index} className={`overflow-hidden rounded-3xl border border-white/15 bg-white p-2 text-slate-950 shadow-xl ${tileClass}`}>
                {product.image_url ? (
                  <img crossOrigin="anonymous" src={product.image_url} alt={product.name || "Product"} className="h-[72%] w-full object-contain" />
                ) : (
                  <div className="flex h-[72%] items-center justify-center rounded-2xl bg-slate-100 text-slate-300"><FaImage /></div>
                )}
                <div className="mt-1 truncate text-center text-[10px] font-black sm:text-xs">{product.name || "Product"}</div>
                <div className="truncate text-center text-[10px] font-black text-pink-600 sm:text-xs">{formatPrice(product.discount_price || product.price)}</div>
              </div>
            ))}
          </div>
          <div className="rounded-full px-5 py-3 text-sm font-black uppercase tracking-wide text-white shadow-xl" style={{ backgroundColor: template.accent }}>
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
  const [profilesById, setProfilesById] = useState({})
  const [banners, setBanners] = useState([])
  const [selectedCityId, setSelectedCityId] = useState("")
  const [selectedShopId, setSelectedShopId] = useState("")
  const [templateKey, setTemplateKey] = useState("lifestyle")
  const [lifestyleImage, setLifestyleImage] = useState("")
  const [title, setTitle] = useState("")
  const [subtitle, setSubtitle] = useState("")
  const [sortOrder, setSortOrder] = useState(0)

  const selectedShop = useMemo(() => shops.find((shop) => String(shop.id) === String(selectedShopId)) || null, [shops, selectedShopId])
  const selectedProfile = selectedShop?.owner_id ? profilesById[selectedShop.owner_id] || null : null
  const selectedProducts = selectedShop ? productsByShopId[String(selectedShop.id)] || [] : []

  const loadInitialData = useCallback(async () => {
    setLoading(true)
    try {
      const [citiesResult, bannersResult] = await Promise.all([
        supabase.from("cities").select("id, name, state").order("state").order("name"),
        supabase
          .from("featured_city_banners")
          .select("*, cities(name, state), shops(name, category, address, image_url, is_verified)")
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
        .select("id, owner_id, name, category, address, image_url, is_verified, is_open, status, subscription_end_date")
        .eq("city_id", cityId)
        .order("is_verified", { ascending: false })
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
      const ownerIds = Array.from(new Set(safeShops.map((shop) => shop.owner_id).filter(Boolean)))
      const [productsResult, profilesResult] = await Promise.all([
        shopIds.length
          ? supabase
              .from("products")
              .select("id, shop_id, name, price, discount_price, image_url, condition, is_available")
              .in("shop_id", shopIds)
              .eq("is_available", true)
              .order("id", { ascending: true })
              .limit(360)
          : Promise.resolve({ data: [], error: null }),
        ownerIds.length
          ? supabase.rpc("get_public_profiles", { profile_ids: ownerIds })
          : Promise.resolve({ data: [], error: null }),
      ])

      if (productsResult.error) throw productsResult.error

      const nextProducts = {}
      ;(productsResult.data || []).forEach((product) => {
        if (!product.shop_id || !product.image_url) return
        const key = String(product.shop_id)
        if (!nextProducts[key]) nextProducts[key] = []
        if (nextProducts[key].length < 4) nextProducts[key].push(product)
      })
      setProductsByShopId(nextProducts)

      const nextProfiles = {}
      ;(profilesResult.data || []).forEach((profile) => {
        nextProfiles[profile.id] = profile
      })
      setProfilesById(nextProfiles)
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

  useEffect(() => {
    if (!selectedShop) return
    setTitle(selectedShop.name || "")
    setSubtitle(selectedShop.address || "")
  }, [selectedShop])

  async function handleLifestyleFile(file) {
    if (!file) return
    try {
      if (!file.type.startsWith("image/")) throw new Error("Please select an image file.")
      setLifestyleImage(await fileToDataUrl(file))
    } catch (error) {
      notify({
        type: "error",
        title: "Photo unavailable",
        message: getFriendlyErrorMessage(error, "Could not open the selected lifestyle photo."),
      })
    }
  }

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
        title: title.trim() || selectedShop.name,
        subtitle: subtitle.trim() || selectedShop.address || selectedShop.category || "",
        template_key: templateKey,
        lifestyle_asset_key: lifestyleImage ? "custom-upload" : "built-in-graphic",
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
        description="Choose a city and shop, compose a CTM-branded banner, then publish it to the market screen."
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
              {shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.name} {shop.is_verified ? "(verified)" : ""}</option>)}
            </select>

            <label className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-500">Template</label>
            <div className="mb-4 grid grid-cols-1 gap-2">
              {TEMPLATE_OPTIONS.map((template) => (
                <button key={template.key} type="button" onClick={() => setTemplateKey(template.key)} className={`rounded-2xl border px-4 py-3 text-left text-sm font-black transition ${templateKey === template.key ? "border-pink-500 bg-pink-50 text-pink-700" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}>
                  {template.label}
                </button>
              ))}
            </div>

            <label className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-500">Custom Lifestyle Photo</label>
            <input type="file" accept="image/*" onChange={(event) => void handleLifestyleFile(event.target.files?.[0])} className="mb-4 block w-full rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-600" />

            <label className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-500">Title</label>
            <input value={title} onChange={(event) => setTitle(event.target.value)} className="mb-4 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-pink-400" />

            <label className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-500">Subtitle</label>
            <textarea value={subtitle} onChange={(event) => setSubtitle(event.target.value)} rows={3} className="mb-4 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-pink-400" />

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
              <FeaturedBannerArtwork shop={selectedShop} profile={selectedProfile} products={selectedProducts} title={title} subtitle={subtitle} templateKey={templateKey} lifestyleImage={lifestyleImage} />
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
          <FeaturedBannerArtwork shop={selectedShop} profile={selectedProfile} products={selectedProducts} title={title} subtitle={subtitle} templateKey={templateKey} lifestyleImage={lifestyleImage} exportMode variant="desktop" />
        </div>
        <div ref={mobileExportRef}>
          <FeaturedBannerArtwork shop={selectedShop} profile={selectedProfile} products={selectedProducts} title={title} subtitle={subtitle} templateKey={templateKey} lifestyleImage={lifestyleImage} exportMode variant="mobile" />
        </div>
      </div>
    </StaffPortalShell>
  )
}
