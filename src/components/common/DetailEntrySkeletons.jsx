import BrandText from "./BrandText"
import CTMLoader from "./CTMLoader"
import { ShimmerBlock } from "./Shimmers"

function LoaderBadge({ text }) {
  return (
    <div className="absolute left-1/2 top-4 z-[3] flex -translate-x-1/2 items-center gap-3 rounded-full border border-white/80 bg-white/92 px-4 py-2 shadow-[0_18px_40px_rgba(15,23,42,0.14)] backdrop-blur-sm">
      <CTMLoader size="sm" className="scale-[0.78]" />
      <div className="min-w-0">
        <div className="text-[0.62rem] font-black uppercase tracking-[0.18em] text-pink-600">
          <BrandText />
        </div>
        <div className="text-[0.72rem] font-bold text-slate-600">{text}</div>
      </div>
    </div>
  )
}

function SkeletonProductCard() {
  return (
    <div className="rounded-[18px] border border-slate-200 bg-white p-3">
      <ShimmerBlock className="aspect-square w-full rounded-[16px]" />
      <ShimmerBlock className="mt-3 h-4 w-3/4 rounded" />
      <ShimmerBlock className="mt-2 h-4 w-1/2 rounded" />
    </div>
  )
}

export function ShopDetailEntrySkeleton() {
  return (
    <div className="min-h-screen bg-[#E3E6E6] pb-10">
      <div className="mx-auto max-w-[1600px]">
        <header className="sticky top-0 z-[100] flex flex-col bg-[#131921] text-white shadow-[0_4px_6px_rgba(0,0,0,0.1)]">
          <div className="grid grid-cols-[44px_minmax(0,1fr)_44px] items-center px-4 py-3">
            <ShimmerBlock className="h-10 w-10 rounded-full bg-white/10" />
            <div className="flex justify-center">
              <ShimmerBlock className="h-5 w-44 rounded bg-white/10" />
            </div>
            <div className="flex justify-end">
              <ShimmerBlock className="h-9 w-9 rounded-full bg-white/10" />
            </div>
          </div>
          <div className="bg-[#232F3E] px-4 py-2">
            <ShimmerBlock className="h-4 w-3/4 rounded bg-white/10" />
          </div>
        </header>

        <section className="relative mb-2 overflow-hidden bg-white p-[6px]">
          <LoaderBadge text="Preparing shop" />
          <div className="relative aspect-[8/3] w-full max-h-[420px] overflow-hidden rounded-[4px] bg-white">
            <ShimmerBlock className="absolute inset-0 rounded-none" />
          </div>
        </section>

        <section className="border-y border-slate-300 bg-white px-4 pt-6 pb-6">
          <div className="mb-5 flex gap-2 overflow-hidden border-b border-slate-200 pb-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <ShimmerBlock key={index} className="h-9 flex-1 rounded-full sm:max-w-[130px]" />
            ))}
          </div>
          <div className="rounded-[18px] border border-slate-200 bg-[#FCFCFD] p-4">
            <div className="flex gap-3">
              <ShimmerBlock className="h-16 w-16 rounded-xl" />
              <div className="flex-1">
                <ShimmerBlock className="h-5 w-2/3 rounded" />
                <ShimmerBlock className="mt-3 h-4 w-1/3 rounded-full" />
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <ShimmerBlock key={index} className="h-11 w-11 rounded-xl" />
              ))}
            </div>
          </div>
        </section>

        {["Special Offers", "New Stocks"].map((title) => (
          <section key={title} className="mb-2 border-y border-slate-300 bg-white px-4 py-6">
            <div className="mb-4 flex items-center gap-3">
              <span className="inline-block h-[22px] w-[6px] rounded bg-pink-300" />
              <ShimmerBlock className="h-6 w-40 rounded" />
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-5">
              {Array.from({ length: 6 }).map((_, index) => (
                <SkeletonProductCard key={`${title}-${index}`} />
              ))}
            </div>
          </section>
        ))}

        <section className="mb-2 border-y border-slate-300 bg-white px-4 py-6">
          <div className="mb-4 flex items-center gap-3">
            <span className="inline-block h-[22px] w-[6px] rounded bg-pink-300" />
            <ShimmerBlock className="h-6 w-44 rounded" />
          </div>
          <div className="rounded-[20px] border border-slate-200 bg-[#FCFCFD] p-4">
            <div className="mb-3 flex items-center gap-3">
              <ShimmerBlock className="h-10 w-10 rounded-full" />
              <div className="flex-1">
                <ShimmerBlock className="h-4 w-36 rounded" />
                <ShimmerBlock className="mt-2 h-3 w-24 rounded" />
              </div>
            </div>
            <ShimmerBlock className="h-4 w-full rounded" />
            <ShimmerBlock className="mt-2 h-4 w-5/6 rounded" />
            <ShimmerBlock className="mt-2 h-4 w-2/3 rounded" />
          </div>
        </section>
      </div>
    </div>
  )
}

