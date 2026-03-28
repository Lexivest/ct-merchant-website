import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import {
  FaArrowRightFromBracket,
  FaBoxOpen,
  FaBuilding,
  FaChartPie,
  FaCircleCheck,
  FaCircleNotch,
  FaEnvelope,
  FaIdBadge,
  FaShieldHalved,
  FaUsers,
  FaVideo,
  FaWandMagicSparkles,
} from "react-icons/fa6";

export default function StaffDashboard() {
  const navigate = useNavigate();
  
  const [authUser, setAuthUser] = useState(null);
  const [staffData, setStaffData] = useState(null);
  const [fetchingStaff, setFetchingStaff] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // --- Table State ---
  const [shops, setShops] = useState([]);
  const [loadingShops, setLoadingShops] = useState(true);
  const [togglingId, setTogglingId] = useState(null); 

  useEffect(() => {
    async function initDashboard() {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (!session) {
          navigate("/staff-portal", { replace: true });
          return;
        }

        setAuthUser(session.user);

        const { data: staffProfile, error: staffErr } = await supabase
          .from("staff_profiles")
          .select("*")
          .eq("id", session.user.id)
          .single();

        if (staffErr || !staffProfile) {
          throw new Error("Access Denied: Not a staff member.");
        }

        setStaffData(staffProfile);
        fetchShops();

      } catch (err) {
        console.error(err);
        await supabase.auth.signOut();
        navigate("/staff-portal", { replace: true });
      } finally {
        setFetchingStaff(false);
      }
    }

    initDashboard();
  }, [navigate]);

  async function fetchShops() {
    setLoadingShops(true);
    try {
      const { data, error } = await supabase
        .from("shops")
        .select(`
          id, 
          name, 
          unique_id, 
          status, 
          kyc_status, 
          id_issued, 
          created_at,
          profiles ( full_name )
        `)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      setShops(data || []);
    } catch (err) {
      console.error("Error fetching shops:", err);
    } finally {
      setLoadingShops(false);
    }
  }

  const toggleIdIssued = async (shopId, currentStatus) => {
    setTogglingId(shopId);
    try {
      const newStatus = !currentStatus;
      
      const { error } = await supabase
        .from("shops")
        .update({ id_issued: newStatus })
        .eq("id", shopId);

      if (error) throw error;

      setShops((prevShops) => 
        prevShops.map((shop) => 
          shop.id === shopId ? { ...shop, id_issued: newStatus } : shop
        )
      );

    } catch (err) {
      console.error("Error updating ID status:", err);
      alert("Failed to update ID status. Check your connection.");
    } finally {
      setTogglingId(null);
    }
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    await supabase.auth.signOut();
    navigate("/staff-portal", { replace: true });
  };

  if (fetchingStaff) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-[#2E1065] via-[#5B21B6] to-[#DB2777] font-sans">
        <FaCircleNotch className="mb-4 animate-spin text-5xl text-[#DB2777]" />
        <p className="text-lg font-semibold text-white">Verifying secure session...</p>
      </div>
    );
  }

  if (!staffData || !authUser) return null;

  const avatarUrl = authUser.user_metadata?.avatar_url || 
    `https://ui-avatars.com/api/?name=${encodeURIComponent(staffData.full_name)}&background=2E1065&color=fff&size=150&font-size=0.4`;

  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-10">
      
      {/* Top Navigation */}
      <nav className="flex items-center justify-between bg-[#2E1065] px-6 py-4 text-white shadow-md">
        <div className="flex items-center gap-3">
          <FaShieldHalved className="text-2xl text-[#DB2777]" />
          <h1 className="text-lg font-bold tracking-wide">
            CT‑Merchant <span className="text-[#DB2777]">Staff</span>
          </h1>
        </div>
        <button
          onClick={handleLogout}
          disabled={isLoggingOut}
          className="flex items-center gap-2 rounded-lg bg-[#DB2777] px-5 py-2 font-bold transition-colors hover:bg-pink-600 disabled:opacity-70"
        >
          {isLoggingOut ? <FaCircleNotch className="animate-spin" /> : <FaArrowRightFromBracket />}
          {isLoggingOut ? "Logging out..." : "Logout"}
        </button>
      </nav>

      {/* Main Content */}
      <div className="mx-auto mt-8 max-w-[1200px] px-6">
        
        {/* Staff Profile Card */}
        <div className="mb-8 flex flex-col items-center gap-8 rounded-2xl bg-white p-8 shadow-sm border border-slate-200 sm:flex-row sm:items-start">
          <img
            src={avatarUrl}
            alt="Staff Avatar"
            className="h-24 w-24 rounded-full border-4 border-slate-100 object-cover shadow-sm"
          />
          <div className="text-center sm:text-left">
            <h2 className="mb-1 text-3xl font-bold text-[#2E1065]">
              {staffData.full_name}
            </h2>
            <div className="mt-3 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
              <p className="flex items-center gap-2 font-medium text-slate-600">
                <FaEnvelope className="text-[#DB2777]" />
                <span>{authUser.email}</span>
              </p>
              <p className="flex items-center gap-2 font-medium text-slate-600">
                <FaBuilding className="text-[#DB2777]" />
                <span>{staffData.department || "General Operations"}</span>
              </p>
              <span className="inline-block rounded-full bg-purple-100 px-3 py-1 text-xs font-bold uppercase tracking-wider text-purple-800">
                {staffData.role}
              </span>
            </div>
          </div>
        </div>

        {/* Dashboard Metric Cards */}
        <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-3">
          <div className="rounded-2xl bg-white p-6 shadow-sm border border-slate-200">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-purple-100">
              <FaBoxOpen className="text-xl text-[#2E1065]" />
            </div>
            <h3 className="mb-1 text-lg font-bold text-[#0F172A]">Shop Repository</h3>
            <p className="text-sm text-slate-500">Total shops indexed in the database.</p>
          </div>

          {/* --- THE INBOX CARD FIX --- */}
          <div 
            onClick={() => navigate("/staff-inbox")}
            className="rounded-2xl bg-white p-6 shadow-sm border border-slate-200 cursor-pointer transition hover:shadow-md hover:border-pink-300 group"
          >
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-pink-100 group-hover:bg-pink-200 transition">
              <FaUsers className="text-xl text-[#DB2777]" />
            </div>
            <h3 className="mb-1 text-lg font-bold text-[#0F172A] group-hover:text-[#DB2777] transition">Support Tickets</h3>
            <p className="text-sm text-slate-500">Inbox for public and merchant inquiries.</p>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-sm border border-slate-200">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
              <FaChartPie className="text-xl text-blue-700" />
            </div>
            <h3 className="mb-1 text-lg font-bold text-[#0F172A]">System Reports</h3>
            <p className="text-sm text-slate-500">Generate analytics and export data.</p>
          </div>
        </div>

        {/* --- VERIFICATION DATA TABLE --- */}
        <div className="rounded-2xl bg-white shadow-sm border border-slate-200 overflow-hidden">
          
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-200 bg-slate-50 px-6 py-4">
            <h2 className="text-lg font-extrabold text-slate-900">Merchant Verifications</h2>
            <div className="flex items-center gap-4">
              <button 
                onClick={() => navigate("/staff-studio")} 
                className="inline-flex items-center gap-2 rounded-lg bg-pink-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-pink-700"
              >
                <FaWandMagicSparkles /> Launch CT Studio
              </button>
              <button onClick={fetchShops} className="text-sm font-bold text-slate-500 hover:text-slate-800 transition">
                Refresh List
              </button>
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-white text-xs uppercase text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 font-bold">Shop Details</th>
                  <th className="px-6 py-4 font-bold">Proprietor</th>
                  <th className="px-6 py-4 font-bold">KYC Status</th>
                  <th className="px-6 py-4 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loadingShops ? (
                  <tr>
                    <td colSpan="4" className="px-6 py-8 text-center">
                      <FaCircleNotch className="mx-auto animate-spin text-2xl text-slate-400" />
                    </td>
                  </tr>
                ) : shops.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="px-6 py-8 text-center text-slate-500 font-medium">
                      No shops found in the repository.
                    </td>
                  </tr>
                ) : (
                  shops.map((shop) => (
                    <tr key={shop.id} className="transition hover:bg-slate-50">
                      <td className="px-6 py-4">
                        <div className="font-bold text-slate-900">{shop.name}</div>
                        <div className="text-xs font-mono text-slate-500 mt-0.5">{shop.unique_id || "Unassigned"}</div>
                      </td>
                      <td className="px-6 py-4 font-medium text-slate-700">
                        {shop.profiles?.full_name || "Unknown"}
                      </td>
                      <td className="px-6 py-4">
                        {shop.kyc_status === 'approved' ? (
                          <span className="inline-flex items-center gap-1.5 rounded-md bg-green-100 px-2.5 py-1 text-xs font-bold text-green-800">
                            <span className="h-1.5 w-1.5 rounded-full bg-green-600"></span> KYC Approved
                          </span>
                        ) : shop.kyc_status === 'submitted' ? (
                          <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-600 animate-pulse"></span> Video Pending
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">
                            <span className="h-1.5 w-1.5 rounded-full bg-slate-400"></span> Unverified
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        
                        {shop.kyc_status === 'approved' ? (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => toggleIdIssued(shop.id, shop.id_issued)}
                              disabled={togglingId === shop.id}
                              className={`inline-flex min-w-[110px] items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold transition disabled:opacity-50 ${
                                shop.id_issued 
                                  ? "border-green-200 bg-green-50 text-green-700 hover:bg-green-100" 
                                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
                              }`}
                            >
                              {togglingId === shop.id ? (
                                <FaCircleNotch className="animate-spin" />
                              ) : shop.id_issued ? (
                                <><FaCircleCheck className="text-green-600" /> Issued</>
                              ) : (
                                "Mark Issued"
                              )}
                            </button>

                            <button 
                              onClick={() => navigate(`/staff-issue-id?shop_id=${shop.id}`)}
                              className="inline-flex items-center gap-2 rounded-lg bg-[#2E1065] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#4c1d95]"
                            >
                              <FaIdBadge /> Issue ID
                            </button>
                          </div>
                        ) : shop.kyc_status === 'submitted' ? (
                          <button 
                            onClick={() => alert("Video Review Modal coming soon!")}
                            className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-xs font-bold text-white transition hover:bg-amber-600"
                          >
                            <FaVideo /> Review KYC
                          </button>
                        ) : (
                          <button 
                            disabled
                            className="inline-flex items-center gap-2 rounded-lg bg-slate-200 px-4 py-2 text-xs font-bold text-slate-400 cursor-not-allowed"
                          >
                            No Action
                          </button>
                        )}

                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
