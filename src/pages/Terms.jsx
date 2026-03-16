import { Link, useNavigate, useSearchParams } from "react-router-dom"
import MainLayout from "../layouts/MainLayout"

function Terms() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const handleBack = () => {
    if (searchParams.get("src") === "dash") {
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
                      Legal
                    </p>
                    <h1 className="text-xl font-extrabold md:text-2xl">
                      Terms of Use
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
                          d="M12 3l7 4v5c0 5-3.5 9-7 10-3.5-1-7-5-7-10V7l7-4z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M9 12l2 2 4-4"
                        />
                      </svg>
                    </div>

                    <div>
                      <h2 className="text-base font-extrabold text-slate-900 md:text-lg">
                        Legal Agreement
                      </h2>
                      <p className="mt-2 text-sm leading-7 text-slate-600 md:text-[15px]">
                        These terms govern access to and use of the CTMerchant
                        digital repository platform. By accessing or using the
                        platform, you agree to these Terms of Use.
                      </p>
                      <p className="mt-3 text-sm font-extrabold text-slate-900">
                        Effective Date: March 2026
                      </p>
                    </div>
                  </div>
                </div>

                <TermCard
                  title="1. Introduction & Scope"
                  icon={
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
                        d="M8 12h8M8 16h8M8 8h8M4 6h.01M4 10h.01M4 14h.01M4 18h.01"
                      />
                    </svg>
                  }
                >
                  <p className="text-sm leading-7 text-slate-600 md:text-[15px]">
                    CTMerchant (“we”, “our”, or “us”) operates a digital
                    repository that lists physical shops, their products, and
                    their locations within a city for discovery and
                    informational purposes only.
                  </p>

                  <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm font-extrabold leading-7 text-slate-900">
                      CTMerchant is not an online marketplace, agent, broker,
                      or seller. We do not facilitate payments, deliveries,
                      escrow services, or commercial transactions. All
                      interactions and transactions between users and shops
                      occur independently of CTMerchant.
                    </p>
                  </div>
                </TermCard>

                <TermCard
                  title="2. User & Merchant Responsibilities"
                  icon={
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
                        d="M9 12l2 2 4-4"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9 9 4.03 9 9z"
                      />
                    </svg>
                  }
                >
                  <p className="text-sm leading-7 text-slate-600 md:text-[15px]">
                    By using this platform, users and merchants agree to:
                  </p>

                  <ul className="mt-4 space-y-4">
                    <SimpleItem text="Provide information that is accurate to the best of their knowledge." />
                    <SimpleItem text="Use the platform strictly for lawful discovery and communication purposes." />
                    <SimpleItem text="Independently verify business details, pricing, quality, and availability before entering any transaction." />
                    <SimpleItem text="Comply with all applicable local, state, and federal laws and regulations." />
                  </ul>
                </TermCard>

                <TermCard
                  title="3. Listings & Availability"
                  icon={
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
                        d="M3 7l9-4 9 4-9 4-9-4zm0 0v10l9 4 9-4V7"
                      />
                    </svg>
                  }
                >
                  <p className="text-sm leading-7 text-slate-600 md:text-[15px]">
                    Listings provided on CTMerchant are informational only and
                    may change at any time without notice. Any request, inquiry,
                    or intent to purchase communicated through the platform or
                    through external apps such as WhatsApp is non-binding.
                  </p>

                  <p className="mt-4 text-sm leading-7 text-slate-600 md:text-[15px]">
                    CTMerchant does not guarantee seller response times,
                    product availability, or fulfillment of any inquiries made.
                  </p>
                </TermCard>

                <TermCard
                  title="4. Verification & Endorsement"
                  icon={
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
                        d="M12 3l7 4v5c0 5-3.5 9-7 10-3.5-1-7-5-7-10V7l7-4z"
                      />
                    </svg>
                  }
                >
                  <div className="space-y-4 text-sm leading-7 text-slate-600 md:text-[15px]">
                    <p>
                      <span className="font-extrabold text-slate-900">
                        Physical Verification:
                      </span>{" "}
                      CTMerchant performs basic physical verification of a
                      merchant’s existence and location accuracy to support the
                      integrity of the repository. This is intended only to
                      confirm that a listed shop is an active physical entity at
                      the stated address.
                    </p>

                    <p>
                      <span className="font-extrabold text-slate-900">
                        Limitation of Verification:
                      </span>{" "}
                      While we verify physical existence, CTMerchant does not
                      audit, certify, or guarantee the quality, safety,
                      authenticity, or legality of any products offered by a
                      merchant. A “Verified” status on the platform relates
                      strictly to location and identity and does not constitute
                      endorsement.
                    </p>

                    <p>
                      <span className="font-extrabold text-slate-900">
                        Independent Entity:
                      </span>{" "}
                      CTMerchant is an independent private technology company
                      and is not affiliated with government or regulatory
                      agencies.
                    </p>
                  </div>
                </TermCard>

                <div className="mt-6 rounded-3xl bg-red-200 p-1 shadow-sm">
                  <div className="rounded-[22px] border border-red-100 bg-white p-6 md:p-7">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-50 text-red-600">
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
                            d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M12 9v4"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M12 17h.01"
                          />
                        </svg>
                      </div>

                      <h2 className="text-xl font-extrabold text-red-600">
                        5. Limitation of Liability
                      </h2>
                    </div>

                    <p className="mt-4 text-sm leading-7 text-slate-600 md:text-[15px]">
                      To the maximum extent permitted by law, CTMerchant and its
                      affiliates shall not be liable for any direct, indirect,
                      incidental, consequential, or punitive damages arising
                      from your use of the platform. Because we do not
                      intermediate transactions, we are not responsible for
                      financial losses, defective goods, failed deals, or
                      disputes between buyers and sellers discovered through the
                      repository.
                    </p>
                  </div>
                </div>

                <div className="mt-6 rounded-3xl bg-pink-200 p-1 shadow-sm">
                  <div className="rounded-[22px] border border-pink-100 bg-slate-50 p-6 text-center md:p-8">
                    <h2 className="text-xl font-extrabold text-slate-900 md:text-2xl">
                      Questions regarding these terms?
                    </h2>

                    <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-slate-600 md:text-[15px]">
                      Our team is available to provide clarification regarding
                      platform policies, responsibilities, and limitations.
                    </p>

                    <Link
                      to="/contact"
                      className="mt-6 inline-flex items-center justify-center rounded-xl bg-pink-600 px-6 py-3 text-sm font-extrabold text-white shadow-[0_2px_5px_rgba(219,39,119,0.3)] transition hover:bg-pink-700"
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

function TermCard({ title, icon, children }) {
  return (
    <div className="mt-6 rounded-3xl bg-pink-200 p-1 shadow-sm">
      <div className="rounded-[22px] border border-pink-100 bg-white p-6 md:p-7">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-50 text-sky-700">
            {icon}
          </div>

          <h2 className="text-xl font-extrabold text-slate-900">{title}</h2>
        </div>

        <div className="mt-4">{children}</div>
      </div>
    </div>
  )
}

function SimpleItem({ text }) {
  return (
    <li className="flex items-start gap-3">
      <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-pink-50 text-pink-600">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          className="h-4 w-4"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M5 13l4 4L19 7"
          />
        </svg>
      </div>

      <p className="text-sm leading-7 text-slate-600 md:text-[15px]">{text}</p>
    </li>
  )
}

export default Terms