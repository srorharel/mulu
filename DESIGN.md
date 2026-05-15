# DESIGN.md

Single source of truth for all visual and UX decisions in Wash. Every UI change must conform to this document. If a design request conflicts with a rule here, surface the conflict rather than silently complying — see §14.

---

## 1. Brand & voice

Wash is a utility: fast, practical, trustworthy. Think Wolt or Bolt, not Soho House. The visual language is clean and direct — the green is confident, not soft or pastel. Information is presented densely enough to be immediately scannable outdoors, in sunlight, one-handed.

What Wash is NOT: luxury, playful-childish, eco-preachy, or corporate-cold. No decorative flourishes that slow the user down.

---

## 2. Architecture: two visual modes

The app has two distinct color modes — not "light/dark" as a user preference, but as a role split:

| Mode | Who | Trigger | Palette style |
|------|-----|---------|---------------|
| **Consumer (light)** | Customers booking washes | Default; public pages | Concrete Tailwind classes (`neutral-*`, `primary-*`) |
| **Washer (dark)** | Washers fulfilling jobs | `.dark` class on `WasherShell` / `WasherMapShell` | Semantic token classes (`text-ink`, `bg-surface`, `border-edge`) |

Washer dark mode is applied by `WasherShell.jsx` based on `profile.display_preference`. Washer light mode (`display_preference === 'light'`) toggles off the `.dark` class.

**Rule:** Consumer pages use concrete palette classes. Washer pages use semantic token classes. Never mix the two systems on the same screen. Profile.jsx is the only shared page — it conditionally wraps in `.dark` based on role.

### Consumer screen pattern (glass over mesh)

Consumer screens sit on `.bg-mesh` (green radial gradient overlay over `#fafafa`). Content is organized into discrete `GlassCard` panels — one card per logical group. Page headers show the `WashMark` wordmark on the left and a user avatar on the right. The primary CTA is always the last card in the scroll area.

### Washer screen pattern (map + floating chrome)

The washer dashboard is a full-screen `WorkerMap` (Leaflet, dark tiles). All UI floats above it:
- **Top-start:** `OnlinePill` — dark glass pill containing the washer avatar, online/offline status, and menu trigger.
- **Top-end:** Earnings widget — dark glass chip showing today's earnings (currently a placeholder; see §3 planned features).
- **Bottom:** `JobDrawer` — a draggable glass bottom sheet that collapses to 120px and expands to 80% of viewport height for the job list, or fully to 100% for the active-job panel.
- No `BottomNav` on washer routes. `--nav-height` is set to `env(safe-area-inset-bottom, 0px)` by `[data-layout="washer"]`.

### Screen inventory

| Screen | Route | Role | Visual mode | Layout shell |
|--------|-------|------|-------------|--------------|
| Landing | `/` | public | light | `bg-mesh`, `GlassCard` |
| Login | `/login` | public | light | `bg-mesh`, `GlassCard` |
| SignUp | `/signup` | public | light | `bg-mesh`, `GlassCard` |
| Consumer Home | `/home` | consumer | light | `PageShell`, `bg-mesh`, card-per-section |
| Order Tracking | `/order/:id` | consumer | light | Full-height, `MapBG` + bottom sheet (no `PageShell`) |
| Order History | `/history` | consumer | light | `PageShell`, `bg-mesh`, grouped list |
| Profile | `/profile` | consumer + washer | light / dark | `PageShell` |
| Washer Dashboard | `/washer` | washer | dark | `WasherMapShell`, full-screen `WorkerMap` |
| Active Job | (within Dashboard) | washer | dark | `JobDrawer` expanded, no separate route |
| Job Detail | `/washer/job/:id` | washer | dark | `WasherShell` |
| Earnings | `/washer/earnings` | washer | dark | `WasherShell` |
| Settings | `/washer/settings` | washer | dark | `WasherShell` |
| Support | `/support` | consumer + washer + agent | light / dark | `PageShell` |

---

## 3. Color system

