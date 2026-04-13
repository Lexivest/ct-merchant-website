import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://xdchacdjcgazyckacbpc.supabase.co"
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhkY2hhY2RqY2dhenlja2FjYnBjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1NDA2MzMsImV4cCI6MjA4NTExNjYzM30.41V3RaUX-ii-EHysbcVpUCgm0-RsNmuOb8FmYsz72Ow"

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error("Supabase environment variables are missing.")
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

// --- DEBUG LOGGING FOR FIREFOX/CLOUDFLARE ---
if (typeof window !== "undefined") {
  window.addEventListener("unhandledrejection", (event) => {
    if (event.reason?.message?.includes("supabase") || event.reason?.name === "AuthApiError") {
      console.error("[SUPABASE DEBUG] Unhandled Rejection:", event.reason)
    }
  })
}