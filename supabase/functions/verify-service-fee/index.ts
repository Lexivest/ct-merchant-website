import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  return jsonResponse(
    {
      error:
        "Automated Paystack verification has been disabled. Staff must approve offline payment proofs through review-offline-payment-proof.",
    },
    410
  )
})