### Theme resolution

Theme is resolved in this priority order:
1. **Explicit user preference** — `display_preference` field on the `profiles` table
2. **Role-based default** — washer → dark, consumer → light
3. **System `prefers-color-scheme`** — fallback if no profile exists yet

Every component that conditionally applies theme styles must resolve through a single `useTheme()` hook (`src/hooks/useTheme.js`). Components never read `profile.role` to make visual decisions.

**Exception — `WasherMapShell`:** The map shell always applies `.dark` unconditionally and does not call `useTheme()`. The CartoDB `dark_all` tile source is fixed and cannot change at runtime, so every floating overlay (JobDrawer, WasherMenu, OnlinePill, EarningsWidget) must always use dark tokens regardless of the washer's `display_preference`. The non-map shell (`WasherShell`) continues to respect `display_preference` for Earnings, Settings, Shop, and Support.

### Primary palette (green)

Defined in `tailwind.config.js`. All shades exist — this is what each is for:

| Token | Hex | Allowed uses |
|-------|-----|-------------|
| `primary-50` | `#F3FCF7` | Selected item backgrounds, subtle tinted areas, live-order row bg |
| `primary-100` | `#E5F6EC` | Icon container backgrounds (consumer side), active nav pill bg |
| `primary-200` | `#D4EDDE` | Decorative borders on active/selected cards |
| `primary-300` | `#B9E5CB` | NOT for text (fails contrast); decorative dividers, WashMark sphere gradient start |
| `primary-400` | `#9CDEB6` | Status band accents; washer avatar gradient start |
| `primary-500` | `#7DD9A2` | Primary CTAs, accent color (`--color-accent`), active tab indicator, map polyline, stage-progress dots |
| `primary-600` | `#47D17F` | Hover state on primary-500; price text; active CTA gradient end |
| `primary-700` | `#26B55F` | Active/pressed state; text on `primary-50` for AA contrast; status badge bg; CTA gradient end |
| `primary-800` | `#1C8747` | WashMark wordmark text (`text-primary-800`); brand anchor for dark-on-light text |
| `primary-900` | `#135C30` | Reserved — not currently used |

**Forbidden:** `primary-500` as a card background fill (too loud). `primary-300` as text color (contrast failure).

### Semantic tokens (both modes)

Defined as CSS variables in `src/index.css`, mapped in `tailwind.config.js`. Use these on washer screens instead of concrete palette classes. Also used for theming shared components on consumer screens where dark support is needed.

| Token | Light value | Dark value | Use |
|-------|-------------|------------|-----|
| `bg-surface` | `#fafafa` | `#0f1117` | Page background |
| `bg-surface-elevated` | `#ffffff` | `#1a1d27` | Cards, nav bar |
| `bg-glass` | `rgba(255,255,255,0.60)` | `rgba(26,29,39,0.50)` | Glass-surface cards (`GlassCard`, inline glass patterns) |
| `border-glass-border` | `rgba(255,255,255,0.55)` | `rgba(255,255,255,0.08)` | Glass card borders |
| `text-ink` | `#171717` | `#f5f5f5` | Primary text |
| `text-ink-muted` | `#737373` | `#a3a3a3` | Secondary/hint text |
| `text-ink-subtle` | `#9ca3af` | `#555e73` | Placeholder text, disabled labels |
| `border-edge` | `#f5f5f5` | `#2a2d3a` | Dividers, card borders |
| `text-accent` / `bg-accent` | `#7DD9A2` | `#7DD9A2` | Mint accent (same in both modes) |
| `bg-accent-muted` | `rgba(125,217,162,0.12)` | `rgba(125,217,162,0.18)` | Tinted mint backgrounds |

**Legacy alias:** `bg-surface-glass` (maps to `--color-surface-glass`) still exists in the Tailwind config but is not used by any current component. It carries the old dark value of `rgba(26,29,39,0.72)`. Do not use it; use `bg-glass` instead.

### Semantic status colors

Only for status communication — never decorative.

