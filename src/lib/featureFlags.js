// Central feature flags. Both default OFF — the features below are fully built
// but stay INVISIBLE/inert until the matching env var is set to the string
// 'true' at build time (Vite inlines import.meta.env.* at build).
//
// To turn one on: add the var to .env (local) / Vercel env (prod) and rebuild.
// While unset, the app behaves exactly as before (e.g. calling falls back to
// the existing `tel:` links, and no phone-verification gate ever appears).
//
//   VITE_ENABLE_PHONE_VERIFY=true   → SMS OTP gate after signup (Feature 1)
//   VITE_ENABLE_INAPP_CALLS=true    → in-app WebRTC voice, masks both numbers (Feature 2)
//
// Both also require backend setup (Edge Functions + secrets + an SMS provider /
// TURN server). See OTP_AND_CALLS_SETUP.md for the operator checklist.

export const FEATURES = {
  phoneVerification: import.meta.env.VITE_ENABLE_PHONE_VERIFY === 'true',
  inAppCalls:        import.meta.env.VITE_ENABLE_INAPP_CALLS === 'true',
}

export default FEATURES
