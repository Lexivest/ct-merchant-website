import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL = "https://xdchacdjcgazyckacbpc.supabase.co"
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhkY2hhY2RqY2dhenlja2FjYnBjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1NDA2MzMsImV4cCI6MjA4NTExNjYzM30.41V3RaUX-ii-EHysbcVpUCgm0-RsNmuOb8FmYsz72Ow"

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)