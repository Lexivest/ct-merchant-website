import { Link, useNavigate } from "react-router-dom"
import MainLayout from "../layouts/MainLayout"

const services = [
  {
    title: "Business & Product Indexing",
    text: "Structured cataloging of physical shops and their available products, enabling accurate digital representation and city-wide searchability.",
    icon: (
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
          d="M3 7l9-4 9 4-9 4-9-4zm0 0v10l9 4 9-4V7m-9 4v10"
        />
      </svg>
    ),
  },
  {
    title: "Data Accuracy Framework",
    text: "A standardized process for maintaining up-to-date listings through merchant-submitted updates and periodic data consistency checks.",
    icon: (
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
          d="M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"
        />
      </svg>
    ),
  },
  {
    title: "Availability Signaling",
    text: "Optional indicators that allow merchants to signal item availability, helping users plan visits without facilitating transactions or payments.",
    icon: (
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
          d="M4 18V6m4 8V6m4 12V6m4 8V6m4 12V6"
        />
      </svg>
    ),
  },
  {
    title: "Catalog Management Tools",
    text: "A controlled merchant interface for maintaining product listings, descriptions, pricing ranges, and storefront visibility.",
    icon: (
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
          d="M14.7 6.3l3 3M7 21l-4-4 11-11 4 4L7 21z"
        />
      </svg>
    ),
  },
  {
    title: "Merchant Enablement",
    text: "Onboarding guidance and ongoing support to help physical businesses maintain accurate digital visibility with minimal disruption.",
    icon: (
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
          d="M17 8a5 5 0 00-10 0v2H5a2 2 0 00-2 2v2a7 7 0 0014 0v-2a2 2 0 00-2-2h-2V8zm0 6h4m-2-2v4"
        />
      </svg>
    ),
  },
  {
    title: "Discovery Insights",
    text: "Aggregated, non-transactional insights that help merchants understand how users discover their storefronts and listings.",
    icon: (
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
          d="M4 19V5m5 14V9m5 10V3m5 16v-6"
        />
      </svg>
    ),
  },
]

function Services() {
  const navigate = useNavigate()

  const handleBack = () => {
    const ref = document.referrer.toLowerCase()

    if (ref.includes("user-dashboard") || ref.includes("merchant-dashboard")) {
      navigate("/dashboard?tab=services")
      return
    }

    navigate("/")
  }

  return (
    <MainLayout>
      <section className="bg-pink-50 px-4 py-5 md:py-6">
        <div className="mx-auto max-w-7xl">
          <div className="rounded-[28px] bg-pink-200 p-1 shadow-sm">
            <div className="rounded-[24px] border border-pink-100 bg-white">
              <div className="border-b border-pink-100 bg-slate-950 px-5 py-4 text-white md:px-6">
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
                      Platform Capabilities
                    </p>
                    <h1 className="text-xl font-extrabold md:text-2xl">
                      Our Services
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
                          d="M3 6h18M3 12h18M3 18h18"
                        />
                      </svg>
                    </div>

                    <div>
                      <h2 className="text-base font-extrabold text-slate-900 md:text-lg">
                        Our Services
                      </h2>
                      <p className="mt-2 text-sm leading-7 text-slate-600 md:text-[15px]">
                        Institutional-grade digital services focused on
                        cataloging, structuring, and exposing real-world commerce
                        for accurate local discovery.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-6 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                  {services.map((service) => (
                    <div
                      key={service.title}
                      className="rounded-3xl bg-pink-200 p-1 shadow-sm"
                    >
                      <div className="h-full rounded-[22px] border border-pink-100 bg-white p-6 transition hover:-translate-y-0.5 hover:shadow-md">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-sky-700">
                          {service.icon}
                        </div>

                        <h2 className="mt-4 text-lg font-extrabold leading-6 text-slate-900">
                          {service.title}
                        </h2>

                        <p className="mt-3 text-sm leading-7 text-slate-600">
                          {service.text}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-6 rounded-3xl bg-pink-200 p-1 shadow-sm">
                  <div className="rounded-[22px] border border-pink-100 bg-slate-50 p-6 text-center md:p-8">
                    <h2 className="text-xl font-extrabold text-slate-900 md:text-2xl">
                      Reliable Discovery for Every Neighborhood
                    </h2>

                    <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-slate-600 md:text-[15px]">
                      CTMerchant operates as a neutral discovery layer—
                      connecting people to real places without intermediating
                      commerce.
                    </p>

                    <Link
                      to="/help-support"
                      className="mt-6 inline-flex items-center justify-center rounded-xl bg-pink-600 px-6 py-3 text-sm font-extrabold text-white shadow-[0_2px_5px_rgba(219,39,119,0.3)] transition hover:-translate-y-0.5 hover:bg-pink-700"
                    >
                      Contact Support
                    </Link>
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

export default Services