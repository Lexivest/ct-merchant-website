import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
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
} from "react-icons/fa6";
import usePreventPullToRefresh from "../../hooks/usePreventPullToRefresh";

export default function StaffInbox() {
  const navigate = useNavigate();
  usePreventPullToRefresh();

  const [activeTab, setActiveTab] = useState("contact"); // 'contact' | 'abuse'
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const fetchData = async () => {
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

      if (activeTab === "abuse") {
        const { data: reports, error: reportsErr } = await supabase
          .from("abuse_reports")
          .select("*")
          .order("created_at", { ascending: false });
          
        if (reportsErr) throw new Error(`Database Error: ${reportsErr.message}`);

        if (reports && reports.length > 0) {
          const reporterIds = [...new Set(reports.map(r => r.reporter_id).filter(Boolean))];
          let profilesMap = {};
          
          if (reporterIds.length > 0) {
            const { data: profiles, error: profErr } = await supabase
              .from("profiles")
              .select("id, full_name") 
              .in("id", reporterIds);
              
            if (!profErr && profiles) {
              profiles.forEach(p => { profilesMap[p.id] = p; });
            }
          }

          const fetchedAbuses = reports.map(report => ({
            ...report,
            _type: "abuse",
            profiles: profilesMap[report.reporter_id] || null
          }));
          
          setItems(fetchedAbuses);
        }
      }
    } catch (err) {
      console.error("Error fetching inbox:", err);
      alert("Failed to load messages. Check console for details.");
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (id, newStatus, type) => {
    setUpdating(true);
    const table = type === "contact" ? "contact_messages" : "abuse_reports";
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
      alert("Failed to update status.");
    } finally {
      setUpdating(false);
    }
  };

  const handleReply = (email, subject) => {
    if (!email) {
      alert("User email is private or not provided for this specific report.");
      return;
    }
    const replySubject = encodeURIComponent(`Re: ${subject || "Your Inquiry to CTMerchant"}`);
    window.location.href = `mailto:${email}?subject=${replySubject}`;
  };

  const renderStatusBadge = (status) => {
    switch (status?.toLowerCase()) {
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
    <div className="flex h-screen flex-col bg-slate-50 font-sans">
      
      {/* HEADER */}
      <header className="flex flex-shrink-0 items-center justify-between border-b border-[#334155] bg-[#020617] px-6 py-4 shadow-md z-10">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate("/staff-dashboard")} className="text-xl text-white transition-colors hover:text-pink-500">
            <FaArrowLeft />
          </button>
          <div className="flex items-center gap-2 text-lg font-black tracking-wide text-white">
            <FaEnvelopeOpenText className="text-pink-500" /> SUPPORT INBOX
          </div>
        </div>
      </header>

      {/* TABS */}
      <div className="flex bg-white border-b border-slate-200 px-6 shadow-sm overflow-x-auto custom-scrollbar">
        <button
          onClick={() => setActiveTab("contact")}
          className={`flex items-center gap-2 px-6 py-4 text-sm font-bold transition-all whitespace-nowrap ${
            activeTab === "contact" ? "border-b-2 border-blue-600 text-blue-700" : "text-slate-500 hover:text-slate-800"
          }`}
        >
          <FaEnvelope /> Public Inquiries
        </button>
        <button
          onClick={() => setActiveTab("abuse")}
          className={`flex items-center gap-2 px-6 py-4 text-sm font-bold transition-all whitespace-nowrap ${
            activeTab === "abuse" ? "border-b-2 border-rose-600 text-rose-700" : "text-slate-500 hover:text-slate-800"
          }`}
        >
          <FaShieldHalved /> Abuse Reports
        </button>
      </div>

      {/* MAIN SPLIT VIEW */}
      <div className="flex flex-1 overflow-hidden">
        
        {/* LEFT: TICKET LIST */}
        <div className="w-full lg:w-1/3 flex-shrink-0 border-r border-slate-200 bg-white overflow-y-auto custom-scrollbar">
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
                        ? (isContact ? "bg-blue-50 border-blue-600" : "bg-rose-50 border-rose-600") 
                        : (isContact ? "hover:bg-blue-50/50 border-transparent" : "hover:bg-rose-50/50 border-transparent")
                    }`}
                  >
                    {/* EXPLICIT TYPE BADGE */}
                    <div className="flex justify-between items-start mb-2">
                      <span className={`flex items-center gap-1.5 text-[0.6rem] font-black uppercase tracking-widest ${isContact ? 'text-blue-600' : 'text-rose-600'}`}>
                        {isContact ? <FaEnvelope /> : <FaShieldHalved />}
                        {isContact ? 'Public Inquiry' : 'Abuse Report'}
                      </span>
                      {renderStatusBadge(item.status)}
                    </div>

                    <h4 className="font-bold text-slate-900 line-clamp-1 pr-2 text-sm mb-1">
                      {isContact ? item.full_name : item.profiles?.full_name || "Unknown Reporter"}
                    </h4>
                    
                    <p className={`text-xs font-semibold mb-1.5 line-clamp-1 ${isContact ? 'text-slate-700' : 'text-rose-700'}`}>
                      {isContact ? item.subject : `Category: ${item.category}`}
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

        {/* RIGHT: TICKET DETAILS */}
        <div className="hidden lg:flex flex-1 flex-col bg-slate-50 overflow-y-auto custom-scrollbar relative">
          {selectedItem ? (
            <div className="p-8 max-w-3xl mx-auto w-full">
              
              {/* EXPLICIT CONTEXT BANNER */}
              <div className={`rounded-xl p-4 mb-6 shadow-sm border flex items-center gap-3 ${
                activeTab === "contact" 
                  ? "bg-blue-50 border-blue-200 text-blue-800" 
                  : "bg-rose-50 border-rose-200 text-rose-800"
              }`}>
                {activeTab === "contact" ? <FaEnvelope className="text-2xl" /> : <FaShieldHalved className="text-2xl" />}
                <div>
                  <h3 className="text-sm font-black uppercase tracking-widest">
                    {activeTab === "contact" ? "Standard Public Inquiry" : "Critical Abuse Report"}
                  </h3>
                  <p className="text-xs font-medium opacity-80">
                    {activeTab === "contact" ? "Respond via email if applicable." : "Review details carefully before taking moderation action."}
                  </p>
                </div>
              </div>

              {/* Header Info */}
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 mb-6">
                <div className="flex justify-between items-start mb-6 border-b border-slate-100 pb-6">
                  <div>
                    <h2 className="text-2xl font-black text-slate-900 mb-2">
                      {activeTab === "contact" ? selectedItem.subject : `Violation Category: ${selectedItem.category}`}
                    </h2>
                    <div className="flex flex-col gap-1 text-sm mt-3">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-slate-400 uppercase tracking-wider text-xs w-16">From:</span>
                        <span className="font-bold text-slate-800">
                          {activeTab === "contact" ? selectedItem.full_name : selectedItem.profiles?.full_name || "Unknown Identity"}
                        </span>
                      </div>
                      
                      {/* FIX: SAFELY DISPLAYING THE REPORTER EMAIL FOR BOTH TABS */}
                      {(activeTab === "contact" || selectedItem.reporter_email) && (
                        <div className="flex items-center gap-2">
                          <span className="font-black text-slate-400 uppercase tracking-wider text-xs w-16">Email:</span>
                          <a 
                            href={`mailto:${activeTab === "contact" ? selectedItem.email : selectedItem.reporter_email}`} 
                            className="font-bold text-blue-600 hover:underline"
                          >
                            {activeTab === "contact" ? selectedItem.email : selectedItem.reporter_email}
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                  <div>{renderStatusBadge(selectedItem.status)}</div>
                </div>

                {activeTab === "abuse" && selectedItem.target_name && (
                  <div className="mb-6 bg-red-600 text-white p-4 rounded-xl shadow-inner flex items-center gap-3">
                     <FaTriangleExclamation className="text-2xl text-red-200" /> 
                     <div>
                       <p className="text-[0.65rem] font-black uppercase tracking-widest text-red-200">Reported Target</p>
                       <p className="text-base font-bold">{selectedItem.target_name}</p>
                     </div>
                  </div>
                )}

                {/* The Message Body */}
                <div className="relative">
                  <span className="absolute -top-3 left-4 bg-white px-2 text-[0.65rem] font-black uppercase tracking-widest text-slate-400">
                    Message Payload
                  </span>
                  <div className="prose prose-sm max-w-none text-slate-700 whitespace-pre-wrap bg-slate-50/50 p-6 pt-5 rounded-xl border border-slate-200 leading-relaxed font-medium">
                    {activeTab === "contact" ? selectedItem.message : selectedItem.details}
                  </div>
                </div>
              </div>

              {/* Action Bar */}
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 flex items-center justify-between">
                <div className="flex gap-3">
                  <button
                    onClick={() => updateStatus(selectedItem.id, activeTab === "contact" ? "read" : "in_progress", activeTab)}
                    disabled={updating}
                    className="px-5 py-2.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg text-xs font-black uppercase tracking-widest transition disabled:opacity-50"
                  >
                    Mark Reviewed
                  </button>
                  <button
                    onClick={() => updateStatus(selectedItem.id, "resolved", activeTab)}
                    disabled={updating}
                    className="px-5 py-2.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-lg text-xs font-black uppercase tracking-widest transition disabled:opacity-50"
                  >
                    Mark Resolved
                  </button>
                </div>

                <button
                  onClick={() => handleReply(
                    activeTab === "contact" ? selectedItem.email : selectedItem.reporter_email, // <-- Safe reply mapping
                    activeTab === "contact" ? selectedItem.subject : `Regarding your Abuse Report`
                  )}
                  className="flex items-center gap-2 px-6 py-2.5 bg-[#0f172a] text-white hover:bg-[#1e293b] rounded-lg text-xs font-black uppercase tracking-widest shadow-md transition"
                >
                  <FaReply /> Reply directly
                </button>
              </div>

            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-slate-300">
              <FaEnvelopeOpenText className="text-7xl mb-4 opacity-30" />
              <p className="text-lg font-bold text-slate-400">Select a ticket to view details</p>
            </div>
          )}
        </div>
      </div>
      
      {/* Scrollbar Styles */}
      <style dangerouslySetOrigin={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
      `}} />
    </div>
  );
}