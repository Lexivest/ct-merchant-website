import BrandText from "./BrandText"

function HeaderMarquee() {
  const items = [
    "Repository of shops, products and services.",
    "Register for free and see verified merchants in your city and area.",
  ]

  const marqueeItems = [...items, ...items]

  return (
    <div className="overflow-hidden whitespace-nowrap">
      <div
        className="flex min-w-max items-center"
        style={{ animation: "headerScroll 30s linear infinite" }}
      >
        {marqueeItems.map((text, index) => (
          <div
            key={index}
            className="flex shrink-0 items-center gap-2 pr-12 text-[11px] font-extrabold uppercase tracking-wide text-amber-600"
          >
            <BrandText className="normal-case text-slate-900" />

            <div className="flex h-[9px] w-[13px] flex-col overflow-hidden rounded-[1px]">
              <div className="flex-1 bg-green-600"></div>
              <div className="flex-1 bg-white"></div>
              <div className="flex-1 bg-green-600"></div>
            </div>

            <span>{text}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default HeaderMarquee
