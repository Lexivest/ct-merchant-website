import React from "react"

export function ShimmerBlock({ className = "h-4 w-full rounded" }) {
  return (
    <div className={`animate-pulse bg-slate-200 ${className}`}></div>
  )
}

export function ShimmerCard() {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <ShimmerBlock className="h-6 w-1/3 rounded-md" />
        <ShimmerBlock className="h-8 w-8 rounded-full" />
      </div>
      <ShimmerBlock className="mb-3 h-8 w-1/2 rounded-md" />
      <ShimmerBlock className="h-4 w-3/4 rounded-md" />
    </div>
  )
}

export function ShimmerList() {
  return (
    <div className="flex flex-col gap-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-4 rounded-xl border border-slate-100 bg-white p-4">
          <ShimmerBlock className="h-12 w-12 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <ShimmerBlock className="h-4 w-3/4 rounded-md" />
            <ShimmerBlock className="h-3 w-1/2 rounded-md" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function ShimmerProfileHeader() {
  return (
    <div className="flex flex-col items-center justify-center p-6 text-center">
      <ShimmerBlock className="mb-4 h-24 w-24 rounded-full" />
      <ShimmerBlock className="mb-2 h-6 w-48 rounded-md" />
      <ShimmerBlock className="h-4 w-32 rounded-md" />
    </div>
  )
}