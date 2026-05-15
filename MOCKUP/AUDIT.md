# Mockup Audit — Phase 0

All findings from reading `brand.jsx`, `screens-consumer.jsx`, `screens-washer.jsx` against
`tailwind.config.js`, `src/index.css`, `src/components/`, and the 5 key screen files.

---

## Token Diff

### Colors

| Token (mockup `W`) | Tailwind / CSS var (app) | Status |
|--------------------|--------------------------|--------|
| `surface: '#fafafa'` | `--color-surface: #fafafa` | **identical** |
| `surfaceEl: '#ffffff'` | `--color-surface-elevated: #ffffff` | **identical** |
| `ink: '#171717'` | `--color-ink: #171717` | **identical** |
| `inkMuted: '#737373'` | `--color-ink-muted: #737373` | **identical** |
| `inkSubtle: '#9ca3af'` | `--color-ink-subtle: #9ca3af` | **identical** |
| `edge: '#f5f5f5'` | `--color-edge: #f5f5f5` | **identical** |
| `g50–g900` (10 stops) | `primary-50–900` (same hex values) | **renamed** (W.gN → primary-N) |
| `g500: '#7DD9A2'` | also `--color-accent: #7DD9A2` | **identical** |
| `warn: '#f59e0b'` | `warning-500: '#f59e0b'` | **renamed** |
| `danger: '#ef4444'` | `danger-500: '#ef4444'` | **renamed** |
| `glass: rgba(255,255,255,0.60)` | `--color-glass-surface: rgba(255,255,255,0.60)` | **identical** |
| `glassBorder: rgba(255,255,255,0.55)` | `--color-glass-border: rgba(255,255,255,0.50)` | **different** (0.55 vs 0.50) |
| `glassDark: rgba(26,29,39,0.50)` | dark `--color-glass-surface: rgba(26,29,39,0.72)` | **different** (0.50 vs 0.72) |
| `dSurface: '#0f1117'` | dark `--color-surface: #0f1117` | **identical** |
| `dElevated: '#1a1d27'` | dark `--color-surface-elevated: #1a1d27` | **identical** |
| `dEdge: '#2a2d3a'` | dark `--color-edge: #2a2d3a` | **identical** |
| `dInk: '#f5f5f5'` | dark `--color-ink: #f5f5f5` | **identical** |
| `dInkMuted: '#a3a3a3'` | dark `--color-ink-muted: #a3a3a3` | **identical** |
| _(none)_ | `success-50/500/600` | **new** (app only) |
| _(none)_ | `surface.skeleton` | **new** (app only) |

### Typography

| Property | Mockup | App | Status |
|----------|--------|-----|--------|
| Font family | `Inter, system-ui` | `Inter` via Google Fonts | **identical** |
| Inter weights | 500 / 600 / 700 / **800** | Google Fonts loads `400;500;600;700` only | **different** — weight 800 not loaded; `font-extrabold` won't render as designed |

### Border Radius

| Context | Mockup | App | Status |
|---------|--------|-----|--------|
| GlassCard default | `22px` | `rounded-2xl` = 16px | **different** |
| GlassCard small | `18px` | — | **new** (no small variant in app) |

### Shadows

| Context | Mockup | App | Status |
|---------|--------|-----|--------|
| GlassCard | `0 6px 20px rgba(15,40,30,0.06), 0 2px 6px rgba(15,40,30,0.04)` (warm green) | `shadow-lg shadow-black/5` (Tailwind default) | **different** — mockup has green-tinted shadow |

### Background Mesh

| Property | Mockup (`MeshBG`) | App (`.bg-mesh`) | Status |
|----------|-------------------|------------------|--------|
| Radial 1 | `at 18% 6%, opacity 0.42` | `at 5% 15%, opacity 0.18` | **different** — mockup much denser |
| Radial 2 | `at 88% 0%, opacity 0.22` | `at 90% 10%, opacity 0.14` | **different** |
| Radial 3 | `at 100% 78%, amber, opacity 0.16` | `at 80% 70%, amber, opacity 0.12` | **different** |
| Radial 4 | `at 0% 100%, opacity 0.30` | `at 55% 90%, opacity 0.10` | **different** |