export function ProductDetailEntrySkeleton() {
  return (
    <div className="mx-auto flex min-h-screen max-w-[1200px] flex-col bg-[#E3E6E6] pb-[90px]">
      <header className="sticky top-0 z-[100] flex items-center justify-between bg-[#131921] px-4 py-3 text-white shadow-[0_4px_6px_rgba(0,0,0,0.1)]">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <ShimmerBlock className="h-10 w-10 rounded-full bg-white/10" />
          <div className="min-w-0 flex-1">
            <ShimmerBlock className="h-5 w-40 rounded bg-white/10" />
            <ShimmerBlock className="mt-2 h-3 w-24 rounded bg-white/10" />
          </div>
        </div>
        <div className="flex items-center gap-4">
          <ShimmerBlock className="h-8 w-8 rounded-full bg-white/10" />
          <ShimmerBlock className="h-8 w-8 rounded-full bg-white/10" />
        </div>
      </header>

      <div className="relative">
        <LoaderBadge text="Preparing product" />
      </div>

      <div className="main-layout flex w-full flex-col lg:flex-row lg:gap-6 lg:bg-transparent lg:p-10">
        <div className="left-col lg:flex-1">
          <section className="content-block mb-2 overflow-hidden bg-white !p-0 lg:mb-6 lg:rounded-lg lg:border lg:border-slate-300 lg:shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
            <div className="flex w-full flex-col items-center bg-white">
              <div className="relative aspect-square w-full bg-[#F7F7F7] lg:max-h-[500px]">
                <ShimmerBlock className="absolute inset-0 rounded-none" />
              </div>
              <div className="flex w-full gap-3 overflow-hidden p-4">
                {Array.from({ length: 5 }).map((_, index) => (
                  <ShimmerBlock key={index} className="h-[60px] w-[60px] shrink-0 rounded-md" />
                ))}
              </div>
            </div>
          </section>
        </div>

        <div className="right-col flex flex-col lg:flex-[1.2]">
          <section className="content-block mb-2 bg-white px-5 py-6 lg:mb-6 lg:rounded-lg lg:border lg:border-slate-300 lg:shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
            <ShimmerBlock className="h-6 w-24 rounded" />
            <ShimmerBlock className="mt-4 h-8 w-5/6 rounded" />
            <ShimmerBlock className="mt-2 h-8 w-1/3 rounded" />
            <ShimmerBlock className="mt-5 h-24 w-full rounded-[22px]" />
            <ShimmerBlock className="mt-4 h-6 w-32 rounded-full" />
          </section>

          <section className="content-block mb-2 flex-1 bg-white px-5 py-6 lg:mb-6 lg:rounded-lg lg:border lg:border-slate-300 lg:shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
            <ShimmerBlock className="h-5 w-36 rounded" />
            <ShimmerBlock className="mt-4 h-4 w-full rounded" />
            <ShimmerBlock className="mt-2 h-4 w-11/12 rounded" />
            <ShimmerBlock className="mt-2 h-4 w-4/5 rounded" />
            <div className="mt-6 overflow-hidden rounded-md border border-slate-200">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="flex border-b border-slate-200 bg-white px-4 py-3 last:border-b-0">
                  <ShimmerBlock className="h-4 w-1/3 rounded" />
                  <ShimmerBlock className="ml-4 h-4 flex-1 rounded" />
                </div>
              ))}
            </div>
          </section>

          <section className="content-block bg-white px-5 py-6 lg:rounded-lg lg:border lg:border-slate-300 lg:shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
            <ShimmerBlock className="h-4 w-28 rounded" />
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-5">
              <ShimmerBlock className="h-5 w-1/2 rounded" />
              <ShimmerBlock className="mt-3 h-4 w-5/6 rounded" />
            </div>
            <ShimmerBlock className="mt-4 h-12 w-full rounded-lg" />
          </section>
        </div>
      </div>

      <section className="mt-2 bg-white px-5 py-6 lg:mt-0 lg:rounded-lg lg:border lg:border-slate-300 lg:shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
        <ShimmerBlock className="mb-4 h-5 w-40 rounded" />
        <div className="flex gap-4 overflow-hidden pb-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="w-[150px] shrink-0 rounded-lg border border-slate-200 bg-white p-2.5">
              <ShimmerBlock className="aspect-square w-full rounded-md" />
              <ShimmerBlock className="mt-3 h-4 w-5/6 rounded" />
              <ShimmerBlock className="mt-2 h-4 w-1/2 rounded" />
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
