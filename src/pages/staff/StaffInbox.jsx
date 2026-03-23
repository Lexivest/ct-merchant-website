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
  FaCheckDouble
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
    setItems([]); // <-- FIX 1: Instantly clear ghost data when switching tabs

    try {
      if (activeTab === "contact") {
        const { data, error } = await supabase
          .from("contact_messages")
          .select("*")
          .order("created_at", { ascending: false });
        
        if (error) throw error;
        setItems(data || []);
      } else {
        // Fetch Abuse Reports
        const { data: reports, error: reportsErr } = await supabase
          .from("abuse_reports")
          .select("*")
          .order("created_at", { ascending: false });
          
        if (reportsErr) {
          console.error("Supabase Error on Reports:", reportsErr);
          throw new Error(`Database Error: ${reportsErr.message}`);
        }

        if (!reports || reports.length === 0) {
          setItems([]);
          return;
        }

        // Extract unique reporter IDs to fetch profiles safely
        const reporterIds = [...new Set(reports.map(r => r.reporter_id).filter(Boolean))];
        let profilesMap = {};
        
        if (reporterIds.length > 0) {
          // FIX 2: Safely removed 'email' from this fetch to prevent silent database crashes
          const { data: profiles, error: profErr } = await supabase
            .from("profiles")
            .select("id, full_name") 
            .in("id", reporterIds);
            
          if (!profErr && profiles) {
            profiles.forEach(p => {
              profilesMap[p.id] = p;
            });
          }
        }

        // Merge the data together
        const enrichedReports = reports.map(report => ({
          ...report,
          profiles: profilesMap[report.reporter_id] || null
        }));

        setItems(enrichedReports);
      }
    } catch (err) {
      console.error("Error fetching inbox:", err);
      alert("Failed to load messages. Check console for details.");
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (id, newStatus) => {
    setUpdating(true);
    const table = activeTab === "contact" ? "contact_messages" : "abuse_reports";
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
      alert("Email address is not publicly available for this user's profile.");
      return;
    }
    const replySubject = encodeURIComponent(`Re: ${subject || "Your Inquiry to CTMerchant"}`);
    window.location.href = `mailto:${email}?subject=${replySubject}`;
  };

  const renderStatusBadge = (status) => {
    switch (status?.toLowerCase()) {
      case "unread":
      case "pending":
        return <span className="bg-amber-100 text-amber-800 text-[0.65rem] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">Needs Action</span>;
      case "read":
      case "in_progress":
        return <span className="bg-blue-100 text-blue-800 text-[0.65rem] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">Reviewed</span>;
      case "resolved":
      case "closed":
        return <span className="bg-emerald-100 text-emerald-800 text-[0.65rem] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">Resolved</span>;
      default:
        return <span className="bg-slate-100 text-slate-600 text-[0.65rem] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">{status || "New"}</span>;
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
      <div className="flex bg-white border-b border-slate-200 px-6 shadow-sm">
        <button
          onClick={() => setActiveTab("contact")}
          className={`flex items-center gap-2 px-6 py-4 text-sm font-bold transition-all ${
            activeTab === "contact" ? "border-b-2 border-pink-600 text-pink-700" : "text-slate-500 hover:text-slate-800"
          }`}
        >
          <FaEnvelope /> Public Inquiries
        </button>
        <button
          onClick={() => setActiveTab("abuse")}
          className={`flex items-center gap-2 px-6 py-4 text-sm font-bold transition-all ${
            activeTab === "abuse" ? "border-b-2 border-pink-600 text-pink-700" : "text-slate-500 hover:text-slate-800"
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
              <FaCircleNotch className="animate-spin text-2xl text-pink-500" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex h-40 flex-col items-center justify-center text-slate-400">
              <FaCheckDouble className="text-4xl mb-2 opacity-50" />
              <p className="text-sm font-bold">Inbox is empty</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {items.map((item) => (
                <div
                  key={item.id}
                  onClick={() => setSelectedItem(item)}
                  className={`cursor-pointer p-5 transition-colors ${
                    selectedItem?.id === item.id ? "bg-pink-50 border-l-4 border-pink-600" : "hover:bg-slate-50 border-l-4 border-transparent"
                  }`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <h4 className="font-bold text-slate-900 line-clamp-1 pr-2">
                      {activeTab === "contact" ? item.full_name : item.profiles?.full_name || "Unknown Reporter"}
                    </h4>
                    {renderStatusBadge(item.status)}
                  </div>
                  <p className="text-xs font-semibold text-pink-600 mb-1.5 line-clamp-1">
                    {activeTab === "contact" ? item.subject : `Category: ${item.category}`}
                  </p>
                  <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                    {activeTab === "contact" ? item.message : item.details}
                  </p>
                  <p className="text-[0.65rem] font-bold text-slate-400 mt-2 uppercase tracking-wider">
                    {new Date(item.created_at).toLocaleDateString()} • {new Date(item.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* RIGHT: TICKET DETAILS */}
        <div className="hidden lg:flex flex-1 flex-col bg-slate-50 overflow-y-auto custom-scrollbar relative">
          {selectedItem ? (
            <div className="p-8 max-w-3xl mx-auto w-full">
              
              {/* Header Info */}
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 mb-6">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h2 className="text-2xl font-black text-slate-900 mb-2">
                      {activeTab === "contact" ? selectedItem.subject : `Abuse Report: ${selectedItem.category}`}
                    </h2>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-bold text-slate-700">From:</span>
                      <span className="text-slate-600">
                        {activeTab === "contact" ? selectedItem.full_name : selectedItem.profiles?.full_name || "Unknown"}
                      </span>
                      {activeTab === "contact" && (
                        <span className="text-slate-400">&lt;{selectedItem.email}&gt;</span>
                      )}
                    </div>
                  </div>
                  <div>{renderStatusBadge(selectedItem.status)}</div>
                </div>

                {activeTab === "abuse" && selectedItem.target_name && (
                  <div className="mb-6 bg-red-50 text-red-800 p-3 rounded-lg border border-red-100 text-sm font-semibold flex items-center gap-2">
                     <FaTriangleExclamation /> Target Reported: {selectedItem.target_name}
                  </div>
                )}

                {/* The Message Body */}
                <div className="prose prose-sm max-w-none text-slate-700 whitespace-pre-wrap bg-slate-50 p-5 rounded-xl border border-slate-100 leading-relaxed">
                  {activeTab === "contact" ? selectedItem.message : selectedItem.details}
                </div>
              </div>

              {/* Action Bar */}
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 flex items-center justify-between">
                <div className="flex gap-3">
                  <button
                    onClick={() => updateStatus(selectedItem.id, activeTab === "contact" ? "read" : "in_progress")}
                    disabled={updating}
                    className="px-4 py-2 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-sm font-bold transition disabled:opacity-50"
                  >
                    Mark as Reviewed
                  </button>
                  <button
                    onClick={() => updateStatus(selectedItem.id, "resolved")}
                    disabled={updating}
                    className="px-4 py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg text-sm font-bold transition disabled:opacity-50"
                  >
                    Mark as Resolved
                  </button>
                </div>

                <button
                  onClick={() => handleReply(
                    activeTab === "contact" ? selectedItem.email : null,
                    activeTab === "contact" ? selectedItem.subject : `Regarding your Abuse Report`
                  )}
                  className="flex items-center gap-2 px-6 py-2 bg-indigo-950 text-white hover:bg-indigo-900 rounded-lg text-sm font-bold shadow-md transition"
                >
                  <FaReply /> Reply via Email
                </button>
              </div>

            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-slate-400">
              <FaEnvelopeOpenText className="text-6xl mb-4 opacity-20" />
              <p className="text-lg font-bold">Select a ticket to view details</p>
            </div>
          )}
        </div>
      </div>
      
      {/* Scrollbar Styles */}
      <style dangerouslySetOrigin={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
      `}} />
    </div>
  );
}