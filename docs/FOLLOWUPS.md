# Follow-up items

Items that surfaced during the six-fix design refactor but were intentionally deferred. Each entry includes the file location, what needs to change, and the open decisions required before acting.

---

## 1. WorkerMap FAB bottom position — WorkerMap.jsx:301

**What:** `bottom: 'calc(56px + 120px + 1.5rem)'` is a hardcoded composition of three values that should reference CSS variables.

**Why it exists:** The `56px` is the orphaned `BOTTOM_NAV_H` constant that was removed from `JobDrawer.jsx` in Fix 1. The FAB was not caught because the audit grepped for the constant name, not its raw value.

**Correct form:** `calc(var(--nav-height, 0px) + var(--drawer-collapsed-height, 120px) + 1.5rem)`

**Open decisions before acting:**
- Confirm that 144px (washer non-notched) and 178px (washer notched, 34px safe-area) are the correct final positions for the FAB on washer routes. This is a visible position change of −56px from the current 200px.
- Decide whether to introduce a named `--fab-stack-gap: 1.5rem` variable to explain the gap, or leave `1.5rem` inline with a comment explaining it differs from `--stack-gap: 12px` (the NavLauncher gap). FAB and NavLauncher are different visual elements; the larger gap may be intentional.

---

## 2. Post-Fix-6 vertical offset audit

After Fix 6 (emoji → Lucide migration) completes, run a dedicated audit:

Grep for hardcoded numeric values in `bottom:`, `top:`, `paddingBottom:`, `marginBottom:`, and `height:` across all components with `position: absolute`, `position: fixed`, or `position: sticky`. Cross-reference each value against `--nav-height`, `--drawer-collapsed-height`, `--stack-gap`. Any offset that should be composing against a layout variable but isn't goes on the next fix list.

WorkerMap FAB (item 1 above) is already known. This audit may surface additional instances.

---

## 3. Skeleton wrapper depth mismatch

`JobCardSkeleton` and `HistoryRowSkeleton` both use the `.card` wrapper (`bg-white shadow-sm border-neutral-100` in light / `bg-surface-elevated border-edge` in dark), but the real content they stand in for uses `GlassCard` on consumer pages and inline glass on washer pages. This creates a visible "snap" on content load — the skeleton surface differs from the final content surface in both background opacity and shadow depth.

**Fix:** Replace `.card` wrapper in `JobCardSkeleton` and `HistoryRowSkeleton` with the same surface the real content uses. May require the skeleton components to be context-aware or for callers to pass a wrapper variant. This likely means `GlassCard` on consumer and the inline glass pattern on washer. May require the skeleton components to be context-aware or for callers to pass a wrapper variant.

---

## 4. OrderTrackingSkeleton uses px-5

`OrderTrackingSkeleton` in `Skeleton.jsx` uses `px-5` (20px) to mirror `OrderTracking.jsx`, which also uses `px-5`. Per DESIGN.md §5, app pages use `px-4` (16px) — `px-5` is reserved for auth/landing pages. Update both the real page and its skeleton together when the page-edge padding pass happens.

---

## 5. Pre-fix skeleton contrast was failing

Before Fix 4, `bg-neutral-200` on white cards produced approximately 1.24:1 contrast — below the threshold for reliable shape perception on quick glance. The `animate-pulse` motion was carrying the entire "something is loading" signal; the placeholder shape itself was effectively invisible. Fix 4 corrects this to 1.64–1.71:1 (light) and 1.48:1 (dark).

This improvement affects every screen with skeleton loaders, not just internal code hygiene. Worth surfacing if there is a release notes or changelog file. Also worth keeping as evidence that "nobody complained" does not mean "working as intended" — visible-but-subtle UI elements warrant periodic contrast audits.
