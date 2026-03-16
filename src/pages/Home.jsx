import { useEffect, useState } from "react"
import MainLayout from "../layouts/MainLayout"
import RepoSearchBar from "../components/RepoSearchBar"

const phrases = [
  "Verified Merchants",
  "Safe and Secure",
  "Boost Your Business",
]

function Home() {
  const [phraseIndex, setPhraseIndex] = useState(0)
  const [charIndex, setCharIndex] = useState(0)
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    const currentPhrase = phrases[phraseIndex]
    const timeout = isDeleting ? 50 : 100

    if (!isDeleting && charIndex === currentPhrase.length) {
      const timer = setTimeout(() => setIsDeleting(true), 1800)
      return () => clearTimeout(timer)
    }

    if (isDeleting && charIndex === 0) {
      const timer = setTimeout(() => {
        setIsDeleting(false)
        setPhraseIndex((prev) => (prev + 1) % phrases.length)
      }, 400)
      return () => clearTimeout(timer)
    }

    const timer = setTimeout(() => {
      setCharIndex((prev) => prev + (isDeleting ? -1 : 1))
    }, timeout)

    return () => clearTimeout(timer)
  }, [charIndex, isDeleting, phraseIndex])

  return (
    <MainLayout>
      <section className="bg-pink-50 px-4 py-4 md:py-5">
        <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-2 lg:grid-rows-[auto_1fr]">
          <div className="rounded-[28px] bg-pink-200 p-1 shadow-sm lg:col-start-1 lg:row-start-1">
            <div className="min-h-[260px] overflow-hidden rounded-[24px] border border-pink-100 bg-[url('https://goodtvrhszsnhcyigfoi.supabase.co/storage/v1/object/public/ctm_web_files/ct%20web%20banner%20opt.jpg')] bg-cover bg-top shadow-lg md:min-h-[420px]">
              <div className="flex min-h-[260px] items-end md:min-h-[420px]">
                <div className="flex w-full flex-wrap justify-center gap-3 border-t border-white/20 bg-slate-900/55 px-4 py-2.5 text-xs font-semibold text-white backdrop-blur-sm md:gap-4 md:py-4 md:text-sm">
                  <span className="flex items-center gap-2">
                    <span className="text-emerald-400">●</span> Commerce
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-pink-400">●</span> Discover Locally
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-sky-400">●</span> Unique ID
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[28px] bg-pink-200 p-1 shadow-sm lg:col-start-2 lg:row-span-2 lg:row-start-1">
            <div className="flex h-full flex-col rounded-[24px] border border-pink-100 bg-white p-6 md:p-8">
              <div className="min-h-[34px] text-lg font-extrabold text-slate-900 md:text-2xl">
                {phrases[phraseIndex].slice(0, charIndex)}
                <span className="ml-1 inline-block animate-pulse text-pink-600">
                  |
                </span>
              </div>

              <p className="mt-4 max-w-xl text-base font-medium leading-7 text-slate-600">
                We provide a digital repository of physical shops, their
                products, and locations within a city.
              </p>

              <div className="mt-6 rounded-[22px] bg-pink-200 p-1">
                <div className="rounded-[18px] bg-slate-900 p-5 text-white">
                  <RepoSearchBar />
                </div>
              </div>

              <div className="mt-6 rounded-[22px] bg-pink-200 p-1">
                <div className="rounded-[18px] border border-pink-200 bg-pink-50 p-6">
                  <h2 className="flex items-center gap-2 text-xl font-extrabold text-slate-900">
                    <span>🔒</span>
                    <span>Users Login</span>
                  </h2>

                  <form className="mt-5 space-y-3">
                    <div>
                      <input
                        type="email"
                        placeholder="Email Address"
                        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none placeholder:text-slate-400 focus:border-pink-500"
                      />
                    </div>

                    <div>
                      <input
                        type="password"
                        placeholder="Password"
                        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none placeholder:text-slate-400 focus:border-pink-500"
                      />
                    </div>

                    <div className="text-right">
                      <button
                        type="button"
                        className="text-sm font-medium text-slate-600 transition hover:text-pink-600"
                      >
                        Forgot password?
                      </button>
                    </div>

                    <button
                      type="submit"
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-pink-600 px-4 py-3 text-base font-extrabold text-white transition hover:bg-pink-700"
                    >
                      Secure Sign In
                      <span>→</span>
                    </button>
                  </form>

                  <div className="my-5 flex items-center gap-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    <div className="h-px flex-1 bg-pink-200"></div>
                    <span>New to CTMerchant?</span>
                    <div className="h-px flex-1 bg-pink-200"></div>
                  </div>

                  <button
                    type="button"
                    className="w-full rounded-xl border-2 border-pink-200 bg-white px-4 py-3 text-base font-bold text-slate-900 transition hover:bg-pink-100"
                  >
                    Create Account
                  </button>

                  <div className="my-5 flex items-center gap-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    <div className="h-px flex-1 bg-pink-200"></div>
                    <span>Or continue with</span>
                    <div className="h-px flex-1 bg-pink-200"></div>
                  </div>

                  <button
                    type="button"
                    className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-100"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="h-5 w-5" aria-hidden="true">
                      <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303C33.654 32.657 29.215 36 24 36c-6.627 0-12-5.373-12-12S17.373 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.277 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
                      <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 16.108 19.005 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.277 4 24 4c-7.682 0-14.347 4.337-17.694 10.691z" />
                      <path fill="#4CAF50" d="M24 44c5.176 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.144 35.091 26.646 36 24 36c-5.194 0-9.624-3.329-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
                      <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.793 2.237-2.231 4.166-4.084 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
                    </svg>
                    <span>Continue with Google</span>
                  </button>
                </div>
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div className="rounded-[22px] bg-pink-200 p-1">
                  <div className="rounded-[18px] border border-pink-100 bg-slate-50 p-4">
                    <div className="text-2xl">🛡️</div>
                    <h3 className="mt-3 text-lg font-extrabold text-slate-900">
                      100% Verified
                    </h3>
                    <p className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-500">
                      Physical Shops Only
                    </p>
                  </div>
                </div>

                <div className="rounded-[22px] bg-pink-200 p-1">
                  <div className="rounded-[18px] border border-pink-100 bg-slate-50 p-4">
                    <div className="text-2xl">🤝</div>
                    <h3 className="mt-3 text-lg font-extrabold text-slate-900">
                      Zero Fraud
                    </h3>
                    <p className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-500">
                      Secure Marketplace
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[28px] bg-pink-200 p-1 shadow-sm lg:col-start-1 lg:row-start-2">
            <div className="h-full rounded-[24px] border border-pink-100 bg-white p-6 md:p-8">
              <span className="inline-block rounded-full border border-pink-200 bg-pink-50 px-4 py-2 text-xs font-extrabold uppercase tracking-wider text-pink-700">
                Repository of Shops, Products and Services
              </span>

              <h2 className="mt-4 text-2xl font-extrabold text-slate-900 md:text-3xl">
                Grow Your Physical Shop Digitally
              </h2>

              <p className="mt-4 text-base leading-8 text-slate-600">
                CTMerchant is a structured repository of shops, products, and
                services within a city. We onboard and physically verify
                merchants to reduce fraudulent online claims and help customers
                discover real businesses around them.
              </p>

              <p className="mt-4 text-base leading-8 text-slate-600">
                Our platform helps consumers compare shops, products, and
                options before visiting a store, creating a better balance
                between digital convenience and physical marketplace reality.
              </p>

              <ul className="mt-6 space-y-3 text-sm font-semibold text-slate-700 md:text-base">
                <li>✓ Get a verified digital storefront</li>
                <li>✓ Unique CTMerchant ID to share</li>
                <li>✓ Be discovered in city repository search</li>
              </ul>
            </div>
          </div>
        </div>
      </section>
    </MainLayout>
  )
}

export default Home