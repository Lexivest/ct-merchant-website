import React, { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import {
  FaArrowLeft,
  FaCircleNotch,
  FaEnvelope,
  FaEnvelopeOpenText,
  FaReply,
  FaShieldHalved,
  FaTriangleExclamation,
  FaCheckDouble,
  FaUsersViewfinder,
} from "react-icons/fa6";
import usePreventPullToRefresh from "../../hooks/usePreventPullToRefresh";
import { useGlobalFeedback } from "../../components/common/GlobalFeedbackProvider";
import {
  QuickActionButton,
  SectionHeading,
  StaffPortalShell,
  formatDateTime,
  useStaffPortalSession
} from "./StaffPortalShared"

export default function StaffInbox() {
  const location = useLocation();
  const { isSuperAdmin, staffCityId, fetchingStaff } = useStaffPortalSession()
  const navigate = useNavigate();
  const { notify } = useGlobalFeedback();
  const prefetchedData =
    location.state?.prefetchedData?.kind === "staff-inbox"
      ? location.state.prefetchedData
      : null
  usePreventPullToRefresh();

  const [activeTab, setActiveTab] = useState(() => prefetchedData?.activeTab || "contact"); 
  const [loading, setLoading] = useState(() => !prefetchedData && !fetchingStaff);
  const [items, setItems] = useState(() => prefetchedData?.items || []);
  const [selectedItem, setSelectedItem] = useState(null);
  const [updating, setUpdating] = useState(false);
  const [prefetchedReady, setPrefetchedReady] = useState(() => Boolean(prefetchedData));

  const fetchData = useCallback(async () => {
    if (prefetchedReady && prefetchedData && activeTab === prefetchedData.activeTab) {
      setItems(prefetchedData.items || [])
      setSelectedItem(null)
      setLoading(false)
      setPrefetchedReady(false)
      return
    }

    if (!fetchingStaff && !staffCityId && !isSuperAdmin) return

    setLoading(true);
    setSelectedItem(null);
    setItems([]); 

    try {
      if (activeTab === "contact") {
        const { data, error } = await supabase
          .from("contact_messages")
          .select("*")
          .order("created_at", { ascending: false });
        
        if (error) throw error;
        setItems((data || []).map(item => ({ ...item, _type: "contact" })));
      }

      if (activeTab === "newsletter") {
        const { data, error } = await supabase
          .from("newsletter_subscriptions")
          .select("*")
          .order("created_at", { ascending: false });
        
        if (error) throw error;
        setItems((data || []).map(item => ({ ...item, _type: "newsletter" })));
      }

      if (activeTab === "abuse") {
        const { data: reports, error: reportsErr } = await supabase
          .from("abuse_reports")
          .select("*")
          .order("created_at", { ascending: false })

        if (reportsErr) throw new Error(`Database Error: ${reportsErr.message}`);

        const safeReports = reports || []
        const reporterIds = [...new Set(safeReports.map((report) => report.reporter_id).filter(Boolean))]

        let profileMap = new Map()
        if (reporterIds.length > 0) {
          let profilesQuery = supabase
            .from("profiles")
            .select("id, full_name, city_id")
            .in("id", reporterIds)

          if (!isSuperAdmin && staffCityId) {
            profilesQuery = profilesQuery.eq("city_id", staffCityId)
          }

          const { data: profiles, error: profilesErr } = await profilesQuery
          if (profilesErr) throw new Error(`Database Error: ${profilesErr.message}`);

          profileMap = new Map((profiles || []).map((profile) => [profile.id, profile]))
        }

        const filteredReports =
          !isSuperAdmin && staffCityId
            ? safeReports.filter((report) => profileMap.has(report.reporter_id))
            : safeReports

        const fetchedAbuses = filteredReports.map(report => ({
          ...report,
          _type: "abuse",
          profiles: profileMap.get(report.reporter_id) || null,
        }));

        setItems(fetchedAbuses);
      }
    } catch (err) {
      console.error("Error fetching inbox:", err);
      notify({
        type: "error",
        title: "Something went wrong",
        message: "We could not load staff messages. Please retry.",
      });
    } finally {
      setLoading(false);
    }
  }, [activeTab, notify, isSuperAdmin, staffCityId, fetchingStaff, prefetchedData, prefetchedReady]);

  useEffect(() => {
    if (!fetchingStaff) {
      fetchData();
    }
  }, [activeTab, fetchData, fetchingStaff]);

  const updateStatus = async (id, newStatus, type) => {
    setUpdating(true);
    const table = 
      type === "contact" ? "contact_messages" : 
      type === "newsletter" ? "newsletter_subscriptions" :
      "abuse_reports";

    try {
      const { error } = await supabase
        .from(table)
        .update({ status: newStatus })
        .eq("id", id);
        
      if (error) throw error;

      setItems((prev) => prev.map((item) => (item.id === id ? { ...item, status: newStatus } : item)));
      if (selectedItem?.id === id) {
        setSelectedItem({ ...selectedItem, status: newStatus });
      }
    } catch (err) {
      console.error("Error updating status:", err);
      notify({
        type: "error",
        title: "Update failed",
        message: "We could not update this record status. Please retry.",
      });
    } finally {
      setUpdating(false);
    }
  };

  const handleReply = (email, subject) => {
    if (!email) {
      notify({
        type: "info",
        title: "Email unavailable",
        message: "This user email is private or not provided for this report.",
      });
      return;
    }
    const replySubject = encodeURIComponent(`Re: ${subject || "Your Inquiry to CTMerchant"}`);
    window.location.href = `mailto:${email}?subject=${replySubject}`;
  };

  const renderStatusBadge = (status) => {
    switch (status?.toLowerCase()) {
      case "active":
        return <span className="bg-emerald-100 text-emerald-800 text-[0.65rem] px-2 py-0.5 rounded-md font-black uppercase tracking-widest border border-emerald-200">Subscribed</span>;
      case "unsubscribed":
        return <span className="bg-rose-100 text-rose-800 text-[0.65rem] px-2 py-0.5 rounded-md font-black uppercase tracking-widest border border-rose-200">Unsubscribed</span>;
      case "unread":
      case "pending":
        return <span className="bg-amber-100 text-amber-800 text-[0.65rem] px-2 py-0.5 rounded-md font-black uppercase tracking-widest border border-amber-200">Needs Action</span>;
      case "read":
      case "in_progress":
        return <span className="bg-blue-100 text-blue-800 text-[0.65rem] px-2 py-0.5 rounded-md font-black uppercase tracking-widest border border-blue-200">Reviewed</span>;
      case "resolved":
      case "closed":
        return <span className="bg-emerald-100 text-emerald-800 text-[0.65rem] px-2 py-0.5 rounded-md font-black uppercase tracking-widest border border-emerald-200">Resolved</span>;
      default:
        return <span className="bg-slate-100 text-slate-600 text-[0.65rem] px-2 py-0.5 rounded-md font-black uppercase tracking-widest border border-slate-200">{status || "New"}</span>;
    }
  };

  return (
    <div className="flex h-[100dvh] flex-col bg-slate-50 font-sans">
      
      {/* HEADER */}
      <header className="flex flex-shrink-0 items-center justify-between border-b border-[#334155] bg-[#020617] px-4 py-4 sm:px-6 shadow-md z-10">
        <div className="flex items-center gap-3 sm:gap-4">
          <button onClick={() => navigate("/staff-dashboard")} className="text-xl text-white transition-colors hover:text-pink-500">
            <FaArrowLeft />
          </button>
          <div className="flex items-center gap-2 text-base sm:text-lg font-black tracking-wide text-white">
            <FaEnvelopeOpenText className="text-pink-500" /> SUPPORT INBOX
          </div>
        </div>
      </header>

      {/* TABS */}
      <div className="flex bg-white border-b border-slate-200 px-2 sm:px-6 shadow-sm overflow-x-auto custom-scrollbar flex-shrink-0">
        <button
          onClick={() => setActiveTab("contact")}
          className={`flex items-center gap-2 px-4 py-4 text-xs sm:text-sm font-bold transition-all whitespace-nowrap ${
            activeTab === "contact" ? "border-b-2 border-blue-600 text-blue-700" : "text-slate-500 hover:text-slate-800"
          }`}
        >
          <FaEnvelope /> Public Inquiries
        </button>
        <button
          onClick={() => setActiveTab("newsletter")}
          className={`flex items-center gap-2 px-4 py-4 text-xs sm:text-sm font-bold transition-all whitespace-nowrap ${
            activeTab === "newsletter" ? "border-b-2 border-emerald-600 text-emerald-700" : "text-slate-500 hover:text-slate-800"
          }`}
        >
          <FaUsersViewfinder /> Newsletter
        </button>
        <button
          onClick={() => setActiveTab("abuse")}
          className={`flex items-center gap-2 px-4 py-4 text-xs sm:text-sm font-bold transition-all whitespace-nowrap ${
            activeTab === "abuse" ? "border-b-2 border-rose-600 text-rose-700" : "text-slate-500 hover:text-slate-800"
          }`}
        >
          <FaShieldHalved /> Abuse Reports
        </button>
      </div>

      {/* MAIN SPLIT VIEW */}
      <div className="flex flex-1 overflow-hidden relative">
        
        {/* LEFT: TICKET LIST */}
        <div className={`w-full lg:w-1/3 flex-shrink-0 border-r border-slate-200 bg-white overflow-y-auto custom-scrollbar absolute inset-0 lg:relative z-10 transition-transform duration-300 ${selectedItem ? "-translate-x-full lg:translate-x-0" : "translate-x-0"}`}>
          {loading ? (
            <div className="flex h-40 items-center justify-center">
              <FaCircleNotch className="animate-spin text-2xl text-indigo-500" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex h-40 flex-col items-center justify-center text-slate-400">
              <FaCheckDouble className="text-4xl mb-2 opacity-50" />
              <p className="text-sm font-bold">Inbox is empty</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {items.map((item) => {
                const isContact = activeTab === "contact";
                const isSelected = selectedItem?.id === item.id;
                
                return (
                  <div
                    key={item.id}
                    onClick={() => setSelectedItem(item)}
                    className={`cursor-pointer p-4 transition-all border-l-4 ${
                      isSelected 
                        ? (activeTab === "contact" ? "bg-blue-50 border-blue-600 hidden lg:block" : activeTab === "newsletter" ? "bg-emerald-50 border-emerald-600 hidden lg:block" : "bg-rose-50 border-rose-600 hidden lg:block") 
                        : (activeTab === "contact" ? "hover:bg-blue-50/50 border-transparent" : activeTab === "newsletter" ? "hover:bg-emerald-50/50 border-transparent" : "hover:bg-rose-50/50 border-transparent")
                    }`}
                  >
                    {/* EXPLICIT TYPE BADGE */}
                    <div className="flex justify-between items-start mb-2">
                      <span className={`flex items-center gap-1.5 text-[0.6rem] font-black uppercase tracking-widest ${activeTab === "contact" ? 'text-blue-600' : activeTab === "newsletter" ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {activeTab === "contact" ? <FaEnvelope /> : activeTab === "newsletter" ? <FaUsersViewfinder /> : <FaShieldHalved />}
                        {activeTab === "contact" ? 'Public Inquiry' : activeTab === "newsletter" ? 'Newsletter Subscriber' : 'Abuse Report'}
                      </span>
                      {renderStatusBadge(item.status)}
                    </div>

                    <h4 className="font-bold text-slate-900 line-clamp-1 pr-2 text-sm mb-1">
                      {item.full_name || item.profiles?.full_name || "Unknown Identity"}
                    </h4>
                    
                    <p className={`text-xs font-semibold mb-1.5 line-clamp-1 ${activeTab === "contact" ? 'text-slate-700' : activeTab === "newsletter" ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {activeTab === "contact" ? item.subject : activeTab === "newsletter" ? `Email: ${item.email}` : `Category: ${item.category}`}
                    </p>
                    
                    <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                      {isContact ? item.message : item.details}
                    </p>
                    
                    <p className="text-[0.65rem] font-bold text-slate-400 mt-2 uppercase tracking-wider">
                      {new Date(item.created_at).toLocaleDateString()} • {new Date(item.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* RIGHT: TICKET DETAILS (Mobile Overlay & Desktop Pane) */}
        <div className={`w-full lg:flex-1 flex flex-col bg-slate-50 overflow-y-auto custom-scrollbar absolute inset-0 lg:relative z-20 transition-transform duration-300 ${selectedItem ? "translate-x-0" : "translate-x-full lg:translate-x-0 lg:flex"}`}>
          {selectedItem ? (
            <div className="p-4 sm:p-8 max-w-3xl mx-auto w-full pb-20 lg:pb-8">
              
              {/* Mobile Back Button */}
              <button 
                onClick={() => setSelectedItem(null)}
                className="lg:hidden mb-4 flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-800"
              >
                <FaArrowLeft /> Back to list
              </button>

              {/* EXPLICIT CONTEXT BANNER */}
              <div className={`rounded-xl p-4 mb-4 sm:mb-6 shadow-sm border flex items-center gap-3 ${
                activeTab === "contact" 
                  ? "bg-blue-50 border-blue-200 text-blue-800" 
                  : activeTab === "newsletter"
                  ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                  : "bg-rose-50 border-rose-200 text-rose-800"
              }`}>
                {activeTab === "contact" ? <FaEnvelope className="text-xl sm:text-2xl flex-shrink-0" /> : activeTab === "newsletter" ? <FaUsersViewfinder className="text-xl sm:text-2xl flex-shrink-0" /> : <FaShieldHalved className="text-xl sm:text-2xl flex-shrink-0" />}
                <div>
                  <h3 className="text-xs sm:text-sm font-black uppercase tracking-widest">
                    {activeTab === "contact" ? "Standard Public Inquiry" : activeTab === "newsletter" ? "Newsletter Subscriber" : "Critical Abuse Report"}
                  </h3>
                  <p className="text-[0.65rem] sm:text-xs font-medium opacity-80 mt-0.5">
                    {activeTab === "contact" ? "Respond via email if applicable." : activeTab === "newsletter" ? "Manage email recipient list." : "Review carefully before taking moderation action."}
                  </p>
                </div>
              </div>

              {/* Header Info */}
              <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-slate-200 mb-4 sm:mb-6">
                <div className="flex flex-col sm:flex-row justify-between items-start mb-6 border-b border-slate-100 pb-4 sm:pb-6 gap-3">
                  <div className="w-full">
                    <div className="flex justify-between items-start mb-2">
                      <h2 className="text-lg sm:text-2xl font-black text-slate-900 pr-2">
                        {activeTab === "contact" ? selectedItem.subject : activeTab === "newsletter" ? "Subscription Details" : `Violation: ${selectedItem.category}`}
                      </h2>
                      <div className="sm:hidden flex-shrink-0">{renderStatusBadge(selectedItem.status)}</div>
                    </div>
                    
                    <div className="flex flex-col gap-1.5 text-xs sm:text-sm mt-3">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-slate-400 uppercase tracking-wider text-[0.65rem] sm:text-xs w-12 sm:w-16 flex-shrink-0">From:</span>
                        <span className="font-bold text-slate-800 truncate">
                          {selectedItem.full_name || selectedItem.profiles?.full_name || "Unknown Identity"}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <span className="font-black text-slate-400 uppercase tracking-wider text-[0.65rem] sm:text-xs w-12 sm:w-16 flex-shrink-0">Email:</span>
                        <a 
                          href={`mailto:${activeTab === "contact" ? selectedItem.email : activeTab === "newsletter" ? selectedItem.email : selectedItem.reporter_email}`} 
                          className="font-bold text-blue-600 hover:underline truncate"
                        >
                          {activeTab === "contact" ? selectedItem.email : activeTab === "newsletter" ? selectedItem.email : selectedItem.reporter_email}
                        </a>
                      </div>
                    </div>
                  </div>
                  <div className="hidden sm:block flex-shrink-0">{renderStatusBadge(selectedItem.status)}</div>
                </div>

                {activeTab === "abuse" && selectedItem.target_name && (
                  <div className="mb-6 bg-red-600 text-white p-3 sm:p-4 rounded-xl shadow-inner flex items-center gap-3">
                     <FaTriangleExclamation className="text-2xl text-red-200 flex-shrink-0" /> 
                     <div className="min-w-0">
                       <p className="text-[0.6rem] sm:text-[0.65rem] font-black uppercase tracking-widest text-red-200">Reported Target</p>
                       <p className="text-sm sm:text-base font-bold truncate">{selectedItem.target_name}</p>
                     </div>
                  </div>
                )}

                {/* The Message Body */}
                <div className="relative mt-2">
                  <span className="absolute -top-2.5 left-4 bg-white px-2 text-[0.6rem] sm:text-[0.65rem] font-black uppercase tracking-widest text-slate-400">
                    {activeTab === "newsletter" ? "Subscription Info" : "Message Payload"}
                  </span>
                  <div className="text-sm sm:text-base text-slate-700 whitespace-pre-wrap bg-slate-50/50 p-4 sm:p-6 pt-5 rounded-xl border border-slate-200 leading-relaxed font-medium">
                    {activeTab === "contact" ? selectedItem.message : activeTab === "newsletter" ? `Subscriber since ${new Date(selectedItem.created_at).toLocaleString()}` : selectedItem.details}
                  </div>
                </div>
              </div>

              {/* Action Bar - Sticks to bottom on mobile */}
              <div className="fixed bottom-0 left-0 right-0 lg:relative lg:bottom-auto lg:left-auto lg:right-auto bg-white lg:rounded-2xl p-4 shadow-[0_-4px_10px_rgba(0,0,0,0.05)] lg:shadow-sm border-t lg:border border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-0 z-30">
                <div className="flex gap-2 w-full sm:w-auto">
                  {activeTab === "newsletter" ? (
                    <button
                      onClick={() => updateStatus(selectedItem.id, selectedItem.status === "active" ? "unsubscribed" : "active", activeTab)}
                      disabled={updating}
                      className={`flex-1 sm:flex-none px-3 sm:px-5 py-2 sm:py-2.5 rounded-lg text-[0.65rem] sm:text-xs font-black uppercase tracking-widest transition disabled:opacity-50 text-center ${
                        selectedItem.status === "active" ? "bg-rose-50 text-rose-700 border border-rose-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      }`}
                    >
                      {selectedItem.status === "active" ? "Unsubscribe User" : "Re-activate Subscription"}
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => updateStatus(selectedItem.id, activeTab === "contact" ? "read" : "in_progress", activeTab)}
                        disabled={updating}
                        className="flex-1 sm:flex-none px-3 sm:px-5 py-2 sm:py-2.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg text-[0.65rem] sm:text-xs font-black uppercase tracking-widest transition disabled:opacity-50 text-center"
                      >
                        Review
                      </button>
                      <button
                        onClick={() => updateStatus(selectedItem.id, "resolved", activeTab)}
                        disabled={updating}
                        className="flex-1 sm:flex-none px-3 sm:px-5 py-2 sm:py-2.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-lg text-[0.65rem] sm:text-xs font-black uppercase tracking-widest transition disabled:opacity-50 text-center"
                      >
                        Resolve
                      </button>
                    </>
                  )}
                </div>

                <button
                  onClick={() => handleReply(
                    activeTab === "contact" ? selectedItem.email : activeTab === "newsletter" ? selectedItem.email : selectedItem.reporter_email,
                    activeTab === "contact" ? selectedItem.subject : activeTab === "newsletter" ? "About your CTMerchant Subscription" : `Regarding your Abuse Report`
                  )}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 bg-[#0f172a] text-white hover:bg-[#1e293b] rounded-lg text-[0.7rem] sm:text-xs font-black uppercase tracking-widest shadow-md transition"
                >
                  <FaReply /> {activeTab === "newsletter" ? "Contact Subscriber" : "Reply directly"}
                </button>
              </div>

            </div>
          ) : (
            <div className="hidden lg:flex h-full flex-col items-center justify-center text-slate-300">
              <FaEnvelopeOpenText className="text-7xl mb-4 opacity-30" />
              <p className="text-lg font-bold text-slate-400">Select a ticket to view details</p>
            </div>
          )}
        </div>
      </div>
      
      {/* Scrollbar Styles */}
      <style dangerouslySetOrigin={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
        @media (min-width: 1024px) {
          .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
      `}} />
    </div>
  );
}
