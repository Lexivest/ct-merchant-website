import { useSignedUrl } from "../../hooks/useSignedUrl"
import { FaTriangleExclamation } from "react-icons/fa6"
import CTMLoader from "./CTMLoader"

export function ProtectedImage({ src, bucket, alt, className, containerClassName }) {
  const { signedUrl, loading, error } = useSignedUrl(src, bucket)

  if (loading) {
    return (
      <div className={`flex items-center justify-center bg-slate-100 ${containerClassName || className}`}>
        <CTMLoader size="sm" />
      </div>
    )
  }

  if (error || !signedUrl) {
    return (
      <div className={`flex flex-col items-center justify-center bg-slate-50 text-slate-400 ${containerClassName || className}`}>
        <FaTriangleExclamation className="mb-1" />
        <span className="text-[10px] font-bold uppercase">Load Failed</span>
      </div>
    )
  }

  return <img src={signedUrl} alt={alt} className={className} />
}

export function ProtectedVideo({ src, bucket, className, controls = true, ...props }) {
  const { signedUrl, loading, error } = useSignedUrl(src, bucket)

  if (loading) {
    return (
      <div className={`flex aspect-video items-center justify-center bg-slate-900 ${className}`}>
        <CTMLoader size="sm" />
      </div>
    )
  }

  if (error || !signedUrl) {
    return (
      <div className={`flex aspect-video flex-col items-center justify-center bg-slate-900 text-slate-500 ${className}`}>
        <FaTriangleExclamation className="mb-2 text-2xl" />
        <span className="text-sm font-bold">Failed to load video</span>
      </div>
    )
  }

  return <video src={signedUrl} controls={controls} className={className} {...props} />
}
