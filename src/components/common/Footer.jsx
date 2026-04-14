import { useEffect, useState } from "react"
import { Link } from "react-router-dom"

function Footer() {
  const [appVersion, setAppVersion] = useState("")

  useEffect(() => {
    // Attempt to fetch version once when footer mounts
    const fetchVersion = async () => {
      try {
        const res = await fetch("/version.json?t=" + Date.now(), { cache: "no-store" })
        if (res.ok) {
          const data = await res.json()
          setAppVersion(data.version)
        }
      } catch (err) {
        // Silently fail if version cannot be fetched
      }
    }
    fetchVersion()
  }, [])

  return (
    <footer className="border-t-4 border-pink-600 bg-slate-950 py-8 text-slate-400">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 text-xs md:flex-row">
        <div className="flex flex-col gap-1 md:flex-row md:items-center md:gap-4">
          <p className="font-bold text-white">© 2026 CT-MERCHANT LTD.</p>
          {appVersion && (
            <span className="font-mono text-[10px] uppercase tracking-widest text-slate-600">
              Build v{appVersion}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-6 font-medium">
          <Link to="/privacy" className="transition hover:text-white">
            Privacy Policy
          </Link>

          <Link to="/terms" className="transition hover:text-white">
            Terms of Use
          </Link>

          <span>RC: 8879163</span>
        </div>
      </div>
    </footer>
  )
}

export default Footer