| Token | Hex | Use |
|-------|-----|-----|
| `success-500` | `#22c55e` | Completed states, checkmarks |
| `success-600` | `#16a34a` | Text on success-50 backgrounds |
| `success-50` | `#f0fdf4` | Completed order background tint |
| `warning-500` | `#f59e0b` | Pending order badge, warning icons, star ratings |
| `warning-600` | `#d97706` | Warning text on warning-50 |
| `warning-50` | `#fffbeb` | Warning banner background |
| `danger-500` | `#ef4444` | Error states, cancel actions, destructive buttons |
| `danger-600` | `#dc2626` | Danger text on danger-50 backgrounds |
| `danger-50` | `#fff1f2` | Error/cancelled state backgrounds |

All of `warning-200`, `warning-700`, `warning-800`, `danger-400` are defined in `tailwind.config.js`.

### Planned features not yet in the color system

- **Earnings widget** (Washer Dashboard top-right): currently shows `₪—`. Real value requires a `get_washer_today_earnings` RPC. See ADR-015.
- **ETA pill** (Order Tracking): currently shows `~15 min`. Real value requires a consumer-side realtime subscription to washer GPS + OSRM routing. See ADR-016.
- **Star ratings** (Order Tracking washer card, Active Job customer card): currently show `4.8` as a placeholder. Real values require `rating numeric` + `completed_jobs_count int` on `profiles`. See ADR-017.

---

## 4. Typography

**Font:** Inter (loaded via Google Fonts: weights 400, 500, 600, 700, **800**).  
Stack: `['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif']`

**Hebrew note:** Inter supports Hebrew but falls back to system serif on some Android devices. For Hebrew text, add `'Heebo'` before `ui-sans-serif` in the font stack — Heebo is designed for Hebrew and matches Inter's feel. Hebrew text also reads slightly better at 1px smaller than the English equivalent at the same hierarchy level.

### Size scale

Standard Tailwind classes in active use:

| Class | px | Use |
|-------|----|-----|
| `text-xs` | 12px | Metadata, hints below inputs, timestamps, uppercase section labels, badge pills |
| `text-sm` | 14px | Body text, button text (`.btn`), form labels (`.label`), most card content |
| `text-base` | 16px | Drawer section headers, dialog titles |
| `text-lg` | 18px | Sub-page headings (Shop, Support coming-soon cards) |
| `text-xl` | 20px | Page `h1` on standard pages (Earnings, Settings, JobDetail, etc.) |
| `text-2xl` | 24px | Form card headings (Login, SignUp), earnings figures |
| `text-3xl` | 30px | Landing hero brand name only |

**Arbitrary hero sizes:** The card-per-section consumer screens and washer active job use Tailwind arbitrary sizes for display numbers and primary headings. These are intentional departures from the standard scale — not violations:

| Usage | Class | px |
|-------|-------|----|
| Consumer screen `h1` (Home, History) | `text-[26–28px] font-extrabold` | 26–28px |
| Price heroes (Home CTA, Active Job earnings) | `text-[26px] font-extrabold` | 26px |
| Year-stat number (History summary card) | `text-[30px] font-extrabold` | 30px |
| Active wash title (JobDrawer header) | `text-[17px] font-extrabold` | 17px |

Do not introduce other arbitrary sizes without updating this table.

### Weight scale

| Weight | Tailwind | Use |
|--------|----------|-----|
| 400 | `font-normal` | Body prose, hint text |
| 500 | `font-medium` | Labels, badges, secondary UI chrome |
| 600 | `font-semibold` | Card subheadings, list item titles, nav labels |
| 700 | `font-bold` | Standard page h1, card section headers |
| **800** | **`font-extrabold`** | **Brand wordmark (WashMark), hero screen headings, price display numbers** |

### Specific rules

