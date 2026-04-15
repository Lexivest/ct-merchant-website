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
    if (aspectRatio >= 1) {
      return { width: "86%", maxHeight: "72vh", aspectRatio: String(aspectRatio) }
    }
    return { height: "72vh", maxHeight: "72vh", maxWidth: "86%", aspectRatio: String(aspectRatio) }
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
            width: { ideal: 1920 },
            height: { ideal: 1080 },
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
    <div className="fixed inset-0 z-[4000] flex flex-col bg-[rgba(2,6,23,0.96)] backdrop-blur-sm">
      <div className="flex items-center justify-between border-b border-slate-700 px-5 py-4 text-white">
        <div className="text-[1rem] font-extrabold">{title}</div>
        <button
          type="button"
          onClick={onClose}
          className="text-2xl text-slate-300 transition hover:text-white"
          aria-label="Close camera"
        >
          <FaXmark />
        </button>
      </div>

      <div className="relative flex flex-1 items-center justify-center overflow-hidden px-4 py-6">
        <video
          ref={videoRef}
          className="h-full w-full max-w-[900px] rounded-xl border border-slate-700 bg-black object-contain"
          muted
          playsInline
          autoPlay
        />

        <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-4">
          <div
            style={frameStyle}
            className="relative rounded-xl border-2 border-dashed border-white/90 shadow-[0_0_0_9999px_rgba(2,6,23,0.45)]"
          />
        </div>

        {initializing ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/55 text-white">
            <FaCircleNotch className="animate-spin text-3xl" />
            <p className="text-sm font-semibold">Initializing camera...</p>
          </div>
        ) : null}

        {error ? (
          <div className="absolute bottom-4 left-1/2 w-[calc(100%-2rem)] max-w-[620px] -translate-x-1/2 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700">
            {error}
          </div>
        ) : null}
      </div>

      <div className="border-t border-slate-700 bg-[rgba(15,23,42,0.96)] px-4 py-4">
        <div className="mx-auto flex w-full max-w-[900px] flex-col gap-4">
          {zoomRange ? (
            <div className="flex items-center gap-3 text-white">
              <FaMagnifyingGlassMinus className="text-slate-300" />
              <input
                type="range"
                min={zoomRange.min}
                max={zoomRange.max}
                step={zoomRange.step}
                value={zoom}
                onChange={(event) => applyZoom(Number(event.target.value))}
                className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-slate-600 accent-pink-500"
              />
              <FaMagnifyingGlassPlus className="text-slate-300" />
            </div>
          ) : (
            <p className="text-center text-[0.8rem] font-semibold text-slate-300">
              Camera zoom is not available on this device. You can still capture and adjust in studio.
            </p>
          )}

          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-500 px-5 py-2.5 font-semibold text-slate-200 transition hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={capture}
              disabled={initializing}
              className="flex items-center gap-2 rounded-lg bg-pink-600 px-6 py-2.5 font-extrabold text-white shadow-md transition hover:bg-pink-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <FaCamera />
              Capture
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
