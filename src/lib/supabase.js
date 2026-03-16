import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL = "https://xdchacdjcgazyckacbpc.supabase.co"
const SUPABASE_ANON_KEY =
  "YOUR_SUPABASE_ANON_KEY_HERE"

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