- Prices, distances, times, counts: add `tabular-nums` so they align in lists.
- Uppercase labels (`text-[11px] font-semibold uppercase tracking-[0.4px]`): used for section sub-labels in cards (e.g. "VEHICLE", "PICKUP LOCATION", "TOTAL · VAT INCLUDED"). Max 2 per screen. Note: the new screens use `text-[11px]` (Tailwind arbitrary) rather than `text-xs` (12px) for uppercase section labels — this is deliberate; the tighter 11px feels less heavy at all-caps.
- `tracking-tight` (`-0.025em`): Landing hero only. Elsewhere, negative letter spacing is expressed with arbitrary values (`tracking-[-0.7px]`, etc.) on hero headings only.

---

## 5. Spacing scale

Base: 4px. The Tailwind scale values in active use:

`4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48`

(Tailwind: `p-1` / `p-2` / `p-3` / `p-4` / `p-5` / `p-6` / `p-8` / `p-10` / `p-12`)

### Component-level rules

| Context | Value | Class |
|---------|-------|-------|
| Screen edge padding — content sections | **16px** | `px-4` |
| Screen edge padding — page header chrome (WashMark row) | **20px** | `px-5` |
| Screen edge padding — auth / landing full-screen pages | **20px** | `px-5` |
| Inside standard `GlassCard` | **16px** | `p-4` |
| Inside site-resource pills, compact cards | **12px** | `p-3` |
| Between cards on a screen | **12px** | `gap-3` |
| Between form fields | **16px** | `gap-4` |
| Between sections within auth form cards | **24px** | `gap-6` |
| Page top padding | **16px** | `pt-4` |
| Bottom nav height | **56px** | `minHeight: 56` |
| Touch targets | **44×44px minimum** | `min-height: 44px` on interactive elements |

---

## 6. Component primitives

These are the ground-truth specs. Do not redefine these inline — extend or override by adding classes.

### Button

```css
.btn          → rounded-xl px-4 py-3 text-sm font-semibold; min-height: 44px
.btn-primary  → bg-primary-500 text-white hover:bg-primary-600 active:bg-primary-700
.btn-outline  → border border-primary-500 text-primary-600 hover:bg-primary-50
.btn-danger   → bg-danger-500 text-white active:bg-danger-600
.btn-ghost    → text-neutral-600 hover:bg-neutral-100
              (dark: text-ink-muted hover:bg-surface-elevated)
```

**Gradient CTA buttons** (Consumer Home "Book wash", Washer Active Job action button): use `bg-gradient-to-b from-primary-500 to-primary-700` with a colored box-shadow (`0 4–8px 14–22px rgba(38,181,95,0.4–0.45)`). Height is `h-[52–54px]` with `rounded-2xl`. These are the only gradient buttons in the app.

Rules:
- All interactive buttons use `MotionButton` for `whileTap` spring feedback at 0.97 scale. Exceptions: buttons inside Framer Motion already handling their own animation.
- Destructive actions use `btn-ghost text-danger-500 hover:bg-danger-500/10`. `btn-danger` is for final confirmations in dialogs only.
- Loading state: `<Loader2 className="h-4 w-4 animate-spin" />` + inline text. Preserve button width with `flex items-center gap-2`.
- Full-width: `w-full` only for primary page CTAs and bottom-of-sheet actions.

### Input / Textarea

```css
.input → rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm;
         min-height: 44px; focus:border-primary-500 focus:ring-2 focus:ring-primary-100
```

- Label: always `.label` class (`text-sm font-medium text-neutral-700 mb-1`).
- Error: `.field-error` below the input (`text-danger-500 text-xs mt-1`).
- Never floating labels. Never placeholder-as-label.
- Textarea: `resize-none` + explicit `min-h-[N]`.

### Card surfaces

**`GlassCard` component** (`src/components/ui/GlassCard.jsx`):
```
bg-glass border border-glass-border backdrop-blur-xl rounded-glass shadow-glass
```
- `rounded-glass` = 22px (defined in `tailwind.config.js`)
- `shadow-glass` = `0 6px 20px rgba(15,40,30,0.06), 0 2px 6px rgba(15,40,30,0.04)` (warm green tint)
- Accepts `as` prop for polymorphic rendering (`<GlassCard as={Link} ...>`)
- Used on: all consumer pages, Login, SignUp, Landing, permission banners

