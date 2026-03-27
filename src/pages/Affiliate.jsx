import { Link, useNavigate } from "react-router-dom"
import MainLayout from "../layouts/MainLayout"
import useAuthSession from "../hooks/useAuthSession"
import PageSeo from "../components/common/PageSeo"

function Affiliate() {
  const navigate = useNavigate()

  // Hook into our global offline detection
  const { isOffline } = useAuthSession()

  const handleBack = () => {
    const ref = document.referrer.toLowerCase()

    if (ref.includes("user-dashboard") || ref.includes("merchant-dashboard")) {
      navigate("/user-dashboard?tab=services")
      return
    }

    navigate("/")
  }

  return (
    <MainLayout>
      <PageSeo
        title="Affiliate Program | CTMerchant"
        description="Join the CTMerchant affiliate program and help merchants and shoppers discover verified local businesses."
        canonicalPath="/affiliate"
      />
      {/* Global Offline Banner */}
      {isOffline && (
        <div className="z-[101] bg-amber-100 px-4 py-2 text-center text-sm font-bold text-amber-800 shadow-sm border-b border-amber-200 flex items-center justify-center gap-2">
          <i className="fa-solid fa-wifi-slash"></i>
          You are currently offline. Some links and contact features may be unavailable.
        </div>
      )}

      <section className="bg-pink-50 px-4 py-5 md:py-6">
        <div className="mx-auto max-w-7xl">
          <div className="rounded-[28px] bg-pink-200 p-1 shadow-sm">
            <div className="rounded-[24px] border border-pink-100 bg-white">
              <div className="border-b border-pink-100 bg-slate-950 px-5 py-4 text-white md:px-6 rounded-t-[24px]">
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={handleBack}
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white transition hover:bg-pink-600"
                    aria-label="Go back"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="h-5 w-5"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M15 18l-6-6 6-6"
                      />
                    </svg>
                  </button>

                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.25em] text-pink-300">
                      Partnerships
                    </p>
                    <h1 className="text-xl font-extrabold md:text-2xl">
                      Affiliates &amp; Partners
                    </h1>
                  </div>
                </div>
              </div>

              <div className="p-5 md:p-7">
                <div className="rounded-2xl border border-pink-200 bg-pink-50 p-5 md:p-6">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-pink-600 text-white shadow-sm">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className="h-5 w-5"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M8 12h8M7 7h.01M17 7h.01M7 17h.01M17 17h.01"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M12 3v18"
                        />
                      </svg>
                    </div>

                    <div>
                      <h2 className="text-base font-extrabold text-slate-900 md:text-lg">
                        Partnerships
                      </h2>
                      <p className="mt-2 text-sm leading-7 text-slate-600 md:text-[15px]">
                        We work with aligned organizations and individuals to
                        strengthen the accuracy, reach, and usefulness of local
                        commercial data across the nation.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-6 rounded-3xl bg-pink-200 p-1 shadow-sm">
                  <div className="rounded-[22px] border border-pink-100 bg-white p-6 md:p-7">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-50 text-sky-700">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          className="h-5 w-5"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M8 12h8M12 8v8M4 7h4v4H4zM16 13h4v4h-4zM16 4h4v4h-4zM4 16h4v4H4z"
                          />
                        </svg>
                      </div>

                      <h2 className="text-xl font-extrabold text-slate-900">
                        Strategic Affiliations
                      </h2>
                    </div>

                    <p className="mt-4 text-sm leading-7 text-slate-600 md:text-[15px]">
                      CTMerchant engages with data contributors, local business
                      associations, technology providers, and ecosystem partners
                      whose activities complement our discovery-focused mandate.
                    </p>
                  </div>
                </div>

                <div className="mt-6 rounded-3xl bg-pink-200 p-1 shadow-sm">
                  <div className="rounded-[22px] border border-pink-100 bg-slate-50 p-6 text-center md:p-8">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-pink-50 text-pink-600 shadow-sm">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className="h-5 w-5"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M3 8l9 6 9-6M5 19h14a2 2-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                        />
                      </svg>
                    </div>

                    <h2 className="mt-4 text-xl font-extrabold text-pink-600 md:text-2xl">
                      Become an Affiliate
                    </h2>

                    <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-slate-600 md:text-[15px]">
                      If your organization or initiative aligns with structured
                      commerce discovery and data integrity, we welcome a formal
                      engagement.
                    </p>

                    <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                      <Link
                        to="/contact"
                        className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-pink-600 px-6 py-3 text-sm font-extrabold text-white shadow-[0_2px_5px_rgba(219,39,119,0.3)] transition hover:bg-pink-700"
                      >
                        <span>Contact Us</span>
                      </Link>

                      <a
                        href="mailto:admin@ct-merchant.com.ng"
                        className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-6 py-3 text-sm font-extrabold text-slate-900 transition hover:bg-slate-50"
                      >
                        <span>Email Admin Directly</span>
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </MainLayout>
  )
}

export default Affiliate
