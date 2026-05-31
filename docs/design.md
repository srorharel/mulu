# Design System — MULU

> Living document. Update alongside code changes.  
> Covers: tokens, components, layout shells, consumer + washer flows, pricing, i18n, known design debt.

---

## 1. Design Principles

- **Mobile-first.** All pages are designed at 390 px width (iPhone 14). Desktop is an afterthought.
- **Glass over flat.** Consumer surfaces use a frosted glass aesthetic (`bg-glass`, `backdrop-blur-xl`) sitting above a gradient mesh background. Washer surfaces use a dark base with the same semantic tokens.
- **44 px minimum tap targets.** Every interactive element has `min-height: 44px` — enforced via `.btn`, `.input`, and `style={{ minHeight: 44 }}` on bespoke elements.
- **No separate admin UI in the main app.** All agent/admin functionality lives exclusively in `support-app/`.
- **Trigger wins.** Prices are written by a Postgres trigger (`validate_order_prices`), never trusted from the client. The JS pricing constants in `src/lib/pricing.js` are kept in exact sync for display purposes only.

---

## 2. Color Tokens

Tokens are CSS variables resolved in `src/index.css`. Tailwind classes map to these variables via `tailwind.config.js`.

### 2.1 Semantic tokens

| Token | Light value | Dark value (`.dark`) |
|---|---|---|
| `--color-surface` | `#fafafa` | `#0f1117` |
| `--color-surface-elevated` | `#ffffff` | `#1a1d27` |
| `--color-surface-glass` | `rgba(255,255,255, 0.60)` | `rgba(26,29,39, 0.72)` |
| `--color-ink` | `#171717` | `#f5f5f5` |
| `--color-ink-muted` | `#737373` | `#a3a3a3` |
| `--color-ink-subtle` | `#9ca3af` | `#555e73` |
| `--color-edge` | `#f5f5f5` | `#2a2d3a` |
| `--color-accent` | `#7DD9A2` | `#7DD9A2` (unchanged) |
| `--color-accent-muted` | `rgba(125,217,162, 0.12)` | `rgba(125,217,162, 0.18)` |
| `--color-glass-surface` | `rgba(255,255,255, 0.60)` | `rgba(26,29,39, 0.50)` |
| `--color-glass-border` | `rgba(255,255,255, 0.50)` | `rgba(255,255,255, 0.08)` |
| `--color-surface-skeleton` | `#bcc7d2` (1.64–1.71:1 on card) | `#2e3657` (1.48:1 on dark card) |

**Washer layout override** — `[data-layout="washer"]` sets `--nav-height: env(safe-area-inset-bottom, 0px)` (no consumer nav bar).

### 2.2 Primary palette (green)

`primary-500` (`#7DD9A2`) is the brand accent. The scale runs 50–900:

| Step | Hex |
|---|---|
| 50 | `#F3FCF7` |
| 100 | `#E5F6EC` |
| 200 | `#D4EDDE` |
| 300 | `#B9E5CB` |
| 400 | `#9CDEB6` |
| 500 | `#7DD9A2` (base) |
| 600 | `#47D17F` |
| 700 | `#26B55F` |
| 800 | `#1C8747` |
| 900 | `#135C30` |

### 2.3 Semantic state colors

| Semantic | Tailwind | Hex |
|---|---|---|
| success | `success-500` | `#22c55e` |
| warning | `warning-500` | `#f59e0b` |
| danger | `danger-500` | `#ef4444` |

---

## 3. Typography

Font: **Inter** (Google Fonts, weights 400/500/600/700).

| Class | Role | Spec |
|---|---|---|
| `text-xl font-bold` | Page heading | 20 px / 700 |
| `text-lg font-bold` | Card title | 18 px / 700 |
| `text-sm font-medium` | Label / subheading | 14 px / 500 |
| `text-sm` | Body | 14 px / 400 |
| `text-xs` | Caption / helper | 12 px / 400 |
| `font-mono tracking-widest` | License plate display | mono, wide spacing |

Labels use the `.label` component class (`text-sm font-medium text-neutral-700 mb-1`).

---

## 4. Spacing & Layout

### 4.1 Layout variables

| Variable | Value | Usage |
|---|---|---|
| `--nav-height` | `calc(56px + env(safe-area-inset-bottom, 0px))` | Bottom offset for content that must clear the nav bar |
| `--drawer-collapsed-height` | `120px` | JobDrawer collapsed state height |
| `--stack-gap` | `12px` | Gap between NavLauncher items |

