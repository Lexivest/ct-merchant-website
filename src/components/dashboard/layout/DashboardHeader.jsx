import { useEffect, useMemo, useRef, useState } from "react"
import {
  FaArrowDownAZ,
  FaBell,
  FaBox,
  FaChevronDown,
  FaHouse,
  FaLocationDot,
  FaMagnifyingGlass,
  FaStore,
  FaTableCellsLarge,
} from "react-icons/fa6"

function DashboardHeader({
  activeTab,
  currentProfile,
  user,
  sortedAreas,
  categories,
  searchArea,
  setSearchArea,
  categoryFilter,
  setCategoryFilter,
  tickerText,
  searchInputDesktop,
  setSearchInputDesktop,
  searchInputMobile,
  setSearchInputMobile,
  searchSuggestionsDesktop,
  searchSuggestionsMobile,
  updateSuggestions,
  executeSearch,
  applySuggestion,
  switchScreen,
  unread,
  onShopIndex,
}) {
  const avatarSrc =
    currentProfile?.avatar_url ||
    `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
      currentProfile?.full_name || user?.email || "User"
    )}`

  const [desktopAreaOpen, setDesktopAreaOpen] = useState(false)
  const [mobileAreaOpen, setMobileAreaOpen] = useState(false)
  const [categoryOpen, setCategoryOpen] = useState(false)

  const desktopAreaRef = useRef(null)
  const mobileAreaRef = useRef(null)
  const categoryRef = useRef(null)

  const selectedAreaLabel = useMemo(() => {
    if (searchArea === "all") return "All Areas"
    const found = sortedAreas.find(
      (area) => String(area.id) === String(searchArea)
    )
    return found?.name || "All Areas"
  }, [searchArea, sortedAreas])

  const selectedCategoryLabel = useMemo(() => {
    if (categoryFilter === "all") return "All Categories"
    const found = (categories || []).find(
      (category) => category.name === categoryFilter
    )
    return found?.name || "All Categories"
  }, [categoryFilter, categories])

  useEffect(() => {
    function handleClickOutside(event) {
      const target = event.target
      if (!(target instanceof Node)) return

      if (
        desktopAreaRef.current &&
        !desktopAreaRef.current.contains(target)
      ) {
        setDesktopAreaOpen(false)
      }

      if (
        mobileAreaRef.current &&
        !mobileAreaRef.current.contains(target)
      ) {
        setMobileAreaOpen(false)
      }

      if (categoryRef.current && !categoryRef.current.contains(target)) {
        setCategoryOpen(false)
      }
    }

    function handleEscape(event) {
      if (event.key === "Escape") {
        setDesktopAreaOpen(false)
        setMobileAreaOpen(false)
        setCategoryOpen(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    document.addEventListener("keydown", handleEscape)

    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
      document.removeEventListener("keydown", handleEscape)
    }
  }, [])

  function renderSuggestionIcon(icon) {
    if (icon === "product") return <FaBox />
    return <FaStore />
  }

  function selectArea(value) {
    setSearchArea(value)
    setDesktopAreaOpen(false)
    setMobileAreaOpen(false)
  }

  function selectCategory(value) {
    setCategoryFilter(value)
    setCategoryOpen(false)
  }

  return (
    <header className="amz-header sticky top-0 z-[1000] flex flex-col bg-[#131921] text-white">
      <div className="amz-mobile-scroll-row mx-auto flex w-full max-w-[1600px] items-center gap-4 px-4 py-[10px] max-[1024px]:justify-between max-[1024px]:gap-2 max-[1024px]:px-3 max-[1024px]:py-2">
        <img
          src="https://goodtvrhszsnhcyigfoi.supabase.co/storage/v1/object/public/ctm_web_files/CT-Merchant.jpg"
          className="amz-logo h-[38px] cursor-pointer rounded object-contain"
          alt="Logo"
          onClick={() => window.location.reload()}
        />

        <div className="amz-location mobile-hide hidden items-center gap-[6px] rounded border border-transparent px-3 py-2 text-[0.95rem] font-bold text-white transition hover:border-white min-[1025px]:flex">
          <FaLocationDot />
          <span>{currentProfile?.cities?.name || "..."}</span>
        </div>

        <div className="desktop-search-wrap mobile-hide relative mx-4 hidden flex-1 min-[1025px]:block">
          <div className="amz-search-block flex h-[42px] w-full overflow-visible rounded-md border-[3px] border-transparent bg-white transition focus-within:border-pink-600">
            <div
              ref={desktopAreaRef}
              className="relative shrink-0 border-r border-r-[#CDD2D3]"
            >
              <button
                type="button"
                className="flex h-full max-w-[140px] items-center gap-2 bg-[#F3F4F6] px-3 text-[0.85rem] font-semibold text-[#555] transition hover:bg-[#DADADA] hover:text-[#0F1111]"
                onClick={() => {
                  setDesktopAreaOpen((prev) => !prev)
                  setMobileAreaOpen(false)
                  setCategoryOpen(false)
                }}
              >
                <span className="truncate">{selectedAreaLabel}</span>
                <FaChevronDown
                  className={`shrink-0 text-[0.7rem] transition ${
                    desktopAreaOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              <div
                className={`absolute left-0 top-[calc(100%+8px)] z-[3000] w-[240px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl transition-all duration-200 ${
                  desktopAreaOpen
                    ? "pointer-events-auto translate-y-0 opacity-100"
                    : "pointer-events-none -translate-y-2 opacity-0"
                }`}
              >
                <div className="max-h-[280px] overflow-y-auto py-2">
                  <button
                    type="button"
                    className={`flex items-center gap-3 w-full px-4 py-3 text-left text-sm font-medium transition hover:bg-slate-50 ${
                      searchArea === "all"
                        ? "bg-pink-50 text-pink-700"
                        : "text-slate-700"
                    }`}
                    onClick={() => selectArea("all")}
                  >
                    <span className={`h-[6px] w-[6px] rounded-full ${searchArea === "all" ? "bg-pink-600" : "bg-slate-300"}`}></span>
                    All Areas
                  </button>

                  {sortedAreas.map((area) => (
                    <button
                      key={area.id}
                      type="button"
                      className={`flex items-center gap-3 w-full px-4 py-3 text-left text-sm font-medium transition hover:bg-slate-50 ${
                        String(searchArea) === String(area.id)
                          ? "bg-pink-50 text-pink-700"
                          : "text-slate-700"
                      }`}
                      onClick={() => selectArea(String(area.id))}
                    >
                      <span className={`h-[6px] w-[6px] rounded-full shrink-0 ${String(searchArea) === String(area.id) ? "bg-pink-600" : "bg-slate-300"}`}></span>
                      <span className="truncate">{area.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <input
              className="amz-search-input min-w-0 flex-1 border-none px-4 text-base text-[#0F1111] outline-none"
              placeholder="Search shops and products..."
              value={searchInputDesktop}
              onChange={(e) => {
                setSearchInputDesktop(e.target.value)
                updateSuggestions(e.target.value, "desktop")
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") executeSearch("desktop")
              }}
            />

            <button
              type="button"
              className="amz-search-btn flex w-[52px] items-center justify-center border-none bg-pink-600 text-[1.2rem] text-white transition hover:bg-pink-700"
              onClick={() => executeSearch("desktop")}
            >
              <FaMagnifyingGlass />
            </button>
          </div>

          {searchSuggestionsDesktop.length > 0 ? (
            <div className="search-suggestions absolute left-0 right-0 top-[calc(100%+4px)] z-[2000] flex flex-col overflow-hidden rounded-lg border border-[#D5D9D9] bg-white shadow-[0_10px_25px_rgba(0,0,0,0.2)]">
              {searchSuggestionsDesktop.map((item, idx) => (
                <div
                  key={`${item.text}-${idx}`}
                  className="suggestion-item flex cursor-pointer items-center gap-3 border-b border-b-[#F3F4F6] px-4 py-3 text-[0.95rem] text-[#0F1111] transition last:border-b-0 hover:bg-[#F7F7F7]"
                  onClick={() => applySuggestion(item.text, "desktop")}
                >
                  <span className="sugg-icon w-5 text-center text-base text-[#888C8C]">
                    {renderSuggestionIcon(item.icon)}
                  </span>
                  <span className="sugg-text flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-medium">
                    {item.text}
                  </span>
                  <span className="sugg-type rounded bg-pink-100 px-[6px] py-[2px] text-[0.7rem] font-bold text-pink-600">
                    {item.type}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div
          className={`amz-nav-item ${
            activeTab === "market" ? "active" : ""
          } flex cursor-pointer items-center gap-[6px] rounded border border-transparent px-3 py-2 text-[0.95rem] font-bold text-white transition hover:border-white`}
          onClick={() => switchScreen("market")}
          title="Repository"
        >
          <FaHouse className="text-[1.1rem]" />
          <span className="mobile-hide hidden min-[1025px]:inline">
            Repository
          </span>
        </div>

        <div
          className={`amz-nav-item ${
            activeTab === "services" ? "active" : ""
          } flex cursor-pointer items-center gap-[6px] rounded border border-transparent px-3 py-2 text-[0.95rem] font-bold text-white transition hover:border-white`}
          onClick={() => switchScreen("services")}
          title="Dashboard"
        >
          <FaTableCellsLarge className="text-[1.1rem]" />
          <span className="mobile-hide hidden min-[1025px]:inline">
            Dashboard
          </span>
        </div>

        <div
          className={`amz-nav-item ${
            activeTab === "notifications" ? "active" : ""
          } relative flex cursor-pointer items-center gap-[6px] rounded border border-transparent px-3 py-2 text-[0.95rem] font-bold text-white transition hover:border-white`}
          onClick={() => switchScreen("notifications")}
          title="Alerts"
        >
          <FaBell className="text-[1.2rem]" />
          <span className="mobile-hide ml-[6px] hidden min-[1025px]:inline">
            Alerts
          </span>
          {unread > 0 ? (
            <span className="notif-badge absolute -right-[6px] -top-[2px] block rounded-[10px] border-2 border-[#131921] bg-[#EF4444] px-[6px] py-[2px] text-[0.65rem] font-extrabold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </div>

        <div
          className={`amz-nav-item ${
            activeTab === "profile" ? "active" : ""
          } flex cursor-pointer items-center rounded border border-transparent px-2 py-1 text-white transition hover:border-white`}
          onClick={() => switchScreen("profile")}
          title="Profile"
        >
          <img
            src={avatarSrc}
            className="header-avatar ml-1 h-[34px] w-[34px] rounded-full bg-white object-cover"
            alt="Avatar"
          />
        </div>

        <div
          className="amz-nav-item flex cursor-pointer items-center rounded border border-transparent px-2 py-1 text-white transition hover:border-white"
          onClick={onShopIndex}
          title="Shop Index"
        >
          <FaArrowDownAZ className="text-[1.1rem]" />
        </div>
      </div>

      <div className="mobile-search-wrap relative mx-4 mb-[10px] block w-[calc(100%-32px)] min-[1025px]:hidden">
        <div className="amz-search-block flex h-[42px] w-full overflow-visible rounded-md border-[3px] border-transparent bg-white transition focus-within:border-pink-600">
          <div
            ref={mobileAreaRef}
            className="relative shrink-0 border-r border-r-[#CDD2D3]"
          >
            <button
              type="button"
              className="flex h-full max-w-[110px] items-center gap-2 bg-[#F3F4F6] px-2 text-[0.85rem] font-semibold text-[#555]"
              onClick={() => {
                setMobileAreaOpen((prev) => !prev)
                setDesktopAreaOpen(false)
                setCategoryOpen(false)
              }}
            >
              <span className="truncate">{selectedAreaLabel}</span>
              <FaChevronDown
                className={`shrink-0 text-[0.7rem] transition ${
                  mobileAreaOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            <div
              className={`absolute left-0 top-[calc(100%+8px)] z-[3000] w-[260px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl transition-all duration-200 ${
                mobileAreaOpen
                  ? "pointer-events-auto translate-y-0 opacity-100"
                  : "pointer-events-none -translate-y-2 opacity-0"
              }`}
            >
              <div className="max-h-[280px] overflow-y-auto py-2">
                <button
                  type="button"
                  className={`flex items-center gap-3 w-full px-4 py-3 text-left text-sm font-medium transition hover:bg-slate-50 ${
                    searchArea === "all"
                      ? "bg-pink-50 text-pink-700"
                      : "text-slate-700"
                  }`}
                  onClick={() => selectArea("all")}
                >
                  <span className={`h-[6px] w-[6px] rounded-full ${searchArea === "all" ? "bg-pink-600" : "bg-slate-300"}`}></span>
                  All Areas
                </button>

                {sortedAreas.map((area) => (
                  <button
                    key={area.id}
                    type="button"
                    className={`flex items-center gap-3 w-full px-4 py-3 text-left text-sm font-medium transition hover:bg-slate-50 ${
                      String(searchArea) === String(area.id)
                        ? "bg-pink-50 text-pink-700"
                        : "text-slate-700"
                    }`}
                    onClick={() => selectArea(String(area.id))}
                  >
                    <span className={`h-[6px] w-[6px] rounded-full shrink-0 ${String(searchArea) === String(area.id) ? "bg-pink-600" : "bg-slate-300"}`}></span>
                    <span className="truncate">{area.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <input
            className="amz-search-input min-w-0 flex-1 border-none px-4 text-base text-[#0F1111] outline-none"
            placeholder="Search CTMerchant..."
            value={searchInputMobile}
            onChange={(e) => {
              setSearchInputMobile(e.target.value)
              updateSuggestions(e.target.value, "mobile")
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") executeSearch("mobile")
            }}
          />

          <button
            type="button"
            className="amz-search-btn flex w-[52px] items-center justify-center border-none bg-pink-600 text-[1.2rem] text-white transition hover:bg-pink-700"
            onClick={() => executeSearch("mobile")}
          >
            <FaMagnifyingGlass />
          </button>
        </div>

        {searchSuggestionsMobile.length > 0 ? (
          <div className="search-suggestions absolute left-0 right-0 top-[calc(100%+4px)] z-[2000] flex flex-col overflow-hidden rounded-lg border border-[#D5D9D9] bg-white shadow-[0_10px_25px_rgba(0,0,0,0.2)]">
            {searchSuggestionsMobile.map((item, idx) => (
              <div
                key={`${item.text}-${idx}`}
                className="suggestion-item flex cursor-pointer items-center gap-3 border-b border-b-[#F3F4F6] px-4 py-3 text-[0.95rem] text-[#0F1111] transition last:border-b-0 hover:bg-[#F7F7F7]"
                onClick={() => applySuggestion(item.text, "mobile")}
              >
                <span className="sugg-icon w-5 text-center text-base text-[#888C8C]">
                  {renderSuggestionIcon(item.icon)}
                </span>
                <span className="sugg-text flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-medium">
                  {item.text}
                </span>
                <span className="sugg-type rounded bg-pink-100 px-[6px] py-[2px] text-[0.7rem] font-bold text-pink-600">
                  {item.type}
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="amz-sub-header flex items-center bg-[#232F3E] px-4 py-2 text-[0.9rem] font-semibold text-white">
        <div ref={categoryRef} className="relative mr-3">
          <button
            type="button"
            className="flex max-w-[160px] items-center gap-2 rounded border border-white/40 bg-transparent px-2 py-1 text-[0.85rem] font-semibold text-white transition hover:border-white"
            onClick={() => {
              setCategoryOpen((prev) => !prev)
              setDesktopAreaOpen(false)
              setMobileAreaOpen(false)
            }}
          >
            <span className="truncate">{selectedCategoryLabel}</span>
            <FaChevronDown
              className={`shrink-0 text-[0.7rem] transition ${
                categoryOpen ? "rotate-180" : ""
              }`}
            />
          </button>

          <div
            className={`absolute left-0 top-[calc(100%+8px)] z-[3000] w-[260px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl transition-all duration-200 ${
              categoryOpen
                ? "pointer-events-auto translate-y-0 opacity-100"
                : "pointer-events-none -translate-y-2 opacity-0"
            }`}
          >
            <div className="max-h-[280px] overflow-y-auto py-2">
              <button
                type="button"
                className={`flex items-center gap-3 w-full px-4 py-3 text-left text-sm font-medium transition hover:bg-slate-50 ${
                  categoryFilter === "all"
                    ? "bg-pink-50 text-pink-700"
                    : "text-slate-700"
                }`}
                onClick={() => selectCategory("all")}
              >
                <span className={`h-[6px] w-[6px] rounded-full ${categoryFilter === "all" ? "bg-pink-600" : "bg-slate-300"}`}></span>
                All Categories
              </button>

              {(categories || []).map((category) => (
                <button
                  key={category.id || category.name}
                  type="button"
                  className={`flex items-center gap-3 w-full px-4 py-3 text-left text-sm font-medium transition hover:bg-slate-50 ${
                    categoryFilter === category.name
                      ? "bg-pink-50 text-pink-700"
                      : "text-slate-700"
                  }`}
                  onClick={() => selectCategory(category.name)}
                >
                  <span className={`h-[6px] w-[6px] rounded-full shrink-0 ${categoryFilter === category.name ? "bg-pink-600" : "bg-slate-300"}`}></span>
                  <span className="truncate">{category.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {tickerText ? (
          <div className="ticker-wrapper relative flex flex-1 items-center gap-3 overflow-hidden">
            <div
              className="ticker-content whitespace-nowrap pl-[100%] text-white"
              style={{
                animation: `ticker ${Math.max(
                  40,
                  tickerText.length * 0.4
                )}s linear infinite`,
              }}
            >
              {tickerText}
            </div>
          </div>
        ) : null}
      </div>
    </header>
  )
}

export default DashboardHeader