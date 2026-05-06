import { useEffect, useMemo, useRef, useState } from "react"
import {
  FaArrowDownAZ,
  FaBell,
  FaBox,
  FaBullhorn,
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
  sortedAreas = [],
  categories = [],
  shops = [],
  products = [],
  searchArea = "all",
  setSearchArea,
  categoryFilter = "all",
  setCategoryFilter,
  searchInputDesktop = "",
  setSearchInputDesktop,
  searchInputMobile = "",
  setSearchInputMobile,
  searchSuggestionsDesktop = [],
  searchSuggestionsMobile = [],
  updateSuggestions,
  executeSearch,
  applySuggestion,
  switchScreen,
  unread = 0,
  onShopIndex,
  announcementsCount = 0,
  onOpenAnnouncements,
}) {
  const avatarSrc =
    currentProfile?.avatar_url ||
    `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
      currentProfile?.full_name || user?.email || "User"
    )}`
  const fallbackAvatarSrc = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
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

  const dropdownImages = useMemo(() => {
    const shopMetaById = new Map(
      (shops || []).map((shop) => [
        shop.id,
        {
          areaId: shop.area_id,
          category: shop.category,
        },
      ])
    )
    const areaImageById = new Map()
    const categoryImageByName = new Map()

    ;(products || []).forEach((product) => {
      if (!product?.shop_id || !product?.image_url) return

      const shopMeta = shopMetaById.get(product.shop_id)
      if (!shopMeta) return

      if (shopMeta.areaId && !areaImageById.has(String(shopMeta.areaId))) {
        areaImageById.set(String(shopMeta.areaId), product.image_url)
      }

      if (shopMeta.category && !categoryImageByName.has(shopMeta.category)) {
        categoryImageByName.set(shopMeta.category, product.image_url)
      }
    })

    return { areaImageById, categoryImageByName }
  }, [products, shops])

  const cityName = useMemo(() => {
    let name = currentProfile?.city_name
    if (currentProfile?.cities) {
      name = Array.isArray(currentProfile.cities)
        ? currentProfile.cities[0]?.name
        : currentProfile.cities.name
    }
    return name || ""
  }, [currentProfile])

  const searchPlaceholder = useMemo(() => {
    if (cityName) {
      return `Search ${cityName} biz hub`
    }
    return `Search your city biz hub`
  }, [cityName])

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

  function renderDropdownMarker({ imageUrl, active }) {
    if (imageUrl) {
      return (
        <span className="h-8 w-8 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
          <img
            src={imageUrl}
            alt=""
            className="h-full w-full object-contain"
            loading="lazy"
          />
        </span>
      )
    }

    return (
      <span
        className={`h-[6px] w-[6px] shrink-0 rounded-full ${
          active ? "bg-pink-600" : "bg-slate-300"
        }`}
      />
    )
  }

  function renderNavControls() {
    return (
      <nav className="flex shrink-0 items-center gap-0 sm:gap-1" aria-label="Dashboard navigation">
        <button
          type="button"
          className={`amz-nav-item ${
            activeTab === "market" ? "active" : ""
          } flex h-[30px] w-[30px] items-center justify-center gap-[6px] rounded border border-transparent px-0 text-[0.9rem] font-bold text-white transition hover:border-white sm:h-[32px] sm:w-auto sm:px-3`}
          onClick={() => switchScreen("market")}
          title="Repository"
        >
          <FaHouse className="text-[1.05rem]" />
          <span className="hidden min-[900px]:inline">Repository</span>
        </button>

        <button
          type="button"
          className={`amz-nav-item ${
            activeTab === "services" ? "active" : ""
          } flex h-[30px] w-[30px] items-center justify-center gap-[6px] rounded border border-transparent px-0 text-[0.9rem] font-bold text-white transition hover:border-white sm:h-[32px] sm:w-auto sm:px-3`}
          onClick={() => switchScreen("services")}
          title="Dashboard"
        >
          <FaTableCellsLarge className="text-[1.05rem]" />
          <span className="hidden min-[900px]:inline">Dashboard</span>
        </button>

        <button
          type="button"
          className={`amz-nav-item ${
            activeTab === "notifications" ? "active" : ""
          } relative flex h-[32px] w-[34px] items-center justify-center gap-[8px] rounded-[12px] border px-0 text-[0.9rem] font-bold text-white transition sm:h-[36px] sm:w-auto sm:px-3 ${
            unread > 0
              ? "border-white/20 bg-white/10 shadow-[0_8px_20px_rgba(0,0,0,0.18)]"
              : "border-transparent"
          } hover:border-white`}
          onClick={() => switchScreen("notifications")}
          title="Alerts"
        >
          <span className="relative flex h-7 w-7 items-center justify-center rounded-full bg-white/12">
            <FaBell className="text-[1rem]" />
            {unread > 0 ? (
              <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-[#F59E0B] ring-2 ring-[#131921]" />
            ) : null}
          </span>
          <span className="hidden min-[900px]:inline">Alerts</span>
          {unread > 0 ? (
            <span className="notif-badge absolute -right-[6px] -top-[4px] block rounded-full border-2 border-[#232F3E] bg-[#EF4444] px-[6px] py-[2px] text-[0.65rem] font-extrabold text-white shadow-lg">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </button>

        <button
          type="button"
          className={`amz-nav-item ${
            activeTab === "profile" ? "active" : ""
          } flex h-[30px] w-[32px] items-center justify-center rounded border border-transparent px-0 text-white transition hover:border-white sm:h-[32px] sm:w-auto sm:px-2`}
          onClick={() => switchScreen("profile")}
          title="Profile"
        >
          <img
            src={avatarSrc}
            className="header-avatar h-[28px] w-[28px] rounded-full bg-white object-cover"
            alt="Avatar"
            onError={(event) => {
              event.currentTarget.onerror = null
              event.currentTarget.src = fallbackAvatarSrc
            }}
          />
        </button>

        <button
          type="button"
          className="amz-nav-item flex h-[30px] w-[30px] items-center justify-center rounded border border-transparent px-0 text-white transition hover:border-white sm:h-[32px] sm:w-auto sm:px-2.5"
          onClick={onShopIndex}
          title="Shop Index"
        >
          <FaArrowDownAZ className="text-[1.05rem]" />
        </button>
      </nav>
    )
  }

  return (
    <header className="amz-header sticky top-0 z-[1000] flex flex-col bg-[#131921] text-white">
      <style>
        {`
          @keyframes ctm-search-placeholder-scroll {
            0%, 16% { transform: translateX(0); }
            82%, 100% { transform: translateX(calc(-100% + var(--ctm-search-placeholder-width, 100%))); }
          }

          .ctm-search-placeholder-track {
            animation: ctm-search-placeholder-scroll 9s ease-in-out infinite;
            will-change: transform;
          }

          @media (min-width: 1025px) {
            .ctm-search-placeholder-track {
              animation-duration: 12s;
            }
          }
        `}
      </style>
      <div className="amz-mobile-scroll-row hidden w-full items-center gap-0 px-0 py-0 min-[1025px]:flex">
        <div className="amz-location mobile-hide hidden items-center gap-[6px] rounded border border-transparent px-3 py-2 text-[0.95rem] font-bold text-white transition hover:border-white min-[1025px]:flex">
          <FaLocationDot />
          <span>{cityName || "..."}</span>
        </div>

        <div className="desktop-search-wrap mobile-hide relative mx-0 hidden flex-1 min-[1025px]:block">
          <div className="amz-search-block flex h-[42px] w-full overflow-visible border-[3px] border-transparent bg-white transition focus-within:border-pink-600">
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
                    {renderDropdownMarker({ active: searchArea === "all" })}
                    All Areas
                  </button>

                  {sortedAreas.map((area) => {
                    const isActive = String(searchArea) === String(area.id)
                    return (
                      <button
                        key={area.id}
                        type="button"
                        className={`flex items-center gap-3 w-full px-4 py-2.5 text-left text-sm font-medium transition hover:bg-slate-50 ${
                          isActive
                            ? "bg-pink-50 text-pink-700"
                            : "text-slate-700"
                        }`}
                        onClick={() => selectArea(String(area.id))}
                      >
                        {renderDropdownMarker({
                          imageUrl: dropdownImages.areaImageById.get(String(area.id)),
                          active: isActive,
                        })}
                        <span className="truncate">{area.name}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            <div
              className="relative flex h-full min-w-0 flex-1 items-center overflow-hidden"
              style={{ "--ctm-search-placeholder-width": "calc(100vw - 280px)" }}
            >
              {!searchInputDesktop ? (
                <div className="pointer-events-none absolute inset-y-0 left-4 right-4 z-0 flex items-center overflow-hidden">
                  <span className="whitespace-nowrap text-[1rem] font-bold text-slate-400">
                    {searchPlaceholder}
                  </span>
                </div>
              ) : null}
              <input
                className="amz-search-input relative z-[1] h-full min-w-0 w-full border-none bg-transparent px-4 text-base font-semibold text-[#0F1111] outline-none"
                placeholder=""
                value={searchInputDesktop}
                onChange={(e) => {
                  setSearchInputDesktop(e.target.value)
                  updateSuggestions(e.target.value, "desktop")
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") executeSearch("desktop")
                }}
              />
            </div>

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

      </div>

      <div className="mobile-search-wrap relative mx-0 mb-0 block w-full min-[1025px]:hidden">
        <div className="amz-search-block flex h-[42px] w-full overflow-visible border-[3px] border-transparent bg-white transition focus-within:border-pink-600">
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
                  {renderDropdownMarker({ active: searchArea === "all" })}
                  All Areas
                </button>

                {sortedAreas.map((area) => {
                  const isActive = String(searchArea) === String(area.id)
                  return (
                    <button
                      key={area.id}
                      type="button"
                      className={`flex items-center gap-3 w-full px-4 py-2.5 text-left text-sm font-medium transition hover:bg-slate-50 ${
                        isActive
                          ? "bg-pink-50 text-pink-700"
                          : "text-slate-700"
                      }`}
                      onClick={() => selectArea(String(area.id))}
                    >
                      {renderDropdownMarker({
                        imageUrl: dropdownImages.areaImageById.get(String(area.id)),
                        active: isActive,
                      })}
                      <span className="truncate">{area.name}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          <div
            className="relative flex h-full min-w-0 flex-1 items-center overflow-hidden"
            style={{ "--ctm-search-placeholder-width": "calc(100vw - 176px)" }}
          >
            {!searchInputMobile ? (
              <div className="pointer-events-none absolute inset-y-0 left-3 right-3 z-0 flex items-center overflow-hidden">
                <span className="whitespace-nowrap text-[0.86rem] font-bold text-slate-400 min-[390px]:text-[0.92rem]">
                  {searchPlaceholder}
                </span>
              </div>
            ) : null}
            <input
              className="amz-search-input relative z-[1] h-full min-w-0 w-full border-none bg-transparent px-3 text-[0.95rem] font-semibold text-[#0F1111] outline-none"
              placeholder=""
              value={searchInputMobile}
              onChange={(e) => {
                setSearchInputMobile(e.target.value)
                updateSuggestions(e.target.value, "mobile")
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") executeSearch("mobile")
              }}
            />
          </div>

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

      <div className="amz-sub-header flex h-[42px] items-center gap-1 bg-[#232F3E] px-0 py-0 text-[0.9rem] font-semibold text-white sm:gap-2">
        <div ref={categoryRef} className="relative shrink-0 self-stretch">
          <button
            type="button"
            className="flex h-full w-[148px] items-center gap-1.5 border-r border-r-white/15 bg-[#232F3E] px-3 text-[0.82rem] font-semibold text-white transition hover:bg-[#1B2735] min-[390px]:w-[156px] sm:w-auto sm:max-w-[190px] sm:gap-2 sm:px-3 sm:text-[0.85rem]"
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
            className={`absolute left-0 top-[calc(100%+8px)] z-[3000] w-[260px] overflow-hidden rounded-r-xl border border-l-0 border-slate-200 bg-white shadow-2xl transition-all duration-200 ${
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
                {renderDropdownMarker({ active: categoryFilter === "all" })}
                All Categories
              </button>

              {(categories || []).map((category) => {
                const isActive = categoryFilter === category.name
                return (
                  <button
                    key={category.id || category.name}
                    type="button"
                    className={`flex items-center gap-3 w-full px-4 py-2.5 text-left text-sm font-medium transition hover:bg-slate-50 ${
                      isActive
                        ? "bg-pink-50 text-pink-700"
                        : "text-slate-700"
                    }`}
                    onClick={() => selectCategory(category.name)}
                  >
                    {renderDropdownMarker({
                      imageUrl: dropdownImages.categoryImageByName.get(category.name),
                      active: isActive,
                    })}
                    <span className="truncate">{category.name}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <button
          type="button"
          className="relative flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded border border-transparent px-0 text-white transition hover:border-white sm:h-[32px] sm:w-auto sm:px-2"
          onClick={onOpenAnnouncements}
          title="Announcements"
          aria-label="Open announcements"
        >
          <FaBullhorn className="text-[1.02rem]" />
          {announcementsCount > 0 ? (
            <span className="absolute -right-[5px] -top-[3px] rounded-[10px] border-2 border-[#232F3E] bg-pink-600 px-[5px] py-[1px] text-[0.6rem] font-extrabold leading-none text-white">
              {announcementsCount > 9 ? "9+" : announcementsCount}
            </span>
          ) : null}
        </button>

        {renderNavControls()}
        <div className="min-w-0 flex-1" />
      </div>
    </header>
  )
}

export default DashboardHeader
