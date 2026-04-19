import { useNavigate, useSearchParams } from "react-router-dom"
import MainLayout from "../layouts/MainLayout"
import PageSeo from "../components/common/PageSeo"

function About() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const handleBack = () => {
    if (searchParams.get("src") === "dash") {
      navigate("/user-dashboard?tab=services")
      return
    }

    navigate("/")
  }

  return (
    <MainLayout>
      <PageSeo
        title="About CTMerchant | Company Profile"
        description="Learn how CTMerchant organizes verified physical shops, products, and services into a trusted local discovery network."
        canonicalPath="/about"
      />
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
                      Corporate Profile
                    </p>
                    <h1 className="text-xl font-extrabold md:text-2xl">
                      About CTMerchant
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
                          d="M12 16v5m0-5a4 4 0 10-4-4m4 4a4 4 0 104-4m-4 4V3m0 0H8m4 0h4"
                        />
                      </svg>
                    </div>

                    <div>
                      <h2 className="text-base font-extrabold text-slate-900 md:text-lg">
                        Corporate Identity
                      </h2>
                      <p className="mt-2 text-sm leading-7 text-slate-600 md:text-[15px]">
                        Bridging the gap between localized commerce and digital
                        accessibility across Nigeria’s urban centers.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-6 grid gap-6 md:grid-cols-2">
                  <div className="rounded-3xl bg-pink-200 p-1 shadow-sm">
                    <div className="h-full rounded-[22px] border border-pink-100 bg-white p-6">
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-pink-50 text-pink-600">
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
                              d="M2.062 12.348a1 1 0 010-.696 10 10 0 0118.876 0 1 1 0 010 .696 10 10 0 01-18.876 0z"
                            />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        </div>

                        <h2 className="text-lg font-extrabold text-pink-600">
                          Vision
                        </h2>
                      </div>

                      <p className="mt-4 text-sm leading-7 text-slate-600 md:text-[15px]">
                        To serve as the definitive digital architecture for
                        urban commercial discovery, ensuring every physical
                        storefront is accessible to the modern digital consumer.
                      </p>
                    </div>
                  </div>

                  <div className="rounded-3xl bg-pink-200 p-1 shadow-sm">
                    <div className="h-full rounded-[22px] border border-pink-100 bg-white p-6">
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
                            <circle cx="12" cy="12" r="9" />
                            <circle cx="12" cy="12" r="3" />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M12 2v3m0 14v3m10-10h-3M5 12H2"
                            />
                          </svg>
                        </div>

                        <h2 className="text-lg font-extrabold text-slate-900">
                          Mission
                        </h2>
                      </div>

                      <p className="mt-4 text-sm leading-7 text-slate-600 md:text-[15px]">
                        Deploying a comprehensive, location-aware repository
                        that empowers physical merchants with institutional-grade
                        visibility and structured data integrity.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-6 rounded-3xl bg-pink-200 p-1 shadow-sm">
                  <div className="rounded-[22px] border border-pink-100 bg-white p-6 md:p-7">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-800">
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
                            d="M3 21h18M5 21V7l7-4 7 4v14M9 9h.01M9 13h.01M9 17h.01M15 9h.01M15 13h.01M15 17h.01"
                          />
                        </svg>
                      </div>

                      <h2 className="text-xl font-extrabold text-slate-900">
                        Institutional Profile
                      </h2>
                    </div>

                    <div className="mt-5 space-y-4 text-sm leading-7 text-slate-600 md:text-[15px]">
                      <p>
                        CTMerchant is a specialized information technology firm
                        providing critical data infrastructure for Nigeria’s
                        local trade ecosystems. We facilitate the digital
                        translation of physical inventory and merchant
                        locations, providing a structured ecosystem for consumer
                        exploration.
                      </p>

                      <p>
                        Our operational framework prioritizes{" "}
                        <span className="font-extrabold text-slate-900">
                          Data Accuracy
                        </span>{" "}
                        and{" "}
                        <span className="font-extrabold text-slate-900">
                          Discovery Optimization
                        </span>
                        , reducing friction in local commerce while preserving
                        the traditional merchant–customer relationship.
                      </p>

                      <p>
                        CTMerchant operates strictly as a neutral information
                        repository. We remain independent of financial
                        settlements and logistics to maintain data integrity and
                        search excellence.
                      </p>
                    </div>

                    <div className="mt-8 mb-[-1.5rem] mx-[-1.5rem] md:mb-[-1.75rem] md:mx-[-1.75rem] rounded-b-[21px] bg-slate-900 p-6 text-slate-300 shadow-2xl border-t border-white/10 backdrop-blur-xl md:p-8">
                      <p className="leading-7 text-justify md:text-[15px]">
                        CT-MERCHANT LTD is a registered company with the Corporate Affairs Commission (CAC) of Nigeria under the Companies and Allied Matters Act 2020 (CAMA) with RC Number 8879163, incorporated <span className="text-white font-black italic">"TO CARRY ON THE BUSINESS OF E- COMMERCE AND ONLINE MARKETPLACE BY PROVIDING A DIGITAL PLATFORM FOR BUYERS AND SELLERS TO CONNECT, TRADE, AND TRANSACT; TO ENGAGE IN THE BUSINESS OF INFORMATION AND COMMUNICATION TECHNOLOGY SERVICES INCLUDING SOFTWARE AND MOBILE APPLICATION DEVELOPMENT, WEBSITE DESIGN AND DIGITAL MARKETING."</span>
                      </p>
                      <p className="mt-4 leading-7 text-justify md:text-[15px]">
                        The company is indexed in the Data Universal Numbering System (DUNS) and Bradstreet (USA).
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-6 rounded-3xl bg-pink-200 p-1 shadow-sm">
                  <div className="rounded-[22px] border border-pink-100 bg-slate-50 p-6 md:p-7">
                    <div className="flex items-center justify-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-pink-600 shadow-sm">
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
                            d="M3 3h18v5H3zm0 8h8v10H3zm10 0h8v4h-8zm0 7h8v3h-8z"
                          />
                        </svg>
                      </div>

                      <h2 className="text-center text-xl font-extrabold text-slate-900">
                        Organizational Structure
                      </h2>
                    </div>

                    <div className="mt-8 flex flex-col items-center">
                      <OrgCard
                        tier="top"
                        title="Board of Directors"
                        role="Governing Body"
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
                              d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 7a4 4 0 100-8 4 4 0 000 8zm11 14v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"
                            />
                          </svg>
                        }
                      />

                      <Connector />

                      <OrgCard
                        tier="exec"
                        title="Chief Executive Officer"
                        role="Director General"
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
                              d="M12 12a5 5 0 100-10 5 5 0 000 10zm-7 9a7 7 0 0114 0"
                            />
                          </svg>
                        }
                      />

                      <Connector />

                      <OrgCard
                        tier="exec"
                        title="Chief Operating Officer"
                        role="Operations Management"
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
                              d="M14 9V5a2 2 0 00-2-2H5a2 2 0 00-2 2v7a2 2 0 002 2h4m5-5h5m0 0l-2-2m2 2l-2 2m-5 2v4a2 2 0 002 2h5a2 2 0 002-2v-5a2 2 0 00-2-2h-4"
                            />
                          </svg>
                        }
                      />

                      <Connector />

                      <div className="relative mt-2 w-full">
                        <div className="hidden md:block">
                          <div className="mx-auto h-6 w-px bg-slate-300" />
                          <div className="mx-auto h-px w-3/4 bg-slate-300" />
                        </div>

                        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
                          <OrgCard
                            tier="dept"
                            title="ICT & Engineering"
                            role="Head of Technology"
                            subRole="Developers & Support"
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
                                  d="M4 7h16M7 4v16m10-9h3m-3 4h3M4 17h5"
                                />
                              </svg>
                            }
                          />

                          <OrgCard
                            tier="dept"
                            title="Finance & Accounts"
                            role="Head of Department"
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
                                  d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7H14.5a3.5 3.5 0 010 7H6"
                                />
                              </svg>
                            }
                          />

                          <OrgCard
                            tier="dept"
                            title="Regional Operations"
                            role="City Administrators"
                            subRole="Zonal Reps"
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
                                  d="M3 21h18M5 21V8l7-4 7 4v13M9 12h.01M15 12h.01M9 16h.01M15 16h.01"
                                />
                              </svg>
                            }
                          />

                          <OrgCard
                            tier="dept"
                            title="Marketing Directorate"
                            role="Head of Marketing"
                            subRole="Field Marketers"
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
                                  d="M3 11l18-5v12l-18-5v-2zm0 0v6"
                                />
                              </svg>
                            }
                          />
                        </div>
                      </div>
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

