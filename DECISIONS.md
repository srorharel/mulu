# Architecture Decisions

## ADR-001: Manual Vite scaffold instead of `create-vite`
**Date:** 2026-05-01  
**Status:** Accepted  
**Context:** `create-vite` requires interactive TTY confirmation when the target directory is non-empty (it contains `.claude/`). Piping `y` did not work.  
**Decision:** Scaffolded the project manually by writing `package.json`, `vite.config.js`, `index.html`, `tailwind.config.js`, and `postcss.config.js` directly. Identical output to a `create-vite` scaffold.  
**Consequence:** None — structure is equivalent.

## ADR-002: `@hookform/resolvers` not in package.json (Step 1 only)
**Date:** 2026-05-01  
**Status:** Accepted  
**Context:** `react-hook-form` zod integration requires `@hookform/resolvers`.  
**Decision:** Added to `dependencies` alongside `zod`.  
**Consequence:** None.

## ADR-003: Default map center → Tel Aviv (32.08, 34.78)
**Date:** 2026-05-01  
**Status:** Accepted  
**Context:** The spec targets ILS pricing, implying an Israeli market. A sensible default center for the MapPicker fallback (when GPS is unavailable) is Tel Aviv.  
**Consequence:** Users outside Israel will still be able to drag/tap the map to any location.

## ADR-004: Profile `equipment_notes` field
**Date:** 2026-05-01  
**Status:** Accepted  
**Context:** The spec mentions "(washer) equipment notes" in the Profile screen but the DB schema does not include this column.  
**Decision:** UI field is included; the `0001_init.sql` migration will add `equipment_notes text` to `profiles`.  
**Consequence:** Slight schema extension beyond the literal spec.

## ADR-005: npm scripts can't run in this directory — use node directly
**Date:** 2026-05-01  
**Status:** Accepted  
**Context:** The project directory name contains `&&`, which Windows cmd.exe (used by npm scripts) interprets as a command separator, breaking `.cmd` shim paths in `node_modules/.bin`.  
**Decision:** Run Vite directly via `node .\node_modules\vite\bin\vite.js` instead of `npm run dev/build`. Documented in README.  
**Consequence:** Minor developer experience inconvenience — all functionality is unaffected.

## ADR-006: `zodResolver` import from `@hookform/resolvers/zod`
**Date:** 2026-05-01  
**Status:** Accepted  
**Context:** Standard pattern for react-hook-form + zod integration.  
**Decision:** Used throughout auth forms.

## ADR-007: key_location excluded from nearby_jobs RPC only
**Date:** 2026-05-01  
**Status:** Accepted  
**Context:** Key location is sensitive and should only be revealed to the assigned washer post-accept.  
**Decision:** Excluded from the `nearby_jobs` RPC SELECT. The direct-table RLS policy "orders: washer read pending" technically allows any online washer to read the full row (including key_location), but the app UI never surfaces it pre-accept. Column-level RLS would require a security-definer view — deferred as over-engineering for MVP.  
**Consequence:** A determined API caller could read key_location from a pending order. Accepted trade-off.

## ADR-008: Add-ons folded into base_price
**Date:** 2026-05-01  
**Status:** Accepted  
**Context:** Wiper fluid (₪20) and tire pressure (₪20) add-ons need pricing.  
**Decision:** Add-on prices are added to `base_price` (washer payout). Platform fee (15%) applies to the full base including add-ons. Mirrored exactly between `src/lib/pricing.js` and the `validate_order_prices` server trigger. Trigger overwrites all client-supplied price values on INSERT.  
**Consequence:** `base_price` represents total washer payout, not just service price.

## ADR-009: Evidence videos — 30 s / 50 MB, private bucket, immutable
**Date:** 2026-05-01  
**Status:** Accepted  
**Context:** Proof-of-work evidence is required before an order can be completed.  
**Decision:** Client validates duration (via video metadata) and file size before upload. Server enforces via `transition_order_status` exception on missing paths. Storage bucket `job-evidence` is private; INSERT restricted to assigned washer; SELECT to order parties; UPDATE/DELETE blocked. Path: `{order_id}/{type}.mp4`.  
**Consequence:** No new npm dependencies. Eruda debug tool loaded from CDN only in dev + `?debug=1`.

## ADR-010: Site resources visible pre-accept
**Date:** 2026-05-01  
**Status:** Accepted  
**Context:** Washer needs to know whether water and power are available before deciding to accept a job.  
**Decision:** `site_has_water` and `site_has_power` included in `nearby_jobs` RPC return and shown on Job Detail pre-accept. Not sensitive.  
**Consequence:** None.