### 4.2 Page padding

- **App pages** (`/home`, `/history`, `/order/:id`, `/washer/*`): `px-4` (16 px).
- **Auth / landing pages**: `px-5` (20 px).
- **Do not mix.** `OrderTrackingSkeleton` currently uses `px-5` — tracked as design debt (§10.4).

### 4.3 Consumer scroll area

`PageShell` sets `main` to `flex-1 overflow-y-auto pb-16` (bottom nav clearance). Pages fill with `min-h-full`.

---

## 5. Component Classes

Defined in `@layer components` inside `src/index.css`.

### Buttons

| Class | Description |
|---|---|
| `.btn-primary` | Filled green, white text. Primary CTA. |
| `.btn-outline` | Green border + text, transparent fill. Secondary. |
| `.btn-danger` | Filled red. Destructive actions. |
| `.btn-ghost` | No border, neutral text. Tertiary / silent. |

All share `.btn` base: `inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 font-semibold text-sm`, `min-height: 44px`, `disabled:opacity-50`.

### Inputs & selects

`.input` — `w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm`, `min-height: 44px`, dark mode aware, focus ring `focus:border-primary-500 focus:ring-2 focus:ring-primary-100`.

Border tint overrides applied per state in `LicensePlatePicker`: `border-primary-400` (found), `border-warning-400` (not found), `border-danger-400` (error).

### Cards

| Class | Description |
|---|---|
| `.card` | `bg-white rounded-2xl shadow-sm border border-neutral-100 p-4` + dark overrides |
| `GlassCard` | `bg-glass border-glass-border backdrop-blur-xl rounded-2xl shadow-lg shadow-black/5` — polymorphic (`as` prop) |

### Background

`.bg-mesh` — four radial gradients (teal × 3 + amber × 1) at 10–18% opacity, composited over `--color-surface`. Atmosphere only — glass surfaces sit in front.

---

## 6. Primitive UI Components

| Component | Path | Notes |
|---|---|---|
| `GlassCard` | `src/components/ui/GlassCard.jsx` | Polymorphic via `as` prop |
| `PageShell` | `src/components/ui/PageShell.jsx` | Consumer scroll frame + BottomNav |
| `WasherShell` | `src/components/ui/WasherShell.jsx` | Adds `.dark` class, `data-layout="washer"` |
| `WasherMapShell` | `src/components/ui/WasherMapShell.jsx` | Full-screen map variant |
| `BottomNav` | `src/components/ui/BottomNav.jsx` | Consumer 3-tab nav with framer-motion active pill; washer gets Back-to-Jobs button only |
| `MotionButton` | `src/components/ui/MotionButton.jsx` | `whileTap` scale for touch feedback |
| `Toast` | `src/components/ui/Toast.jsx` | Global toast via `useToast()` |
| `ConfirmDialog` | `src/components/ui/ConfirmDialog.jsx` | Modal confirm (cancel job, etc.) |
| `Badge` | `src/components/ui/Badge.jsx` | Status pills |
| `AgentShell` | `src/components/ui/AgentShell.jsx` | Support-app shell |
| `AdminShell` | `src/components/ui/AdminShell.jsx` | Legacy admin shell |
| `PhotoLightbox` | `src/components/ui/PhotoLightbox.jsx` | Full-screen photo viewer |

---

## 7. Skeleton System

All skeletons use `Box` (internal to `src/components/Skeleton.jsx`): `bg-surface-skeleton animate-pulse` with a radius variant prop.

Contrast ratios after Fix 4:
- Light: 1.64–1.71:1 on white card surface (`#bcc7d2` on `#fff`)
- Dark: 1.48:1 on dark elevated surface (`#2e3657` on `#1a1d27`)

| Export | Mimics |
|---|---|
| `JobCardSkeleton` | `JobCard` on washer dashboard |
| `HistoryRowSkeleton` | History list row on consumer |
| `OrderTrackingSkeleton` | `OrderTracking` page |

**Known issue:** `JobCardSkeleton` and `HistoryRowSkeleton` use `.card` wrapper while the real content uses `GlassCard` (consumer) or inline glass (washer). Causes a visible "snap" on load. Fix deferred — see §10.3.

---