function Connector() {
  return <div className="h-6 w-px bg-slate-300" />
}

function OrgCard({ tier, title, role, icon, subRole }) {
  const tierStyles = {
    top: {
      border: "border-t-slate-900",
      iconWrap: "bg-slate-100 text-slate-900",
    },
    exec: {
      border: "border-t-pink-600",
      iconWrap: "bg-pink-50 text-pink-600",
    },
    dept: {
      border: "border-t-sky-700",
      iconWrap: "bg-sky-50 text-sky-700",
    },
  }

  const currentTier = tierStyles[tier]

  return (
    <div className="relative mx-auto w-full max-w-[280px]">
      {tier === "dept" ? (
        <div className="mx-auto h-6 w-px bg-slate-300 md:hidden" />
      ) : null}

      <div
        className={`rounded-2xl border border-slate-200 border-t-4 ${currentTier.border} bg-white p-5 text-center shadow-sm transition hover:-translate-y-0.5 hover:shadow-md`}
      >
        <div
          className={`mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full ${currentTier.iconWrap}`}
        >
          {icon}
        </div>

        <div className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-slate-500">
          {role}
        </div>

        <div className="mt-2 text-base font-extrabold leading-6 text-slate-900">
          {title}
        </div>

        {subRole ? (
          <div className="mt-4 border-t border-dashed border-slate-200 pt-3 text-sm font-bold text-slate-600">
            ↳ {subRole}
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default About
