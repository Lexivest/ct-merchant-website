import {
  FaArrowDownAZ,
  FaBell,
  FaBox,
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

  function renderSuggestionIcon(icon) {
    if (icon === "product") return <FaBox />
    return <FaStore />
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
          <div className="amz-search-block flex h-[42px] w-full overflow-hidden rounded-md border-[3px] border-transparent bg-white transition focus-within:border-pink-600">
            <select
              className="amz-search-select max-w-[140px] cursor-pointer border-none border-r border-r-[#CDD2D3] bg-[#F3F4F6] px-3 text-[0.85rem] font-semibold text-[#555] outline-none hover:bg-[#DADADA] hover:text-[#0F1111]"
              value={searchArea}
              onChange={(e) => setSearchArea(e.target.value)}
            >
              <option value="all">All Areas</option>
              {sortedAreas.map((area) => (
                <option key={area.id} value={area.id}>
                  {area.name}
                </option>
              ))}
            </select>

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
          <span className="mobile-hide hidden min-[1025px]:inline">Repository</span>
        </div>

        <div
          className={`amz-nav-item ${
            activeTab === "services" ? "active" : ""
          } flex cursor-pointer items-center gap-[6px] rounded border border-transparent px-3 py-2 text-[0.95rem] font-bold text-white transition hover:border-white`}
          onClick={() => switchScreen("services")}
          title="Dashboard"
        >
          <FaTableCellsLarge className="text-[1.1rem]" />
          <span className="mobile-hide hidden min-[1025px]:inline">Dashboard</span>
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
        <div className="amz-search-block flex h-[42px] w-full overflow-hidden rounded-md border-[3px] border-transparent bg-white transition focus-within:border-pink-600">
          <select
            className="amz-search-select max-w-[100px] cursor-pointer border-none border-r border-r-[#CDD2D3] bg-[#F3F4F6] px-2 text-[0.85rem] font-semibold text-[#555] outline-none"
            value={searchArea}
            onChange={(e) => setSearchArea(e.target.value)}
          >
            <option value="all">All Areas</option>
            {sortedAreas.map((area) => (
              <option key={area.id} value={area.id}>
                {area.name}
              </option>
            ))}
          </select>

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
        <select
          className="amz-category-filter mr-3 max-w-[130px] cursor-pointer rounded border border-white/40 bg-transparent px-2 py-1 text-[0.85rem] font-semibold text-white outline-none hover:border-white"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          <option value="all">All Categories</option>
          {(categories || []).map((category) => (
            <option key={category.id || category.name} value={category.name}>
              {category.name}
            </option>
          ))}
        </select>

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