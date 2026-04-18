import { useEffect, useState } from "react"
import { supabase } from "../lib/supabase"

/**
 * Hook to get a signed URL for a private Supabase Storage asset.
 * @param {string} fullUrlOrPath The full public URL or the relative path
 * @param {string} bucket The bucket name (optional if extracting from URL)
 * @param {number} expiresIn Seconds until the signed URL expires (default 1 hour)
 */
export function useSignedUrl(fullUrlOrPath, bucket, expiresIn = 3600) {
  const [signedUrl, setSignedUrl] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!fullUrlOrPath) {
      setSignedUrl(null)
      return
    }

    async function getSignedUrl() {
      setLoading(true)
      setError(null)

      try {
        let path = fullUrlOrPath
        let bucketName = bucket

        // If it's a full URL, attempt to extract bucket and path
        if (fullUrlOrPath.startsWith("http")) {
          // Format: https://[project].supabase.co/storage/v1/object/public/[bucket]/[path]
          // or Format: https://[project].supabase.co/storage/v1/object/authenticated/[bucket]/[path]
          try {
            const url = new URL(fullUrlOrPath)
            const parts = url.pathname.split("/")
            // parts[0] is empty, parts[1] is 'storage', parts[2] is 'v1', parts[3] is 'object', parts[4] is 'public'|'authenticated'
            if (parts.length >= 6) {
              bucketName = parts[5]
              path = parts.slice(6).join("/")
            }
          } catch (e) {
            console.warn("Failed to parse URL for signed link:", e)
          }
        }

        if (!bucketName) {
          throw new Error("Bucket name is required for private assets")
        }

        const { data, error: signedError } = await supabase.storage
          .from(bucketName)
          .createSignedUrl(path, expiresIn)

        if (signedError) throw signedError
        setSignedUrl(data.signedUrl)
      } catch (err) {
        console.error("Signed URL error:", err)
        setError(err)
        // Fallback to original if signed fails (might still be public or cached)
        setSignedUrl(fullUrlOrPath)
      } finally {
        setLoading(false)
      }
    }

    getSignedUrl()
  }, [fullUrlOrPath, bucket, expiresIn])

  return { signedUrl, loading, error }
}
