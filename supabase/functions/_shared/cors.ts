// Shared CORS headers for browser-invoked Edge Functions (send-otp, verify-otp,
// turn-credentials). The trigger-invoked fan-outs don't need these — they're
// called server-to-server. supabase.functions.invoke() from the SPA sends an
// OPTIONS preflight, so each browser-facing function must answer it.

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
