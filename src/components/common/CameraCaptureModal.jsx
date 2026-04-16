import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import {
  FaCamera,
  FaCircleNotch,
  FaMagnifyingGlassMinus,
  FaMagnifyingGlassPlus,
  FaXmark,
} from "react-icons/fa6"

function getDefaultZoomRange(currentZoom, capabilities) {
  const min = Number.isFinite(capabilities?.zoom?.min) ? capabilities.zoom.min : 1
  const max = Number.isFinite(capabilities?.zoom?.max) ? capabilities.zoom.max : min
  const step = Number.isFinite(capabilities?.zoom?.step) ? capabilities.zoom.step : 0.1
  const value = Number.isFinite(currentZoom) ? currentZoom : min
  return { min, max, step, value }
}

export default function CameraCaptureModal({
  open,
  title = "Capture Image",
  profile,
  onClose,
  onCapture,
}) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const trackRef = useRef(null)

  const [initializing, setInitializing] = useState(false)
  const [error, setError] = useState("")
  const [zoomRange, setZoomRange] = useState(null)
  const [zoom, setZoom] = useState(1)

  const aspectRatio = profile?.aspectRatio || 1
  const targetWidth = profile?.targetWidth || 1200
  const targetHeight = profile?.targetHeight || Math.round(targetWidth / aspectRatio)

  const frameStyle = useMemo(() => {
    return {
      width: aspectRatio >= 1 ? "min(90vw, 500px)" : "auto",
      height: aspectRatio < 1 ? "min(50vh, 500px)" : "auto",
      maxWidth: "94vw",
      maxHeight: "50vh",
      aspectRatio: String(aspectRatio),
    }
  }, [aspectRatio])

  useEffect(() => {
    if (!open) return undefined
    if (!navigator?.mediaDevices?.getUserMedia) {
      setError("Camera is not supported on this browser.")
      return undefined
    }

    let cancelled = false

    async function startCamera() {
      try {
        setInitializing(true)
        setError("")

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        })

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }

        streamRef.current = stream
        const track = stream.getVideoTracks()[0]
        trackRef.current = track

        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        await video.play()

        if (!track?.getCapabilities || !track?.getSettings) {
          setZoomRange(null)
          return
        }

        const capabilities = track.getCapabilities()
        const settings = track.getSettings()
        if (!Number.isFinite(capabilities?.zoom?.min) || !Number.isFinite(capabilities?.zoom?.max)) {
          setZoomRange(null)
          return
        }

        const range = getDefaultZoomRange(settings.zoom, capabilities)
        setZoomRange(range)
        setZoom(range.value)
      } catch (cameraError) {
        const message =
          cameraError instanceof Error ? cameraError.message : "Could not access camera."
        setError(message || "Could not access camera.")
      } finally {
        setInitializing(false)
      }
    }

    startCamera()

    return () => {
      cancelled = true
      const stream = streamRef.current
      if (stream) {
        stream.getTracks().forEach((t) => t.stop())
      }
      streamRef.current = null
      trackRef.current = null
      setZoomRange(null)
      setZoom(1)
      setError("")
    }
  }, [open])

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = ""
    }
    return () => {
      document.body.style.overflow = ""
    }
  }, [open])

  const applyZoom = async (nextZoom) => {
    setZoom(nextZoom)
    const track = trackRef.current
    if (!track) return
    if (!track.applyConstraints || !zoomRange) return

    try {
      await track.applyConstraints({ advanced: [{ zoom: nextZoom }] })
    } catch {
      // Some devices expose zoom capabilities but reject constraints; ignore.
    }
  }

  const capture = async () => {
    if (!videoRef.current) return
    if (typeof onCapture !== "function") return

    const video = videoRef.current
    const sourceWidth = video.videoWidth
    const sourceHeight = video.videoHeight

    if (!sourceWidth || !sourceHeight) {
      setError("Camera stream not ready. Try again.")
      return
    }

    const sourceAspect = sourceWidth / sourceHeight
    let cropWidth
    let cropHeight

    if (sourceAspect > aspectRatio) {
      cropHeight = sourceHeight
      cropWidth = Math.round(cropHeight * aspectRatio)
    } else {
      cropWidth = sourceWidth
      cropHeight = Math.round(cropWidth / aspectRatio)
    }

    const sx = Math.max(0, Math.floor((sourceWidth - cropWidth) / 2))
    const sy = Math.max(0, Math.floor((sourceHeight - cropHeight) / 2))

    try {
      const canvas = document.createElement("canvas")
      canvas.width = targetWidth
      canvas.height = targetHeight
      const ctx = canvas.getContext("2d")
      if (!ctx) {
        setError("Could not initialize camera capture.")
        return
      }

      ctx.fillStyle = "#FFFFFF"
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(video, sx, sy, cropWidth, cropHeight, 0, 0, canvas.width, canvas.height)

      const blob = await new Promise((resolve) => {
        canvas.toBlob((output) => resolve(output), "image/jpeg", 0.95)
      })

      if (!blob) {
        setError("Could not capture image. Please retry.")
        return
      }

      // Close first to release camera resources before processing in parent
      onClose()

      setTimeout(() => {
        onCapture({
          blob,
          width: canvas.width,
          height: canvas.height,
          mimeType: "image/jpeg",
        })
      }, 0)
    } catch (err) {
      console.error("Camera capture error:", err)
      setError("An error occurred during capture. Please try again.")
    }
  }

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex h-[100dvh] flex-col overflow-hidden bg-black font-sans">
      <div className="flex items-center justify-between bg-[#020617] px-5 py-4 text-white">
        <div className="text-[0.85rem] font-black uppercase tracking-[0.1em]">{title}</div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-1.5 text-2xl text-slate-400 transition hover:bg-white/10 hover:text-white"
          aria-label="Close camera"
        >
          <FaXmark />
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden bg-black">
        <video
          ref={videoRef}
          className="h-full w-full object-cover opacity-80"
          muted
          playsInline
          autoPlay
        />

        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
          <div
            style={frameStyle}
            className="relative rounded-2xl border-[3px] border-dashed border-white/90 shadow-[0_0_0_9999px_rgba(2,6,23,0.8)]"
          />
        </div>

        {initializing ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60 text-white">
            <FaCircleNotch className="animate-spin text-3xl text-pink-500" />
            <p className="text-[0.65rem] font-black uppercase tracking-widest">Waking Sensor...</p>
          </div>
        ) : null}

        {error ? (
          <div className="absolute bottom-6 left-1/2 w-[calc(100%-3rem)] max-w-[400px] -translate-x-1/2 rounded-xl border border-red-500/50 bg-red-950/90 px-4 py-3 text-center text-[0.7rem] font-black uppercase tracking-wider text-red-200 shadow-2xl backdrop-blur-md">
            {error}
          </div>
        ) : null}
      </div>

      <div className="bg-[#0f172a] px-5 py-6">
        <div className="mx-auto flex w-full max-w-[500px] flex-col gap-6">
          {zoomRange ? (
            <div className="flex items-center gap-4 text-white">
              <FaMagnifyingGlassMinus className="text-slate-500" />
              <input
                type="range"
                min={zoomRange.min}
                max={zoomRange.max}
                step={zoomRange.step}
                value={zoom}
                onChange={(event) => applyZoom(Number(event.target.value))}
                className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-slate-700 accent-pink-600"
              />
              <FaMagnifyingGlassPlus className="text-slate-500" />
            </div>
          ) : null}

          <div className="flex items-center justify-center gap-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-2xl border border-white/10 bg-white/5 py-4 text-xs font-black uppercase tracking-widest text-slate-300 active:scale-95"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={capture}
              disabled={initializing}
              className="flex flex-[1.5] items-center justify-center gap-3 rounded-2xl bg-pink-600 py-4 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-pink-600/20 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <FaCamera className="text-xl" />
              Capture
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
