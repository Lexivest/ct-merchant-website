import { Link } from "react-router-dom"

function Footer() {
  return (
    <footer className="border-t-4 border-pink-600 bg-slate-950 py-8 text-slate-400">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 text-xs md:flex-row">
        <p className="font-bold text-white">© 2026 CT-MERCHANT LTD.</p>

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