**`.card` class** — the simpler white card:
```
bg-white rounded-2xl shadow-sm border border-neutral-100 p-4
dark:bg-surface-elevated dark:border-edge dark:text-ink
```
Used in: `Skeleton` components only. Do not use `.card` for new UI — use `GlassCard` or the inline glass pattern.

**Inline glass** (washer pages that don't use the GlassCard component):
```
bg-glass border border-glass-border backdrop-blur-xl rounded-glass p-4
```
Use `rounded-glass` (22px) for consistency with the GlassCard component. Note: some older components in `JobDrawer.jsx` (`EvidenceCard`, `VehicleSection`) still use `rounded-2xl` (16px) — see §16 for the open fix.

**Rule:** Consumer pages → `GlassCard`. Washer pages → `GlassCard` or inline glass pattern. Never `.card` on washer pages.

### GlassCard shadow

`GlassCard` applies `shadow-glass` (warm green-tinted double shadow). Regular `.card` uses `shadow-sm`. All other UI elements have no shadow. Map markers are the only other shadow exception (they need depth cues on a textured map background).

### New shared primitives

**`WashMark`** (`src/components/ui/WashMark.jsx`)  
The brand wordmark. Green gradient sphere (primary-300→primary-600 radial, 23×23px) + the text "wash" in Inter 800, `text-primary-800`, `tracking-[-0.6px]`. Sphere uses inline styles (radial-gradient has no Tailwind equivalent). Use as the app's top-left header identity on consumer screens.

**`IsraeliPlate`** (`src/components/ui/IsraeliPlate.jsx`)  
Full visual license plate widget. Standard Israeli plate appearance: yellow `#FFE74A` body, `14px` blue `#1452AF` EU country strip labeled "IL", dark `#1a1a1a` plate digits in font-mono at `text-[20px] font-extrabold`. Fixed height `h-[38px]`. The `number` prop receives the formatted plate string (e.g. `"12-345-67"`). Always rendered `dir="ltr"` regardless of app locale. The 1.5px border uses a single inline style — no Tailwind equivalent for sub-2px borders.

**`MapBG`** (`src/components/ui/MapBG.jsx`)  
Static SVG map placeholder (390×600 viewBox, `preserveAspectRatio="xMidYMid slice"`). Renders a stylized city map with road network, park area, water body, and building blocks. Accepts `dark` boolean prop — switches palette between `#E9EEF2` land (light) and `#1a1d27` land (dark). Used as:
- **Consumer Order Tracking** — the 55vh map area (live map planned, ADR-013)
- **Washer Dashboard** — `<Suspense>` fallback while `WorkerMap` lazy-loads

### Bottom sheet / drawer

Two patterns in the codebase with different radii — standardize on `rounded-t-[28px]` for new work:

| Component | Top radius | Notes |
|-----------|-----------|-------|
| `JobDrawer.jsx` | `rounded-t-3xl` (24px) | Legacy value; unchanged during redesign |
| Order Tracking bottom sheet | `rounded-t-[28px]` (28px) | Matches mockup spec |

Common elements:
- Drag handle: `w-9 h-1 bg-neutral-400/40 rounded-full` centered, 12px padding
- Backdrop: `bg-black/50 backdrop-blur-sm`
- Primary action: full-width button in `px-4 pb-safe` footer

### Confirm dialog

From `ConfirmDialog.jsx`: `rounded-3xl p-6 max-w-sm`, spring scale animation.
- Cancel: `.btn-ghost flex-1`
- Destructive confirm: `.btn-ghost text-danger-500 flex-1`
- Non-destructive confirm: `.btn-primary flex-1`

### Badge

Small inline classification labels — not interactive.

| Variant | Radius | Padding | Font | Use |
|---------|--------|---------|------|-----|
| Default | `rounded-md` (6px) | `px-2 py-0.5` | `text-[13px] font-medium` | Status labels, category tags, add-on chips |
| Pill | `rounded-full` | `px-3 py-1` | `text-[13px] font-medium` | Status capsules with leading dot |
| Status band | `rounded-md` | `px-3 py-2` | `text-sm` | Full-width inline status banner inside a card |

**Forbidden:** `rounded` (4px) on any badge. A clickable `rounded-full` small element is a compact button, not a Badge — style it inline.

---

## 7. Iconography

**Library:** `lucide-react` exclusively.

**Sizes in use:** `h-3 w-3` (12px), `h-3.5 w-3.5` (14px), `h-4 w-4` (16px), `h-5 w-5` (20px), `h-6 w-6` (24px), `h-9 w-9` / `h-10 w-10` (empty-state illustrations)

**Color:** Every icon takes its color from `currentColor`. Never hardcoded fills or strokes.

**RTL-aware icons:** `ArrowLeft`, `ChevronRight`, `Navigation` — add `rtl:rotate-180`. Icons without directionality — do NOT flip.

**Reserved icons:**
- `Droplets` — water availability (site resource indicator)
- `Zap` — power availability (site resource indicator)
- `Home` — consumer BottomNav first tab
- `Car` — vehicle/job type throughout
- `Star` — rating display (static placeholder; real review system planned)

**Icon containers:**
- `rounded-full` — avatar circles, online status indicator, floating action buttons
- `rounded-[10–14px]` — icon containers inside detail cards
- Never mix shapes for the same semantic element type on one screen.

### Emoji rules

`lucide-react` only for functional UI. **Emojis are forbidden** in category labels, feature tags, status indicators, button labels, navigation items, form labels, or any interactive/state-indicating element. All previously documented emoji usages in `Home.jsx`, `JobDetail.jsx` have been replaced with Lucide icons in the redesign.

---

## 8. Motion

All motion uses Framer Motion. Standard spring:

```js
const SPRING = { type: 'spring', stiffness: 300, damping: 30 }
```

Heavier/faster variants:
- `stiffness: 350–500, damping: 28–40` — toggles, confirms
- `stiffness: 400, damping: 35` — swipe/drag (JobCard)

### Timings

| Interaction | Duration | Easing |
|------------|----------|--------|
| Fade in/out (backdrop, toast) | 200ms | `easeOut` |
| `whileTap` scale | Spring (instant feel) | SPRING |
| Page stagger (child items) | 250ms per item, 70–80ms stagger | `easeOut` |
| `layoutId` morphing pill (BottomNav active indicator) | Spring | SPRING |
| Drawer drag snap | Spring | SPRING |
| Map pan | 500–800ms | Leaflet default |

### Banned

- Bounce easing
- Animations over 400ms (map pans excepted)
- `whileTap` on disabled elements
- Slide-from-far-offscreen for panels wider than the viewport

### Prefers-reduced-motion

Currently not implemented. When added: replace `y` transitions with instant opacity-only transitions. Spring tap scales are acceptable to keep.

---

## 9. Map UI

### Consumer MapPicker (`MapPicker.jsx`)

- Tile: OpenStreetMap standard (light)
- Pin: SVG green drop pin, `fill="#7DD9A2"` — keep in sync with `primary-500`
- Container: `rounded-2xl overflow-hidden border border-neutral-200`
- Zoom controls: disabled

### Washer WorkerMap (`WorkerMap.jsx`)

- Tile: CartoDB Dark (`dark_all`) — dark tiles so green markers pop
- Washer position: CSS-animated `washer-dot` (core + pulsing ring, `WasherMarker.css`)
- Job pins: `job-pin-dot` 12×12px CSS dots
- Route polyline: `color="#7DD9A2"`, `weight=3`, `opacity=0.85`, `dashArray="6 8"`
- Suspense fallback: `<MapBG dark className="absolute inset-0 w-full h-full" />` while lazy chunk loads

### Consumer Order Tracking MapBG (static placeholder)

- Component: `MapBG` SVG (light mode, `dark={false}`)
- Height: `h-[55vh]` in the page layout
- Markers: SVG overlay — customer position (white dot + green ring) and a static washer position (green filled circle with initials)
- Decorative route line rendered in the same SVG overlay
- **Live map is planned (ADR-013):** will require a consumer-side realtime subscription to `profiles.current_location` for the assigned washer's GPS, plus a second Leaflet instance.

### Rules

- Never use red markers.
- Shadows allowed on map markers.
- `dir="ltr"` wrapper on `WorkerMap` is intentional — Leaflet must always be LTR.

---

## 10. RTL & internationalization

The app switches direction based on `i18next` locale. The `useDirection` hook in `App.jsx` sets `document.dir`.

**Directional CSS rules:**
- Use `ms-*` / `me-*`, NOT `ml-*` / `mr-*`
- Use `ps-*` / `pe-*`, NOT `pl-*` / `pr-*`
- Use `insetInlineStart` / `insetInlineEnd` for fixed/absolute positioning
- Use `start-0` / `end-0`, NOT `left-0` / `right-0`
- `text-start` / `text-end`, NOT `text-left` / `text-right`

**Exceptions:**
- `dir="ltr"` on map containers and `IsraeliPlate` — required, don't change.
- `rtl:rotate-180` on directional icons.

**Numbers and prices:** `₪` symbol and numeric values must render LTR even in Hebrew context. Wrap price displays with `dir="ltr"` where RTL context might reverse them.

**Date/time formatting:** `new Date().toLocaleDateString(i18n.language)` — already done consistently.

---

## 11. Mobile-specific

**Safe areas:**
- Bottom nav: `paddingBottom: 'env(safe-area-inset-bottom, 0px)'` in `BottomNav.jsx`.
- Fixed top elements: `top: 'max(1rem, calc(env(safe-area-inset-top, 0px) + 0.5rem))'` — used on `OnlinePill` and map chrome.
- Bottom sheets: `safe-bottom` utility class on footer confirm buttons.

**Tap delay:** `body { -webkit-tap-highlight-color: transparent; }` set in `index.css`. Add `touch-action: manipulation` to onClick elements without drag behavior.

**One-handed reach:** Primary CTAs belong in the bottom 60% of the screen. The JobDrawer satisfies this for washers. Consumer booking CTA is the last card in the scroll area.

**Bottom nav height:** 56px fixed, `pb-16` (64px) in `PageShell.jsx`.

**Layout height variables (CSS vars in `src/index.css`):**

```css
--nav-height: calc(56px + env(safe-area-inset-bottom, 0px));
--drawer-collapsed-height: 120px;
--stack-gap: 12px;
```

Never hardcode pixel offsets for floating elements that compose against these. Use `calc(var(--nav-height) + ...)`.

---

## 12. Outdoor / bright-light usage

**Contrast requirements:**
- Body text on white/light: minimum 4.5:1 (AA). Text on `primary-50`: use `primary-700` for AA.
- `text-ink-muted` on white: ~3.5:1 — hint text only.
- Never `text-neutral-300` on white for readable text.

**Status indicators:** Always combine color AND shape or text. Never color alone.

**Borders in sunlight:** For cards displaying critical outdoor information (JobCard, active job panel) use `border-glass-border` (washer) or `border-neutral-200` (consumer) minimum.

---

## 13. Information density

Target: Wolt-level, not Calm-level.

- Job list: 2-3 JobCards visible at the default drawer snap (40% viewport). Cards ~100px each, 12px gap.
- Consumer history: rows ~70px each at 12px gap — history list visible without scrolling down more than a screen.
- Do not increase card padding beyond `p-4` on washer-side cards.
- Section spacing `gap-3` (12px) between cards on consumer screens; `gap-4` (16px) between form fields; `gap-6` (24px) only in auth form cards.
- Empty states: centered icon + 2 lines of text + one CTA. No large decorative illustrations.

---

## 14. Background treatment

**Consumer pages:** `.bg-mesh` — 4 radial gradients at up to 0.42 opacity over `var(--color-surface)`. Radials are top-left (green, 0.42), top-right (green, 0.22), bottom-right (amber, 0.16), bottom-left (green, 0.30). Glass cards sit in front. Do NOT use solid white backgrounds on consumer pages.

**Washer dark screen surfaces (non-map):** `.bg-mesh-dark` — 2 subtle green radials (0.10–0.14 opacity) over `var(--color-surface)` (dark: `#0f1117`). Used on dark screens that don't have a full-bleed map (Active Job header area via `MeshDark` pattern from brand spec).

**Washer map screens:** The `WorkerMap` is full-bleed. UI elements float above it; no surface class needed on the page root.

**Overlays/backdrops:** `bg-black/50 backdrop-blur-sm` for all modals, sheets, menu backdrops.

**Glassmorphism:** `backdrop-blur-xl` (24px) is the maximum blur. No nested blur panels.

---

## 15. Patterns banned project-wide

- Gradient text
- Glassmorphism beyond existing patterns (no new frosted panels)
- Neumorphism
- More than one font family on a single screen
- Skeumorphic shadows on flat buttons
- Centered text in lists (empty states are the only exception)
- Pure `#000000` — use `neutral-900` or `ink` (`#171717`)
- Pure `#ffffff` in dark mode — use `surface-elevated` (`#1a1d27`)
- Skeleton loaders shaped differently from the content they represent
- Full-width buttons outside bottom-sheet footers and modals
- `shadow-*` on buttons (map markers are the only shadow exception)

---

## 16. Known inconsistencies to fix

These are places where the current code drifts from the rules above, in priority order:

| # | Issue | Location | Fix |
|---|-------|----------|-----|
| 1 | `EvidenceCard` and `VehicleSection` use `rounded-2xl` (16px), not `rounded-glass` (22px) | `JobDrawer.jsx` lines 80, 294 | Replace `rounded-2xl` → `rounded-glass` in those two inline glass divs |
| 2 | `JobCard` uses `rounded-2xl` (16px) — not updated in the redesign | `JobCard.jsx` line 73 | Replace `rounded-2xl` → `rounded-glass` |
| 3 | Bottom-sheet top radius: `JobDrawer` uses `rounded-t-3xl` (24px); Order Tracking uses `rounded-t-[28px]` (28px) | `JobDrawer.jsx`, `OrderTracking.jsx` | Standardize to `rounded-t-[28px]`; update `JobDrawer` |
| 4 | `StatusTimeline` uses hardcoded neutral classes | `StatusTimeline.jsx` — `text-neutral-900`, `text-neutral-300` | Replace with `text-ink` / `text-edge` for dark compatibility |
| 5 | `Toast` has no dark mode | `Toast.jsx` — `bg-white border-neutral-100` | Add `dark:bg-surface-elevated dark:border-edge dark:text-ink` |
| 6 | `PillRow`/`GridPill` touch targets too small | `Settings.jsx` — `py-2.5` (~38px) | Change to `py-3`, add `min-height: 44px` |
| 7 | `JobDetail.jsx` uses `.card` (white bg) on washer route | `JobDetail.jsx` | Replace `.card` with `GlassCard` or inline glass |
| 8 | `bg-surface-glass` legacy alias exists in dark CSS vars with old opacity (0.72) | `src/index.css` `.dark {}` block, `tailwind.config.js` | Remove `--color-surface-glass` from dark vars and `surface.glass` from Tailwind config; any remaining usages should migrate to `bg-glass` |

---

## 17. The disagreement protocol

If a design request conflicts with this document, do NOT silently comply. Surface the conflict, explain which rule it violates, and propose either (a) the closest in-rules alternative, or (b) the specific section of DESIGN.md that would need to be amended. Updating DESIGN.md is a deliberate decision, not an accident of following a one-off prompt.