> Summary: Tokens are almost perfectly matched. The three real gaps are: glassBorder opacity (0.05 delta), dark glass opacity (0.22 delta), and Inter weight 800 not loaded.

---

## Shared Component Diff

### 1. `GlassCard` — EXISTS at `src/components/ui/GlassCard.jsx`

App: `bg-glass border border-glass-border backdrop-blur-xl rounded-2xl shadow-lg shadow-black/5`  
Mockup: glass rgba, 22px radius, warm-green shadow, optional `dark` prop changes background.

Differences:
- Radius: 16px → 22px
- Shadow: generic Tailwind black → green-tinted double shadow
- API: app uses `className` composition; mockup uses `padding`/`radius`/`dark` props  
  (Phase 2 will keep the Tailwind className API and add `Tailwind` class overrides for radius/shadow)

### 2. `BottomNav` — EXISTS at `src/components/ui/BottomNav.jsx`

App: 3 tabs via `NavLink`, icons are `MapPin / Clock / User` from lucide-react, active state = `text-primary-600` + `bg-primary-50` animated pill.  
Mockup: same 3 tabs (home / history / profile), icons `Icon.Home / Icon.Clock / Icon.User`, active = `W.g100` bg + `W.g800` text.

Differences:
- Home tab icon: app uses `MapPin`, mockup uses `Home` (house shape). Values are different icons.
- Active highlight colour: app `bg-primary-50 / text-primary-600` ↔ mockup `W.g100 / W.g800` — these are the same palette values, different names; no change needed.
- Framer-motion animated pill: app has this, mockup is static. Keep the animation.

### 3. `WashMark` — DOES NOT EXIST as a component

App: `<img src="/logo.png" />` used in `Landing.jsx`. Consumer Home has no wordmark at all.  
Mockup: green gradient sphere + "wash" text in Inter 800, `W.g800` color, rendered inline in Consumer Home header.

Status: **new component needed** → `src/components/ui/WashMark.jsx`

### 4. `IsraeliPlate` — DOES NOT EXIST as a visual component

App: `LicensePlatePicker` shows plate number as `font-mono tracking-wider` text only (no visual plate widget).  
Mockup: Full visual plate — yellow `#FFE74A` background, blue `#1452AF` IL strip, dark `#1a1a1a` digits, used in Consumer Home vehicle card, Washer Dashboard job preview, Washer Active Job header.

Status: **new component needed** → `src/components/ui/IsraeliPlate.jsx`

### 5. `MapBG` — NOT NEEDED

App uses real Leaflet maps for everything (WorkerMap, LocationSheet/MapPicker).  
Mockup's `MapBG` is a static SVG placeholder built only for the design canvas.

Status: no action needed.

### 6. Icon set — NO NEW ICONS NEEDED

Mockup uses custom 24px SVG wrappers (`ic(...)` factory). App uses `lucide-react`.  
Every mockup icon has a direct lucide equivalent (Home, Clock, User, MapPin, Navigation, Camera, Plus, Droplet, Zap, Check, CheckCircle, Loader2, AlertTriangle, AlertCircle, ChevronRight, Phone, MessageCircle, Star, ArrowLeft, X, Car, Filter, Shield, Sparkles). No custom icons required.

---

## Screen-by-Screen Gap List

### Screen 01 — Consumer Home (`src/pages/consumer/Home.jsx`)

Mockup artboard: `ConsumerHome` in `screens-consumer.jsx`.

- **Missing header row**: mockup has `WashMark` wordmark + avatar button as a top bar; app starts with a plain `<h1>` title. The greeting ("Good afternoon, Noa") is also absent from the app.
- **Location card layout**: mockup uses a `GlassCard` with a mini map thumbnail on the left and address text on the right; app uses a plain button row inside a single large GlassCard with no thumbnail.
- **Vehicle card layout**: mockup shows `IsraeliPlate` visual widget + car make/model/year row + green checkmark — all inside a `GlassCard` with a "Change plate" link; app's `LicensePlatePicker` confirmed state is a smaller inline banner, not a dedicated card.
- **Photos card**: mockup groups both photo thumbnails in a dedicated `GlassCard` with a "2/2" counter label; app's `CarPhotoUpload` is a separate section without a card wrapper.
- **Site resources layout**: mockup uses a 2-column grid of small pill-GlassCards; app uses a vertical `ToggleCard` list.
- **Price + CTA**: mockup shows price and the "Book wash" button side-by-side inside a sticky bottom glass card; app shows them stacked at the bottom of the main card.

