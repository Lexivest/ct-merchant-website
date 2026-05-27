import { useCallback, useEffect, useRef, useState } from "react"
import { useLocation } from "react-router-dom"
import {
  FaArrowRight,
  FaBolt,
  FaCircleNotch,
  FaImage,
  FaPause,
  FaPlay,
  FaPlus,
  FaTrashCan,
  FaMagnifyingGlass,
  FaXmark,
  FaUpload,
  FaTriangleExclamation,
  FaCheck,
  FaDownload,
  FaRightLong,
} from "react-icons/fa6"
import { supabase } from "../../lib/supabase"
import { getFriendlyErrorMessage } from "../../lib/friendlyErrors"
import { useGlobalFeedback } from "../../components/common/GlobalFeedbackProvider"
import { SectionHeading, StaffPortalShell, useStaffPortalSession } from "./StaffPortalShared"
import StableImage from "../../components/common/StableImage"
import { clearCachedFetchStore } from "../../hooks/useCachedFetch"
import {
  UPLOAD_RULES,
  getAcceptValue,
  getRuleLabel,
  sanitizeStoragePathSegment,
} from "../../lib/uploadRules"

// ── Constants ─────────────────────────────────────────────────────────────────

const DISPLAY_RULE = UPLOAD_RULES.sponsoredDisplayImages
const ACCEPT_VALUE = getAcceptValue(DISPLAY_RULE)
const RULE_LABEL   = getRuleLabel(DISPLAY_RULE)

// ── Helpers ───────────────────────────────────────────────────────────────────

function invalidateMarketplaceDashboardCaches() {
  clearCachedFetchStore(
    (key) =>
      key.startsWith("dashboard_cache_") ||
      key.startsWith("dashboard_base_") ||
      key.startsWith("dashboard_dynamic_"),
  )
}

/**
 * Upload one display image to the sponsored-display-images bucket.
 * Returns the public URL string on success, throws on failure.
 */
async function uploadDisplayImage(file, sponsorId, slot) {
  if (file.size > DISPLAY_RULE.maxBytes) {
    throw new Error(`Image exceeds ${RULE_LABEL}`)
  }
  if (!DISPLAY_RULE.allowedMime.includes(file.type)) {
    throw new Error("Only JPG, PNG or WEBP images are allowed.")
  }

  const ext  = file.name.split(".").pop().toLowerCase() || "jpg"
  const safeId = sanitizeStoragePathSegment(String(sponsorId), "unknown")
  const path = `${safeId}/${slot}_${Date.now()}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from(DISPLAY_RULE.bucket)
    .upload(path, file, { contentType: file.type, cacheControl: "31536000", upsert: false })

  if (uploadError) throw uploadError

  const { data } = supabase.storage.from(DISPLAY_RULE.bucket).getPublicUrl(path)
  return data.publicUrl
}

/**
 * Delete a display image from storage given its public URL.
 * Throws on real errors so callers know a delete failed and can abort
 * the parent operation (preventing orphaned DB rows pointing at ghost files).
 * Silently ignores "Object not found" — file was already gone.
 */
async function deleteDisplayImageByUrl(publicUrl) {
  if (!publicUrl) return
  const marker = `/object/public/${DISPLAY_RULE.bucket}/`
  const idx = publicUrl.indexOf(marker)
  if (idx === -1) return
  const storagePath = publicUrl.slice(idx + marker.length).split("?")[0]
  const { error } = await supabase.storage.from(DISPLAY_RULE.bucket).remove([storagePath])
  if (error && !error.message?.toLowerCase().includes("not found")) throw error
}

/**
 * Fetch a remote image URL as a File object so it can be fed into the
 * normal upload flow and land in the sponsored-display-images bucket
 * with a brand-new URL — completely separate from the source URL.
 */
async function fetchImageAsFile(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Could not fetch image (HTTP ${response.status})`)
  const blob = await response.blob()
  const ext =
    blob.type === "image/png"  ? "png"  :
    blob.type === "image/webp" ? "webp" : "jpg"
  return new File([blob], `product-img.${ext}`, { type: blob.type || "image/jpeg" })
}

// ── ImageSlotPicker ────────────────────────────────────────────────────────────

/**
 * One image upload slot (primary / secondary / tertiary).
 * Shows a preview when a file is chosen or an existing URL is provided.
 */
