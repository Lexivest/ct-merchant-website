import { FaRotateRight, FaXmark } from "react-icons/fa6"

function UpdateBanner({ onUpdate, onDismiss }) {
  return (
    <div className="fixed inset-x-0 top-0 z-[2999] flex items-center justify-between gap-3 bg-slate-900 px-4 py-2.5 shadow-md">
      <p className="text-xs font-semibold text-slate-200 leading-snug">
        A new version of{" "}
        <span className="text-pink-400">C</span>
        <span className="text-yellow-300">T</span>
        <span className="text-blue-400">M</span>
        <span className="text-white">erchant</span>
        {" "}is ready.
      </p>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={onUpdate}
          className="flex items-center gap-1.5 rounded-lg bg-pink-600 px-3 py-1 text-xs font-black text-white transition hover:bg-pink-500 active:scale-95"
        >
          <FaRotateRight className="text-[0.65rem]" />
          Update now
        </button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss update banner"
          className="flex h-6 w-6 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-700 hover:text-white"
        >
          <FaXmark className="text-xs" />
        </button>
      </div>
    </div>
  )
}

export default UpdateBanner