### Screen 02 — Order Tracking (`src/pages/consumer/OrderTracking.jsx`)

Mockup artboard: `OrderTracking` in `screens-consumer.jsx`.

- **No live map in app**: mockup fills the top 60% with a full map, animated route line, and pulsing washer pin; app is a text-only vertical card stack.
- **ETA pill missing**: mockup has a floating centred pill ("4 min · 1.2 km"); app shows no ETA at all.
- **Status bar chrome**: mockup has a top bar with back button + "LIVE" pill badge; app has a plain back link + `<h1>`.
- **Washer info row missing in app**: mockup shows washer avatar, name, star rating, and message/phone action buttons; app shows no washer details to consumers on this screen.
- **Bottom-sheet layout**: mockup wraps everything below the map in a draggable bottom sheet; app uses a flat scrollable page with cards.
- **Progress dots**: mockup shows 5-step horizontal dot timeline; app's `StatusTimeline` is likely vertical — need to verify and align.

### Screen 03 — History (`src/pages/consumer/OrderHistory.jsx`)

Mockup artboard: `ConsumerHistory` in `screens-consumer.jsx`.

- **No summary card in app**: mockup has a green gradient "This year" card with wash count, total spend, and time-saved stats; app shows no stats at all.
- **No filter button**: mockup has a filter icon button in the header; app has none.
- **Flat list vs grouped**: mockup groups by "This week" / "Last month" section headers; app renders a flat chronological list.
- **Row design**: mockup row shows car icon with live-dot indicator, date/time, plate number in monospace, car description, price (right), and status text (below price); app row uses a left-edge status band strip + car type/service label + address + date + Badge component. The mockup row has richer vehicle identity (plate number).

### Screen 04 — Washer Dashboard (`src/pages/washer/Dashboard.jsx`)

Mockup artboard: `WasherDashboard` in `screens-washer.jsx`.

- **Online indicator placement**: mockup shows a dark glass pill (top-left) with washer avatar + "You're / Online" label; app shows a hamburger `Menu` button (top-left) and puts the online toggle inside the `JobDrawer` header — so the toggle is buried below the fold by default.
- **Today's earnings widget**: mockup has a small dark glass box (top-right) showing "TODAY ₪420"; app has no on-screen earnings widget on the Dashboard.
- **Job preview card**: mockup shows a single incoming job card pinned above the bottom safe area (like a bottom sheet at its collapsed height) with `IsraeliPlate`, car details, location strip, and Accept/Skip buttons; app's `JobDrawer` is a draggable bottom sheet with a job list — functionally equivalent but visually different.

### Screen 05 — Washer Active Job (`src/components/washer/JobDrawer.jsx` → `ActiveJobPanel`)

Mockup artboard: `WasherActiveJob` in `screens-washer.jsx`.

- **Page header**: mockup shows a back button + job number "JX-4012" + "Active wash" title + animated "WASHING" status badge; app's `JobDrawer` header shows a plain title ("Active job") with no job number or status badge.
- **IsraeliPlate missing**: mockup shows the full visual plate widget prominently in the car card; app's `VehicleSection` renders the plate number as `font-mono` text in a small accent box.
- **Customer card**: mockup includes customer avatar, name, star rating, message/phone buttons, location strip, and a "Open in Waze" button — all in one card; app shows the address inline in the job info card and the Waze launcher in a separate `NavLauncher` component.
- **Site resources in active job**: mockup shows water/power resource pills in the active job view; app's `ActiveJobPanel` does not display site resource info.
- **Stage progress**: mockup has a 4-dot horizontal progress bar labelled Arrived/Pre-rinse/Wash/Complete; app uses `StatusTimeline` (probably vertical) which covers more states.

---

## Open Questions

1. **`glassBorder` opacity delta**: mockup `W.glassBorder = rgba(255,255,255,0.55)` vs app `rgba(255,255,255,0.50)`. Bump the CSS var to 0.55?