function ImageSlotPicker({ label, file, existingUrl, onFileChange, onClear, required }) {
  const inputRef = useRef(null)
  const previewUrl = file ? URL.createObjectURL(file) : existingUrl || null

  return (
    <div className="flex flex-col items-center gap-2">
      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
        {label}{required ? <span className="text-rose-500 ml-0.5">*</span> : ""}
      </span>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 transition hover:border-pink-400 hover:bg-pink-50"
      >
        {previewUrl ? (
          <img
            src={previewUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <FaUpload className="text-xl text-slate-300" />
        )}
        {previewUrl && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition hover:bg-black/30">
            <FaUpload className="text-white opacity-0 transition hover:opacity-100 text-lg" />
          </div>
        )}
      </button>
      {previewUrl ? (
        <button
          type="button"
          onClick={onClear}
          className="flex items-center gap-1 text-[10px] font-bold text-rose-500 hover:text-rose-700"
        >
          <FaXmark className="text-[9px]" /> Remove
        </button>
      ) : (
        <span className="text-[10px] text-slate-400">{RULE_LABEL}</span>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_VALUE}
        className="hidden"
        onChange={(e) => {
          const picked = e.target.files?.[0]
          if (picked) onFileChange(picked)
          e.target.value = ""
        }}
      />
    </div>
  )
}

// ── ProductImageStrip ──────────────────────────────────────────────────────────

/**
 * Shows a product's own images (image_url, image_url_2, image_url_3) with:
 *  • A download link (opens the raw URL in a new tab for manual save)
 *  • A "→ Copy to slot N" button that fetches the image and places it into the
 *    corresponding display slot automatically — no manual download/re-upload needed.
 *
 * The copy operation re-uploads to the sponsored-display-images bucket, so the
 * resulting URL is always new and never collides with the product's own URL.
 */
function ProductImageStrip({ product, onCopyToSlot, disabledSlots = [] }) {
  const [copyingSlot, setCopyingSlot] = useState(null)
  const [copyError,   setCopyError]   = useState(null)

  const images = [
    product?.image_url,
    product?.image_url_2,
    product?.image_url_3,
  ].filter(Boolean)

  if (!images.length) return null

  async function handleCopy(url, slot) {
    setCopyingSlot(slot)
    setCopyError(null)
    try {
      const file = await fetchImageAsFile(url)
      onCopyToSlot(file, slot)
    } catch (err) {
      setCopyError(`Slot ${slot}: ${err.message}`)
    } finally {
      setCopyingSlot(null)
    }
  }

  return (
    <div className="rounded-2xl border border-blue-100 bg-blue-50 p-3">
      <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-blue-600">
        Product&apos;s existing images — copy or download
      </p>
      <div className="flex flex-wrap gap-3">
        {images.map((url, idx) => {
          const slot = idx + 1
          const isBusy = copyingSlot === slot
          const isDisabled = disabledSlots.includes(slot)

          return (
            <div key={idx} className="flex flex-col items-center gap-1.5">
              {/* Thumbnail */}
              <div className="relative h-16 w-16 overflow-hidden rounded-xl bg-slate-100 shadow-sm">
                <img src={url} alt="" className="h-full w-full object-cover" />
                {isDisabled && (
                  <div className="absolute inset-0 flex items-center justify-center bg-emerald-500/70">
                    <FaCheck className="text-white" />
                  </div>
                )}
              </div>

              {/* Copy button */}
              <button
                type="button"
                onClick={() => handleCopy(url, slot)}
                disabled={isBusy || isDisabled}
                title={isDisabled ? "Already in slot" : `Copy to display slot ${slot}`}
                className="flex items-center gap-1 rounded-lg bg-blue-600 px-2 py-1 text-[9px] font-black text-white shadow transition hover:bg-blue-700 disabled:bg-slate-300"
              >
                {isBusy
                  ? <FaCircleNotch className="animate-spin text-[8px]" />
                  : <FaRightLong className="text-[8px]" />
                }
                {isDisabled ? "Copied" : `Slot ${slot}`}
              </button>

              {/* Download link */}
              <a
                href={url}
                download
                target="_blank"
                rel="noreferrer"
                title="Download this image"
                className="flex items-center gap-1 text-[9px] font-bold text-slate-500 hover:text-blue-600"
              >
                <FaDownload className="text-[8px]" /> Download
              </a>
            </div>
          )
        })}
      </div>
      {copyError && (
        <p className="mt-2 text-[10px] font-bold text-rose-600">{copyError}</p>
      )}
      <p className="mt-2 text-[9px] font-semibold text-blue-500">
        "Copy to Slot" re-uploads the image to the dedicated display bucket — a brand-new URL is created, separate from the product&apos;s own image.
      </p>
    </div>
  )
}

// ── SponsoredProductPreview ────────────────────────────────────────────────────

function SponsoredProductPreview({ product, displayImages }) {
  const [imgIndex, setImgIndex] = useState(0)
  const images = displayImages?.length ? displayImages : []

  useEffect(() => {
    if (images.length <= 1) return
    const interval = setInterval(() => {
      setImgIndex((prev) => (prev + 1) % images.length)
    }, 3000)
    return () => clearInterval(interval)
  }, [images.length])

  if (!product) {
    return (
      <div className="flex h-40 flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-200 bg-slate-50 text-slate-400">
        <FaImage className="mb-2 text-2xl" />
        <p className="text-xs font-bold">Select a product to preview</p>
      </div>
    )
  }

  const activeImageIndex = images.length ? imgIndex % images.length : 0

  return (
    <div className="group relative overflow-hidden rounded-[28px] bg-white shadow-xl border border-slate-100 flex flex-col p-4 w-[180px] md:w-[210px] mx-auto">
      <div className="absolute top-3 left-3 z-10">
        <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-pink-600 text-white text-[9px] font-black uppercase tracking-tighter shadow-xl">
          <FaBolt className="text-[8px] animate-pulse" /> Sponsored
        </span>
      </div>

      <div className="relative aspect-square w-full rounded-[20px] overflow-hidden bg-slate-50 mb-4">
        {images.length > 0 ? (
          images.map((img, idx) => (
            <div
              key={`${img}-${idx}`}
              className={`absolute inset-0 transition-all duration-1000 ease-in-out ${idx === activeImageIndex ? "opacity-100 scale-100" : "opacity-0 scale-110 pointer-events-none"}`}
            >
              <img src={img} alt={product.name} className="h-full w-full object-cover" />
            </div>
          ))
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-slate-300">
            <FaImage className="text-3xl" />
            <span className="text-[10px] font-bold">Upload display images</span>
          </div>
        )}

        {images.length > 1 && (
          <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1 z-10">
            {images.map((_, idx) => (
              <div key={idx} className={`h-1 rounded-full transition-all duration-500 ${idx === activeImageIndex ? "w-4 bg-white shadow-sm" : "w-1 bg-white/40"}`} />
            ))}
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <div className="text-xs md:text-sm font-black text-slate-900 truncate leading-tight">{product.name}</div>
        <div className="text-xs font-black text-pink-600">₦{Number(product.price).toLocaleString()}</div>
        <div className="pt-2 border-t border-slate-50 flex items-center justify-between mt-1">
          <span className="text-[9px] md:text-[10px] font-black text-yellow-400 uppercase tracking-tight truncate max-w-[70%]">{product.shops?.name}</span>
          <FaArrowRight className="text-[9px] text-slate-300" />
        </div>
      </div>
    </div>
  )
}

// ── BannerCard ─────────────────────────────────────────────────────────────────

/**
 * One existing sponsorship row. Shows a warning if display images are missing
 * (i.e. the record predates the new pipeline) so staff knows to update it.
 */
function BannerCard({ banner, onUpdateStatus, onDelete, onUploadImages }) {
  const missingImages = !banner.display_image_url

  return (
    <div className="group relative rounded-3xl border border-slate-100 bg-slate-50 p-4 transition hover:bg-white hover:shadow-md">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`rounded-full px-2 py-0.5 text-[8px] font-black uppercase ${banner.status === "published" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
              {banner.status}
            </span>
            <span className="truncate text-[8px] font-bold text-slate-400">
              {banner.cities?.name || "Global"}
            </span>
            {missingImages && (
              <span className="flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[8px] font-black text-rose-600">
                <FaTriangleExclamation className="text-[7px]" /> No display images
              </span>
            )}
          </div>
          {banner.product && (
            <div className="truncate text-[10px] font-bold text-slate-600">{banner.product.name}</div>
          )}
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            onClick={() => onUpdateStatus(banner, banner.status === "published" ? "paused" : "published")}
            className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-slate-600 shadow-sm hover:text-pink-600"
          >
            {banner.status === "published" ? <FaPause className="text-[10px]" /> : <FaPlay className="text-[10px]" />}
          </button>
          <button
            onClick={() => onDelete(banner)}
            className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-rose-600 shadow-sm hover:bg-rose-50"
          >
            <FaTrashCan className="text-[10px]" />
          </button>
        </div>
      </div>

      {/* Display image thumbnails */}
      <div className="mb-3 flex gap-2">
        {[banner.display_image_url, banner.display_image_url_2, banner.display_image_url_3]
          .map((url, idx) =>
            url ? (
              <div key={idx} className="h-14 w-14 overflow-hidden rounded-xl bg-slate-100">
                <img src={url} alt="" className="h-full w-full object-cover" />
              </div>
            ) : null
          )
          .filter(Boolean)}
        {missingImages && (
          <div className="flex h-14 w-14 items-center justify-center rounded-xl border-2 border-dashed border-rose-200 bg-rose-50 text-rose-300">
            <FaImage className="text-lg" />
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => onUploadImages(banner)}
        className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white py-2 text-[10px] font-black text-slate-600 shadow-sm transition hover:border-pink-300 hover:text-pink-600"
      >
        <FaUpload className="text-[9px]" />
        {missingImages ? "Upload display images (required)" : "Update display images"}
      </button>
    </div>
  )
}

// ── ImageUploadModal ───────────────────────────────────────────────────────────

/**
 * Modal for uploading / replacing the 1–3 display images on an existing banner.
 */
function ImageUploadModal({ banner, onClose, onSaved }) {
  const { notify } = useGlobalFeedback()
  const [saving, setSaving] = useState(false)
  const [file1, setFile1] = useState(null)
  const [file2, setFile2] = useState(null)
  const [file3, setFile3] = useState(null)

  // Track whether the existing URLs are being kept or cleared
  const [keep1, setKeep1] = useState(Boolean(banner.display_image_url))
  const [keep2, setKeep2] = useState(Boolean(banner.display_image_url_2))
  const [keep3, setKeep3] = useState(Boolean(banner.display_image_url_3))

  async function handleSave() {
    if (!file1 && !keep1) {
      notify({ type: "error", title: "Primary image required", message: "Please upload at least one display image." })
      return
    }

    setSaving(true)
    try {
      let url1 = keep1 ? banner.display_image_url : null
      let url2 = keep2 ? banner.display_image_url_2 : null
      let url3 = keep3 ? banner.display_image_url_3 : null

      // Delete stale storage objects for slots being replaced
      if (!keep1 && banner.display_image_url)   await deleteDisplayImageByUrl(banner.display_image_url)
      if (!keep2 && banner.display_image_url_2) await deleteDisplayImageByUrl(banner.display_image_url_2)
      if (!keep3 && banner.display_image_url_3) await deleteDisplayImageByUrl(banner.display_image_url_3)

      if (file1) url1 = await uploadDisplayImage(file1, banner.id, "img1")
      if (file2) url2 = await uploadDisplayImage(file2, banner.id, "img2")
      if (file3) url3 = await uploadDisplayImage(file3, banner.id, "img3")

      const { error } = await supabase
        .from("sponsored_products")
        .update({
          display_image_url:   url1,
          display_image_url_2: url2,
          display_image_url_3: url3,
        })
        .eq("id", banner.id)

      if (error) throw error

      invalidateMarketplaceDashboardCaches()
      notify({ type: "success", title: "Display images saved", message: "The sponsored card will now use the new images." })
      onSaved()
    } catch (err) {
      notify({ type: "error", title: "Upload failed", message: getFriendlyErrorMessage(err) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[900] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg overflow-hidden rounded-[32px] border border-slate-100 bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-6 py-4">
          <div>
            <h3 className="text-lg font-black text-slate-900">Display Images</h3>
            <p className="text-xs font-semibold text-slate-500">
              These images appear in the sponsored card carousel. They are <strong>completely separate</strong> from the product's shop images.
            </p>
          </div>
          <button type="button" onClick={onClose} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200">
            <FaXmark />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-6 py-6 space-y-5">
          {/* Product image quick-copy strip */}
          {banner.product && (
            <ProductImageStrip
              product={banner.product}
              onCopyToSlot={(file, slot) => {
                if (slot === 1) { setFile1(file); setKeep1(false) }
                if (slot === 2) { setFile2(file); setKeep2(false) }
                if (slot === 3) { setFile3(file); setKeep3(false) }
              }}
              disabledSlots={[
                (file1 || (keep1 && banner.display_image_url))   ? 1 : null,
                (file2 || (keep2 && banner.display_image_url_2)) ? 2 : null,
                (file3 || (keep3 && banner.display_image_url_3)) ? 3 : null,
              ].filter(Boolean)}
            />
          )}

          <div className="flex items-start justify-around gap-4">
            <ImageSlotPicker
              label="Primary"
              file={file1}
              existingUrl={keep1 ? banner.display_image_url : null}
              onFileChange={(f) => { setFile1(f); setKeep1(false) }}
              onClear={() => { setFile1(null); setKeep1(false) }}
              required
            />
            <ImageSlotPicker
              label="2nd (optional)"
              file={file2}
              existingUrl={keep2 ? banner.display_image_url_2 : null}
              onFileChange={(f) => { setFile2(f); setKeep2(false) }}
              onClear={() => { setFile2(null); setKeep2(false) }}
            />
            <ImageSlotPicker
              label="3rd (optional)"
              file={file3}
              existingUrl={keep3 ? banner.display_image_url_3 : null}
              onFileChange={(f) => { setFile3(f); setKeep3(false) }}
              onClear={() => { setFile3(null); setKeep3(false) }}
            />
          </div>

          <p className="rounded-2xl bg-blue-50 px-4 py-3 text-[11px] font-semibold leading-relaxed text-blue-700">
            <strong>Important:</strong> A sponsored product only appears in the marketplace once the primary display image is uploaded. Until then the card is hidden from all users.
          </p>
        </div>

        <div className="flex gap-3 border-t border-slate-100 px-6 py-4">
          <button type="button" onClick={onClose} className="flex-1 rounded-2xl border border-slate-200 py-3 text-sm font-black text-slate-600 transition hover:bg-slate-50">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-pink-600 py-3 text-sm font-black text-white shadow-lg shadow-pink-200 transition hover:bg-pink-700 disabled:bg-slate-300"
          >
            {saving ? <FaCircleNotch className="animate-spin" /> : <FaCheck />}
            {saving ? "Saving…" : "Save images"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function StaffSponsoredProducts() {
  const location = useLocation()
  const { isSuperAdmin, staffCityId, fetchingStaff } = useStaffPortalSession()
  const prefetchedData =
    location.state?.prefetchedData?.kind === "staff-sponsored-products"
      ? location.state.prefetchedData
      : null
  const { notify, confirm } = useGlobalFeedback()

  const [loading,          setLoading]          = useState(() => !prefetchedData && !fetchingStaff)
  const [saving,           setSaving]           = useState(false)
  const [fetchingProducts, setFetchingProducts] = useState(false)
  const [uploadModalBanner, setUploadModalBanner] = useState(null)

  const [cities,            setCities]            = useState(() => prefetchedData?.cities || prefetchedData?.cityOptions || [])
  const [banners,           setBanners]           = useState(() => prefetchedData?.banners || [])
  const [availableProducts, setAvailableProducts] = useState(() => prefetchedData?.availableProducts || [])

  const [selectedCityId, setSelectedCityId] = useState(() =>
    prefetchedData?.selectedCityId ?? (isSuperAdmin ? "" : (staffCityId || ""))
  )
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [searchQuery,     setSearchQuery]     = useState("")
  const [sortOrder,       setSortOrder]       = useState(0)

  // New-sponsorship display image slots (pending before insert)
  const [newImg1, setNewImg1] = useState(null)
  const [newImg2, setNewImg2] = useState(null)
  const [newImg3, setNewImg3] = useState(null)

  const [prefetchedInitialReady,  setPrefetchedInitialReady]  = useState(() => Boolean(prefetchedData))
  const [prefetchedProductsReady, setPrefetchedProductsReady] = useState(() => Boolean(prefetchedData?.availableProducts))

  // ── Data loading ────────────────────────────────────────────────────────────

  const loadInitialData = useCallback(async () => {
    if (prefetchedInitialReady && prefetchedData) {
      setCities(prefetchedData.cities || prefetchedData.cityOptions || [])
      setBanners(prefetchedData.banners || [])
      setLoading(false)
      setPrefetchedInitialReady(false)
      return
    }

    if (!fetchingStaff && !staffCityId && !isSuperAdmin) return

    setLoading(true)
    try {
      let bannersQuery = supabase
        .from("sponsored_products")
        .select(`*, cities(name), shops(name)`)

      if (!isSuperAdmin && staffCityId) {
        bannersQuery = bannersQuery.eq("city_id", staffCityId)
      }

      const [citiesResult, bannersResult] = await Promise.all([
        supabase.from("cities").select("id, name, state").order("name"),
        bannersQuery.order("sort_order", { ascending: true }).order("created_at", { ascending: false }),
      ])

      if (citiesResult.error) throw citiesResult.error
      if (bannersResult.error) throw bannersResult.error

      // Enrich banners with product details
      const enrichedBanners = await Promise.all(
        (bannersResult.data || []).map(async (b) => {
          if (!b.template_key) return b
          const { data: p } = await supabase
            .from("products")
            .select("id, name, price, image_url, image_url_2, image_url_3, shops(name, is_service, category)")
            .eq("id", b.template_key)
            .single()
          return { ...b, product: p }
        })
      )

      setCities(citiesResult.data || [])
      setBanners(enrichedBanners)
    } catch (error) {
      notify({ type: "error", title: "Load failed", message: getFriendlyErrorMessage(error) })
    } finally {
      setLoading(false)
    }
  }, [notify, isSuperAdmin, prefetchedData, prefetchedInitialReady, staffCityId, fetchingStaff])

  const loadProducts = useCallback(async () => {
    if (fetchingStaff) return

    if (
      prefetchedProductsReady &&
      prefetchedData &&
      !searchQuery.trim() &&
      String(selectedCityId || "") === String(prefetchedData.selectedCityId || "")
    ) {
      setAvailableProducts(prefetchedData.availableProducts || [])
      setFetchingProducts(false)
      setPrefetchedProductsReady(false)
      return
    }

    const cityToUse = isSuperAdmin ? selectedCityId : staffCityId
    if (!cityToUse && !isSuperAdmin) return

    setFetchingProducts(true)
    try {
      let query = supabase
        .from("products")
        .select(`
          id,
          name,
          price,
          image_url,
          image_url_2,
          image_url_3,
          shop_id,
          is_approved,
          shops!inner(id, name, status, city_id, is_service, category)
        `)
        .eq("shops.status", "approved")
        .eq("is_available", true)
        .eq("is_approved", true)
        .order("created_at", { ascending: false })
        .limit(50)

      if (cityToUse) {
        query = query.eq("shops.city_id", cityToUse)
      }

      if (searchQuery.trim()) {
        query = query.ilike("name", `%${searchQuery}%`)
      }

      const { data, error } = await query
      if (error) throw error
      setAvailableProducts(data || [])
    } catch (error) {
      console.error("Failed to load products", error)
    } finally {
      setFetchingProducts(false)
    }
  }, [selectedCityId, staffCityId, isSuperAdmin, searchQuery, fetchingStaff, prefetchedData, prefetchedProductsReady])

  useEffect(() => {
    if (!fetchingStaff) loadInitialData()
  }, [loadInitialData, fetchingStaff])

  useEffect(() => {
    if (!fetchingStaff) {
      const timer = setTimeout(() => loadProducts(), 300)
      return () => clearTimeout(timer)
    }
  }, [loadProducts, fetchingStaff])

  // ── Actions ─────────────────────────────────────────────────────────────────

  async function handlePublish() {
    if (!selectedProduct) {
      notify({ type: "error", title: "Validation error", message: "Please select a product first." })
      return
    }
    if (!newImg1) {
      notify({ type: "error", title: "Display image required", message: "Upload at least one display image before sponsoring." })
      return
    }

    const resolvedCityId = Number(
      selectedCityId || selectedProduct?.shops?.city_id || staffCityId || 0
    )

    if (!Number.isFinite(resolvedCityId) || resolvedCityId <= 0) {
      notify({ type: "error", title: "City required", message: "Please select a city before sponsoring a product." })
      return
    }

    setSaving(true)
    // Track the inserted row ID so we can roll it back if anything after the
    // insert fails (upload error, DB update error, etc.)
    let sponsorId = null
    try {
      // 1. Insert the record first to get the real ID for the storage path
      const { data: inserted, error: insertError } = await supabase
        .from("sponsored_products")
        .insert({
          city_id:      resolvedCityId,
          shop_id:      selectedProduct.shop_id,
          title:        selectedProduct.name,
          subtitle:     `Sponsored from ${selectedProduct.shops.name}`,
          template_key: String(selectedProduct.id),
          layout:       "product",
          sort_order:   Number(sortOrder) || 0,
          status:       "paused", // hidden until images are attached
        })
        .select("id")
        .single()

      if (insertError) throw insertError

      sponsorId = inserted.id

      // 2. Upload display images (separate bucket — never shares URLs with products)
      const [url1, url2, url3] = await Promise.all([
        uploadDisplayImage(newImg1, sponsorId, "img1"),
        newImg2 ? uploadDisplayImage(newImg2, sponsorId, "img2") : Promise.resolve(null),
        newImg3 ? uploadDisplayImage(newImg3, sponsorId, "img3") : Promise.resolve(null),
      ])

      // 3. Attach images and publish in one update
      const { error: updateError } = await supabase
        .from("sponsored_products")
        .update({
          display_image_url:   url1,
          display_image_url_2: url2,
          display_image_url_3: url3,
          status:              "published",
        })
        .eq("id", sponsorId)

      if (updateError) throw updateError

      // Success — clear tracking so the catch block won't roll back
      sponsorId = null

      invalidateMarketplaceDashboardCaches()

      notify({ type: "success", title: "Product Sponsored", message: "The product is now featured in the marketplace." })
      setSelectedProduct(null)
      setNewImg1(null)
      setNewImg2(null)
      setNewImg3(null)
      await loadInitialData()
    } catch (error) {
      // Roll back the inserted row so it doesn't linger as a paused ghost card
      if (sponsorId) {
        await supabase.from("sponsored_products").delete().eq("id", sponsorId).catch(() => null)
      }
      notify({ type: "error", title: "Action failed", message: getFriendlyErrorMessage(error) })
    } finally {
      setSaving(false)
    }
  }

  async function updateStatus(banner, status) {
    try {
      const { error } = await supabase.from("sponsored_products").update({ status }).eq("id", banner.id)
      if (error) throw error
      invalidateMarketplaceDashboardCaches()
      await loadInitialData()
    } catch (error) {
      notify({ type: "error", title: "Update failed", message: getFriendlyErrorMessage(error) })
    }
  }

  async function handleDelete(banner) {
    const ok = await confirm({
      type: "error",
      title: "Remove sponsorship?",
      message: "This product will no longer be featured. Display images will also be deleted.",
      confirmText: "Remove",
    })
    if (!ok) return
    try {
      // Delete display images from storage first
      await Promise.all([
        deleteDisplayImageByUrl(banner.display_image_url),
        deleteDisplayImageByUrl(banner.display_image_url_2),
        deleteDisplayImageByUrl(banner.display_image_url_3),
      ])
      const { error } = await supabase.from("sponsored_products").delete().eq("id", banner.id)
      if (error) throw error
      invalidateMarketplaceDashboardCaches()
      await loadInitialData()
    } catch (error) {
      notify({ type: "error", title: "Delete failed", message: getFriendlyErrorMessage(error) })
    }
  }

  // Display image preview URLs for the "new sponsorship" preview card
  const newDisplayImages = [newImg1, newImg2, newImg3]
    .filter(Boolean)
    .map((f) => URL.createObjectURL(f))

  const missingImageCount = banners.filter((b) => !b.display_image_url).length

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <StaffPortalShell
      activeKey="sponsored-products"
      title="Sponsored Products"
      description="Select products to feature in the marketplace."
    >
      <SectionHeading
        eyebrow="Marketplace Feature"
        title="Product Sponsorship"
        description="Choose products from approved shops and upload dedicated display images to feature them directly to users."
      />

      {missingImageCount > 0 && (
        <div className="mb-6 flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <FaTriangleExclamation className="shrink-0 text-amber-500" />
          <p className="text-sm font-bold text-amber-800">
            {missingImageCount} existing sponsorship{missingImageCount !== 1 ? "s" : ""} {missingImageCount !== 1 ? "are" : "is"} hidden from the marketplace because {missingImageCount !== 1 ? "they have" : "it has"} no display image yet.
            Click <strong>"Upload display images"</strong> on each card below to make {missingImageCount !== 1 ? "them" : "it"} visible.
          </p>
        </div>
      )}

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <FaCircleNotch className="animate-spin text-4xl text-pink-600" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-8 xl:grid-cols-[450px_1fr]">
          {/* ── LEFT: selection tools ── */}
          <div className="space-y-6 rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-xl font-black text-slate-900">Selection Tools</h3>

            <div className="space-y-4">
              {/* City filter */}
              <div>
                <label className="mb-2 block text-xs font-black uppercase tracking-wider text-slate-500">
                  Step 1: Filter by City
                </label>
                <select
                  value={selectedCityId}
                  onChange={(e) => setSelectedCityId(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold outline-none focus:border-pink-500"
                >
                  <option value="">Global (All Cities)</option>
                  {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              {/* Product list */}
              <div>
                <label className="mb-2 block text-xs font-black uppercase tracking-wider text-slate-500">
                  Step 2: Browse &amp; Select Product
                </label>
                <div className="mb-3 relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search in available list..."
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 pl-10 pr-10 py-3 text-sm font-bold outline-none focus:border-pink-500"
                  />
                  <FaMagnifyingGlass className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery("")} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      <FaXmark />
                    </button>
                  )}
                </div>

                <div className="max-h-[340px] overflow-y-auto rounded-2xl border border-slate-100 bg-slate-50 p-2 scrollbar-thin">
                  {fetchingProducts ? (
                    <div className="flex h-20 items-center justify-center">
                      <FaCircleNotch className="animate-spin text-pink-600" />
                    </div>
                  ) : availableProducts.length > 0 ? (
                    <div className="grid grid-cols-1 gap-2">
                      {availableProducts.map((p) => (
                        <div
                          key={p.id}
                          className={`flex items-center gap-3 p-2 rounded-xl transition-all border-2 ${selectedProduct?.id === p.id ? "border-pink-500 bg-white shadow-sm" : "border-transparent hover:bg-white"}`}
                        >
                          {/* Product thumbnail + download link */}
                          <div className="relative shrink-0 group/thumb">
                            <div className="h-12 w-12 overflow-hidden rounded-lg bg-slate-200">
                              <img src={p.image_url} alt="" className="h-full w-full object-cover" />
                            </div>
                            <a
                              href={p.image_url}
                              download
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              title="Download product image"
                              className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-slate-700 text-white opacity-0 shadow transition group-hover/thumb:opacity-100"
                            >
                              <FaDownload className="text-[7px]" />
                            </a>
                          </div>

                          {/* Select button */}
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedProduct(p)
                              setNewImg1(null)
                              setNewImg2(null)
                              setNewImg3(null)
                            }}
                            className="min-w-0 flex-1 text-left"
                          >
                            <div className="truncate text-xs font-black text-slate-900">{p.name}</div>
                            <div className="text-[10px] font-bold text-slate-400">{p.shops.name} • ₦{Number(p.price).toLocaleString()}</div>
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-10 text-center text-xs font-bold text-slate-400">No products found for this city.</div>
                  )}
                </div>
              </div>

              {/* Step 3: quick-copy from product images (or download) */}
              {selectedProduct && (
                <div>
                  <label className="mb-2 block text-xs font-black uppercase tracking-wider text-slate-500">
                    Step 3a: Use product&apos;s own images
                  </label>
                  <ProductImageStrip
                    product={selectedProduct}
                    onCopyToSlot={(file, slot) => {
                      if (slot === 1) setNewImg1(file)
                      if (slot === 2) setNewImg2(file)
                      if (slot === 3) setNewImg3(file)
                    }}
                    disabledSlots={[
                      newImg1 ? 1 : null,
                      newImg2 ? 2 : null,
                      newImg3 ? 3 : null,
                    ].filter(Boolean)}
                  />
                </div>
              )}

              {/* Step 3b: Upload display images manually (required) */}
              <div>
                <label className="mb-2 block text-xs font-black uppercase tracking-wider text-slate-500">
                  {selectedProduct ? "Step 3b: Or upload your own images" : "Step 3: Upload Display Images"}
                  <span className="ml-1 text-rose-500">*</span>
                  <span className="ml-2 font-semibold normal-case text-slate-400">
                    (separate bucket — never shares URLs with the product)
                  </span>
                </label>
                <div className="flex items-start justify-around rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <ImageSlotPicker
                    label="Primary"
                    file={newImg1}
                    onFileChange={setNewImg1}
                    onClear={() => setNewImg1(null)}
                    required
                  />
                  <ImageSlotPicker
                    label="2nd"
                    file={newImg2}
                    onFileChange={setNewImg2}
                    onClear={() => setNewImg2(null)}
                  />
                  <ImageSlotPicker
                    label="3rd"
                    file={newImg3}
                    onFileChange={setNewImg3}
                    onClear={() => setNewImg3(null)}
                  />
                </div>
              </div>

              {/* Sort order */}
              <div>
                <label className="mb-2 block text-xs font-black uppercase tracking-wider text-slate-500">Display Order</label>
                <input
                  type="number"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold outline-none focus:border-pink-500"
                />
              </div>

              <button
                onClick={handlePublish}
                disabled={saving || !selectedProduct || !newImg1}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-pink-600 py-4 text-sm font-black text-white shadow-lg shadow-pink-200 transition hover:bg-pink-700 disabled:bg-slate-300"
              >
                {saving ? <FaCircleNotch className="animate-spin" /> : <FaPlus />}
                {saving ? "Processing…" : "Sponsor this Product"}
              </button>
              {!newImg1 && selectedProduct && (
                <p className="text-center text-[11px] font-bold text-rose-500">
                  Primary display image is required before sponsoring.
                </p>
              )}
            </div>
          </div>

          {/* ── RIGHT: preview + existing list ── */}
          <div className="space-y-8">
            <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="mb-4 text-xl font-black text-slate-900 text-center">Preview</h3>
              <SponsoredProductPreview
                product={selectedProduct}
                displayImages={newDisplayImages}
              />
            </div>

            <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="mb-6 text-xl font-black text-slate-900">Current Sponsorships</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {banners.map((banner) => (
                  <BannerCard
                    key={banner.id}
                    banner={banner}
                    onUpdateStatus={updateStatus}
                    onDelete={handleDelete}
                    onUploadImages={(b) => setUploadModalBanner(b)}
                  />
                ))}
              </div>
              {banners.length === 0 && (
                <div className="py-12 text-center text-slate-400 font-bold">No products are currently sponsored.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {uploadModalBanner && (
        <ImageUploadModal
          banner={uploadModalBanner}
          onClose={() => setUploadModalBanner(null)}
          onSaved={async () => {
            setUploadModalBanner(null)
            await loadInitialData()
          }}
        />
      )}
    </StaffPortalShell>
  )
}
