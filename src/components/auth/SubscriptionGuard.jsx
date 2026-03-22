import { Navigate } from "react-router-dom";
import useAuthSession from "../../hooks/useAuthSession";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

export default function SubscriptionGuard({ children }) {
  const { user, loading, isOffline } = useAuthSession();
  const [isActive, setIsActive] = useState(true);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    async function checkSubscription() {
      if (!user) return;
      if (isOffline) {
        // If offline, let them see cached data rather than locking them out unnecessarily
        setChecking(false);
        return;
      }
      
      try {
        const { data, error } = await supabase
          .from("shops")
          .select("subscription_end_date")
          .eq("owner_id", user.id)
          .maybeSingle();

        if (error) throw error;

        if (data && data.subscription_end_date) {
          const endDate = new Date(data.subscription_end_date);
          const today = new Date();
          // Active ONLY if the end date is in the future
          setIsActive(endDate > today);
        } else {
          // If no date exists for some reason, lock them out to be safe
          setIsActive(false);
        }
      } catch (err) {
        console.error("Failed to verify subscription status:", err);
      } finally {
        setChecking(false);
      }
    }

    if (!loading) checkSubscription();
  }, [user, loading, isOffline]);

  if (loading || checking) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-slate-50">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-pink-600/20 border-t-pink-600"></div>
        <p className="mt-4 font-semibold text-slate-500">Verifying access...</p>
      </div>
    );
  }

  // THE KICK: If expired, bounce them directly to the billing page!
  if (!isActive) {
    return <Navigate to="/service-fee" replace />;
  }

  return children;
}