2. **Dark glass card opacity**: `W.glassDark = rgba(26,29,39,0.50)` vs app dark-mode glass at `rgba(26,29,39,0.72)`. The app is noticeably more opaque in dark mode. Match the mockup (0.50) or keep the current heavier dark?

3. **Consumer Home header greeting**: mockup shows "Good afternoon, Noa" + user initial avatar. Add a greeting using the authenticated user's name, or keep the `<h1>` approach?

4. **Order Tracking map**: adding a live consumer-side map requires accessing the washer's location and rendering a Leaflet map. Is this in scope for Phase 3, or should we only redo the bottom-sheet layout and leave the map for a later phase?

5. **History filter button**: the mockup shows a filter icon. Is there real filter functionality to wire up (by status, date range, etc.), or should this be a non-functional placeholder for now?

6. **History yearly summary card**: requires a DB query (count + sum of this-year orders). Implement fully, or simplify to a count-only version?

7. **Washer Dashboard earnings widget**: requires querying today's payout total. Implement or skip?

8. **Online toggle placement**: the mockup moves the online toggle from inside `JobDrawer` to a prominent top-left pill. Moving it means changing `JobDrawer`'s header API. Is that change wanted, or should we keep the toggle inside the drawer?

9. **`IsraeliPlate` scope**: should this be built in Phase 2 (shared primitives) or during Phase 3 (first screen that uses it)? It appears in 3 screens so Phase 2 is cleaner.

10. **`LicensePlatePicker` styling**: the mockup only shows the "confirmed" state in Consumer Home (inside the Vehicle `GlassCard`). The real picker has idle/looking_up/found/not_found/error states. The plan is to keep all behaviour intact and only restyle — confirm?

---

## Answers (2026-05-15)

Default rule: match the mockup as closely as possible. Exceptions are noted per-question.

**Q1 — glassBorder opacity:** → **Yes, bump to 0.55.** `--color-glass-border` will be updated to `rgba(255, 255, 255, 0.55)` in Phase 1.

**Q2 — Dark glass opacity:** → **Match mockup (0.50).** Dark-mode glass cards will be more transparent. `--color-glass-surface` (dark) updated to `rgba(26, 29, 39, 0.50)` in Phase 1.

**Q3 — Consumer Home header greeting:** → **Match mockup.** Phase 3 (Consumer Home) will add a `WashMark` wordmark + user-initial avatar chip + greeting text using the authenticated user's name. No new data needed — name is already in `AuthContext`.

**Q4 — Order Tracking map (EXCEPTION):** → **Do NOT implement a live map.** Use the static `MapBG` SVG placeholder from `brand.jsx` with a single map-pin marker at the customer's stored lat/lng. See DECISIONS.md entry: `ADR-009`.

**Q5 — History filter button:** → **Add as visual placeholder.** The filter icon button will render in the History header but will not open any panel. No filter logic, no new data. The button is purely decorative until a filter feature is scoped separately.

**Q6 — History yearly summary card (data required):** → **Use static/placeholder content.** The green summary card will be rendered with hardcoded placeholder text ("— washes", "₪—") rather than live aggregate queries. See DECISIONS.md entry: `ADR-010`.

**Q7 — Washer Dashboard earnings widget (data required):** → **Use static/placeholder content.** The "TODAY ₪—" widget will render in the top-right of the washer map but will show a placeholder dash until a real earnings query is scoped separately. See DECISIONS.md entry: `ADR-011`.

**Q8 — Online toggle placement:** → **Match mockup.** Phase 4 (Washer Dashboard) will restructure the top-chrome: the online indicator moves from inside `JobDrawer` header to a standalone dark-glass pill in the top-left of the map. `JobDrawer` will lose its own toggle header — `online` / `onToggle` / `toggling` props still flow from Dashboard but are consumed differently.

**Q9 — `IsraeliPlate` scope:** → **Build in Phase 2** (shared primitives). Used in Consumer Home, Washer Dashboard job card, and Washer Active Job — building it once in Phase 2 avoids duplication across three later screen phases.

**Q10 — `LicensePlatePicker` styling:** → **Confirmed — keep all behaviour, restyle only.** All five states (idle / looking_up / found / confirmed / not_found / error) remain intact. Phase 3 will restyle the component to match the mockup's glass-card confirmed state, updating border colours and icon sizes to match the design system without changing any logic.