## 8. Consumer Booking Flow

### 8.1 Screen: `/home` (`ConsumerHome`)

Form fields in order:

1. **Location picker** — tap to open `LocationSheet` (map pin + address search). Auto-fills from GPS via `useGeolocation`. Shows `permissionState` prompts (`idle` → request, `denied` → settings nudge).
2. **License plate picker** — `LicensePlatePicker` component (§8.2).
3. **Vehicle photos** — `CarPhotoUpload` (2 required). Stored in `job-evidence` bucket under `{orderId}/{photo_1|photo_2}`.
4. **Access notes** — optional textarea, 300 char max.
5. **Site resources** — two `ToggleCard` toggles: water tap / power outlet.
6. **Price summary** — hidden until `licenseData.category` is known. Shows total (VAT-inclusive) and VAT breakdown.

`canSubmit = effectivePin && licenseData.isValid && bothPhotosUploaded`.

On submit: INSERT into `orders` with `service_type: 'wash'`, `car_type: licenseData.category`, client-side prices from `priceForCategory()` (overwritten by Postgres trigger anyway). Navigates to `/order/{id}`.

### 8.2 LicensePlatePicker state machine

Component: `src/components/consumer/LicensePlatePicker.jsx`

States: `idle | looking_up | found | confirmed | not_found | error`

```
idle ──(7+ digits, debounce 800ms)──► looking_up
looking_up ──(found)──────────────► found
looking_up ──(not_found)──────────► not_found
looking_up ──(error / network)────► error
found ──("Yes, mine")─────────────► confirmed
found ──("No, manually")──────────► not_found
confirmed ──("Change plate")───────► idle (clears all)
error ──(retry)────────────────────► looking_up  (clears failure cooldown)
error ──("Enter manually")─────────► not_found
not_found ──(plate re-edit)────────► auto-retry via debounce
```

The plate `<input>` is a **single persistent DOM node** across `idle/looking_up/found/not_found/error`. Only `confirmed` swaps it out for a summary chip. This avoids focus loss mid-flow.

Trailing icon slot per state:
- `looking_up` → `Loader2` (spinning)
- `found` → `CheckCircle` (green)
- `not_found` → `AlertTriangle` (warning)
- `error` → `AlertCircle` (danger)

`onChange` emits `{ make, model, year, plate, color, category, isValid }`.

When `confirmed`: values come from registry lookup result.  
When `not_found`: values come from manual form fields (`make`, `model`, `year`, `manualCategory`). `isValid = make && model && year`.  
Otherwise: all null, `isValid: false`.

### 8.3 Vehicle lookup (`src/lib/vehicleLookup.js`)

API: `data.gov.il` CKAN endpoint, resource `053cea08-09bc-40ec-8f7a-156f0677aff3` ("כלי רכב פעילים").

Returns: `{ status, plate, make, model, year, color, category }`.

Category detection from `sug_degem` field:
- `"ג'יפ"` → `jeep`
- `'מ"מ'` (light goods) → `pickup`
- anything else → `private`

In-memory caches: `cache` (successful lookups, permanent per session), `failures` (60 s cooldown before retry). `clearPlateFailure(plate)` bypasses cooldown for manual retry.

Timeout: 5 s `AbortController`.

---

## 9. Pricing

### 9.1 Client constants (`src/lib/pricing.js`)

```
VAT_RATE = 0.18

PRICING = {
  private: { consumer: 100, worker:  60, platform: 40 },
  jeep:    { consumer: 120, worker:  80, platform: 40 },
  pickup:  { consumer: 130, worker:  90, platform: 40 },
}
```

All amounts are ILS, VAT-inclusive. Platform margin is always ₪40 regardless of category.

Helper functions:
- `priceForCategory(category)` — returns the row, falls back to `private`.
- `priceBreakdown(totalIncludingVat)` — splits into `{ total, preVat, vat }`.
- `consumerBreakdown(category)` — breakdown for consumer-facing display.
- `workerBreakdown(category)` — breakdown for washer earnings display.

### 9.2 DB trigger (`supabase/migrations/0024_category_pricing.sql`)

`validate_order_prices()` BEFORE INSERT/UPDATE trigger. For `service_type = 'wash'`:

