import { useEffect, useMemo, useRef, useState } from "react"
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
      width: aspectRatio >= 1 ? "88%" : "auto",
      height: aspectRatio < 1 ? "45vh" : "auto",
      maxWidth: "92%",
      maxHeight: "45vh",
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

    onCapture({
      blob,
      width: canvas.width,
      height: canvas.height,
      mimeType: "image/jpeg",
    })
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[4000] flex flex-col bg-[rgba(2,6,23,0.98)] backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-3 text-white">
        <div className="text-[0.95rem] font-bold">{title}</div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-1 text-2xl text-slate-400 transition hover:bg-white/10 hover:text-white"
          aria-label="Close camera"
        >
          <FaXmark />
        </button>
      </div>

      <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden min-h-0 px-4 py-2">
        <video
          ref={videoRef}
          className="max-h-[50vh] w-full max-w-[800px] rounded-2xl border border-white/10 bg-black object-contain shadow-2xl"
          muted
          playsInline
          autoPlay
        />

        <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-4">
          <div
            style={frameStyle}
            className="relative rounded-2xl border-2 border-dashed border-white/80 shadow-[0_0_0_9999px_rgba(2,6,23,0.5)]"
          />
        </div>

        {initializing ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60 text-white">
            <FaCircleNotch className="animate-spin text-3xl text-pink-500" />
            <p className="text-sm font-bold tracking-wide">INITIALIZING CAMERA</p>
          </div>
        ) : null}

        {error ? (
          <div className="absolute bottom-4 left-1/2 w-[calc(100%-2rem)] max-w-[500px] -translate-x-1/2 rounded-xl border border-red-500/50 bg-red-950/90 px-4 py-3 text-center text-sm font-bold text-red-200 shadow-xl backdrop-blur-sm">
            {error}
          </div>
        ) : null}
      </div>

      <div className="border-t border-white/10 bg-slate-900/80 px-4 py-5 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-[600px] flex-col gap-5">
          {zoomRange ? (
            <div className="flex items-center gap-4 text-white">
              <FaMagnifyingGlassMinus className="text-slate-400" />
              <input
                type="range"
                min={zoomRange.min}
                max={zoomRange.max}
                step={zoomRange.step}
                value={zoom}
                onChange={(event) => applyZoom(Number(event.target.value))}
                className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-slate-700 accent-pink-500"
              />
              <FaMagnifyingGlassPlus className="text-slate-400" />
            </div>
          ) : null}

          <div className="flex items-center justify-center gap-4">
            <button
              type="button"
              onClick={onClose}
              className="min-w-[100px] rounded-xl border border-white/20 px-6 py-3 font-bold text-slate-300 transition hover:bg-white/10 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={capture}
              disabled={initializing}
              className="flex min-w-[140px] items-center justify-center gap-2 rounded-xl bg-pink-600 px-8 py-3 font-black uppercase tracking-wider text-white shadow-lg transition hover:bg-pink-700 hover:shadow-pink-500/20 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <FaCamera className="text-lg" />
              Capture
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