| `car_type` | `base_price` | `platform_fee` | `total_price` |
|---|---|---|---|
| `jeep` | 80.00 | 40.00 | 120.00 |
| `pickup` | 90.00 | 40.00 | 130.00 |
| anything else (incl. `private`, `null`) | 60.00 | 40.00 | 100.00 |

Non-`wash` service types fall through to legacy pricing (migration 0018 logic: sedan/suv/van × exterior/interior/full + add-on fees).

`car_type` CHECK constraint expanded to accept both legacy (`sedan`, `suv`, `van`, `pickup`) and new (`private`, `jeep`) values.

**Client-supplied prices are always overwritten.** The client sends `prices.worker`/`prices.platform`/`prices.consumer` as a courtesy; the trigger ignores them and sets canonical values.

---

## 10. Known Design Debt (deferred)

See `docs/FOLLOWUPS.md` for full detail.

### 10.1 WorkerMap FAB bottom position (FOLLOWUPS §1)

`WorkerMap.jsx:301` — `bottom: 'calc(56px + 120px + 1.5rem)'` hardcodes the orphaned `BOTTOM_NAV_H = 56` constant. Should be `calc(var(--nav-height, 0px) + var(--drawer-collapsed-height, 120px) + 1.5rem)`.

**Blocked on:** confirm final FAB position on notched (178 px) vs non-notched (144 px) devices.

### 10.2 Post-Fix-6 vertical offset audit (FOLLOWUPS §2)

After emoji → Lucide icon migration completes: grep `bottom:`, `top:`, `paddingBottom:`, `marginBottom:`, `height:` across fixed/absolute/sticky elements; cross-reference against `--nav-height`, `--drawer-collapsed-height`, `--stack-gap`.

### 10.3 Skeleton surface mismatch (FOLLOWUPS §3)

`JobCardSkeleton` and `HistoryRowSkeleton` use `.card` wrapper; real content uses `GlassCard` (consumer) or inline glass (washer). Visible snap on load. Fix: match skeleton wrapper to real surface per context.

### 10.4 OrderTrackingSkeleton uses `px-5` (FOLLOWUPS §4)

`OrderTrackingSkeleton` and `OrderTracking.jsx` both use `px-5`. Per §4.2, app pages use `px-4`. Fix both together in a future page-edge padding pass.

---

## 11. i18n

Main app uses `i18next`. Two locales: `en` and `he` (Hebrew, RTL). Locale files: `src/i18n/locales/en.json` and `he.json`. Locale persisted in `localStorage` and `profiles.locale`.

Support app: resources defined inline in `support-app/src/main.jsx`, no separate locale files. `fallbackLng: 'he'`. localStorage key: `support_locale`.

RTL support: directional icons use `rtl:rotate-180` (e.g. `ChevronRight`, `ArrowLeft`).

Translation key conventions:
- `consumer.home.*` — booking form
- `washer.drawer.*` — job drawer
- `carLabels.*` — vehicle category labels shown in UI
- `serviceLabels.*` — service type labels
- `status.*` — order status display strings

Car category labels (English):
- `private` → "Private car"
- `jeep` → "Jeep / SUV"
- `pickup` → "Pickup"

---

## 12. Washer Flow (design-relevant parts)

### 12.1 Dark mode

`WasherShell` adds `class="dark"` to its root and `data-layout="washer"` (overrides `--nav-height`). Consumer shell is always light.

### 12.2 Bottom nav (washer)

`BottomNav` detects `profile.role === 'washer'` and renders a single "Back to Jobs" button (`← Back to Jobs`) instead of the consumer 3-tab nav.

### 12.3 FAB + NavLauncher stack

On the washer dashboard map, vertical stack from bottom up:
1. Safe area (env(safe-area-inset-bottom))
2. NavLauncher (navigation app launcher) — gap: `--stack-gap: 12px`
3. FAB (online toggle) — gap: 1.5rem above NavLauncher

FAB `bottom` offset is currently hardcoded; see §10.1 for the correct formula.

### 12.4 JobDrawer collapsed height

`--drawer-collapsed-height: 120px`. The drawer rests at this height when no job is active. JobDrawer and NavLauncher compose against this variable.

---

## 13. Support Chat (main app)

Consumer and washer both reach `/support`. The route branches on role — consumer sees `ConsumerSupport`, washer sees `WasherSupport`. Both open a `SupportChatSheet` backed by `support_conversations` / `support_messages`.

Agents only see and respond via `support-app/`. Never add agent UI to the main app.
