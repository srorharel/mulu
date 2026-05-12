# DESIGN.md

Single source of truth for all visual and UX decisions in Wash. Every UI change must conform to this document. If a design request conflicts with a rule here, surface the conflict rather than silently complying — see §14.

---

## 1. Brand & voice

Wash is a utility: fast, practical, trustworthy. Think Wolt or Bolt, not Soho House. The visual language is clean and direct — the mint is confident, not soft or pastel. Information is presented densely enough to be immediately scannable outdoors, in sunlight, one-handed.

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

---

## 3. Color system

### Theme resolution

Theme is resolved in this priority order:
1. **Explicit user preference** — `display_preference` field on the `profiles` table
2. **Role-based default** — washer → dark, consumer → light
3. **System `prefers-color-scheme`** — fallback if no profile exists yet

Every component that conditionally applies theme styles must resolve through a single `useTheme()` hook (`src/hooks/useTheme.js`). This hook does not exist yet — create it before writing any theme-conditional component. Components never read `profile.role` to make visual decisions.

### Primary palette (mint)

Defined in `tailwind.config.js`. All shades exist — this is what each is for:

| Token | Hex | Allowed uses |
|-------|-----|-------------|
| `primary-50` | `#F3FCF7` | Selected item backgrounds, subtle tinted areas |
| `primary-100` | `#E5F6EC` | Icon container backgrounds (consumer side) |
| `primary-200` | `#D4EDDE` | Decorative borders on active/selected cards |
| `primary-400` | `#9CDEB6` | Status band accents (history row leading edge) |
| `primary-500` | `#7DD9A2` | Primary CTAs, brand mark, active tab indicator, map polyline |
| `primary-600` | `#47D17F` | Hover state on primary-500 elements; price text; links |
| `primary-700` | `#26B55F` | Active/pressed state; text on `primary-50` backgrounds for AA contrast |
| `primary-800` / `primary-900` | — | Reserved; not currently used |
| `primary-300` | `#B9E5CB` | NOT for text (fails contrast); decorative dividers only |

**Forbidden:** `primary-500` as a card background fill (too loud). `primary-300` as text color (contrast failure).

### Semantic tokens (washer dark mode)

Defined as CSS variables in `src/index.css`, mapped in `tailwind.config.js`. Use these on washer screens instead of concrete palette classes:

| Token | Light value | Dark value | Use |
|-------|-------------|------------|-----|
| `bg-surface` | `#fafafa` | `#0f1117` | Page background |
| `bg-surface-elevated` | `#ffffff` | `#1a1d27` | Cards, nav bar |
| `bg-glass` | `rgba(255,255,255,0.60)` | `rgba(26,29,39,0.50)` | Glass-surface cards |
| `border-glass-border` | `rgba(255,255,255,0.50)` | `rgba(255,255,255,0.08)` | Glass card borders |
| `text-ink` | `#171717` | `#f5f5f5` | Primary text |
| `text-ink-muted` | `#737373` | `#a3a3a3` | Secondary/hint text |
| `border-edge` | `#f5f5f5` | `#2a2d3a` | Dividers, card borders |
| `text-accent` / `bg-accent` | `#7DD9A2` | `#7DD9A2` | Mint accent (same in both modes) |
| `bg-accent-muted` | `rgba(125,217,162,0.12)` | `rgba(125,217,162,0.18)` | Tinted mint backgrounds |

### Semantic status colors

Only for status communication — never decorative.

| Token | Hex | Use |
|-------|-----|-----|
| `success-500` | `#22c55e` | Completed states, checkmarks |
| `success-600` | `#16a34a` | Text on success-50 backgrounds |
| `success-50` | `#f0fdf4` | Completed order background tint |
| `warning-500` | `#f59e0b` | Pending order badge, warning icons |
| `warning-600` | `#d97706` | Warning text on warning-50 |
| `warning-50` | `#fffbeb` | Warning banner background |
| `danger-500` | `#ef4444` | Error states, cancel actions, destructive buttons |
| `danger-600` | `#dc2626` | Danger text on danger-50 backgrounds |
| `danger-50` | `#fff1f2` | Error/cancelled state backgrounds |

**Missing shades that need to be added to `tailwind.config.js`** (currently silently fail):
- `warning-200` — used in consumer Home location-denied banner
- `warning-700` / `warning-800` — used in same banner for text
- `danger-400` — used in OrderHistory status band

Until fixed, replace `warning-200` border → `warning-500/30`, `warning-700` text → `warning-600`, `warning-800` text → `warning-600`, `danger-400` → `danger-500`.

**Rule:** Any Tailwind palette shade referenced in code (e.g., `warning-200`) must be defined in `tailwind.config.js`. Use of an undefined shade is a bug, not a styling choice — Tailwind silently outputs nothing.

### The teal bug

`JobCard.jsx` and `SlideToggle` in `JobDrawer.jsx` use hardcoded rgba values that resolve to Tailwind's `teal-500` (#14B8A6 / #0EA5A4) — NOT the brand mint (#7DD9A2). The highlight ring on JobCard and the SlideToggle track color are therefore wrong. Replace with the brand mint via `primary-500` / `accent`.

---

## 4. Typography

**Font:** Inter (loaded via Google Fonts: weights 400, 500, 600, 700).
Stack: `['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif']`

**Hebrew note:** Inter supports Hebrew but falls back to system serif on some Android devices. For Hebrew text, add `'Heebo'` before `ui-sans-serif` in the font stack — Heebo is designed for Hebrew and matches Inter's feel. Hebrew text also reads slightly better at 1px smaller than the English equivalent at the same hierarchy level.

### Size scale (Tailwind classes in use)

| Class | px | Use |
|-------|----|-----|
| `text-xs` | 12px | Metadata, hints below inputs, timestamps, uppercase section labels, badge pills |
| `text-sm` | 14px | Body text, button text (`.btn`), form labels (`.label`), most card content |
| `text-base` | 16px | Drawer/dialog section headers (`"Active Job"`, `"Jobs nearby"`, dialog titles) |
| `text-lg` | 18px | Sub-page headings (Shop, Support coming-soon cards) |
| `text-xl` | 20px | Page `h1` on all standard pages (Home, History, Earnings, Settings, etc.) |
| `text-2xl` | 24px | Form card headings (Login `"Welcome back"`, SignUp card title), earnings figures |
| `text-3xl` | 30px | Landing hero brand name only |

Do not introduce other sizes without updating this table.

### Weight scale

| Weight | Tailwind | Use |
|--------|----------|-----|
| 400 | `font-normal` | Body prose, hint text |
| 500 | `font-medium` | Labels, badges, secondary UI chrome |
| 600 | `font-semibold` | Card subheadings, list item titles, nav labels |
| 700 | `font-bold` | Page h1, price heroes, brand wordmark |

`font-bold` is for page-level headings and hero numbers only. `font-semibold` covers everything else that needs visual weight.

### Specific rules

- Prices, distances, times, counts: add `tabular-nums` (`font-variant-numeric: tabular-nums`) so they align in lists. Add `font-variant-numeric: tabular-nums` to Tailwind config's `fontFamily` or use `@apply` in a utility class.
- Uppercase labels (`text-xs font-medium uppercase tracking-wide`): only for section sub-labels in detail cards (e.g. "ADDONS", "SITE RESOURCES"). Max 2 per screen.
- `tracking-tight` (`-0.025em`): Landing hero only (`text-3xl font-bold tracking-tight`). Nowhere else.

---

## 5. Spacing scale

Base: 4px. The Tailwind scale values in active use:

`4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48`

(Tailwind: `p-1` / `p-2` / `p-3` / `p-4` / `p-5` / `p-6` / `p-8` / `p-10` / `p-12`)

### Component-level rules (standardized from audit)

| Context | Value | Class |
|---------|-------|-------|
| Screen edge padding — app pages | **16px** | `px-4` |
| Screen edge padding — auth / landing | **20px** | `px-5` |
| Inside GlassCard / card | **16px** | `p-4` |
| Inside section cards (Settings, form cards) | **20px** | `p-5` |
| Between sections within a page | **24px** | `gap-6` |
| Major page-level structural breaks | **32px** | `gap-8` |
| Between related items in a list | **12px** | `gap-3` |
| Between form fields | **16px** | `gap-4` |
| Page top padding | **24px** | `pt-6` |
| Page bottom padding | **24px** | `pb-6` |
| Bottom nav height | **56px** | `minHeight: 56` |
| Touch targets | **44×44px minimum** | `min-height: 44px` on interactive elements |

**Note:** App pages (Home, History, Earnings, Settings, etc.) use `px-4` (16px). Auth and full-screen onboarding pages (Landing, Login, SignUp) use `px-5` (20px) — these pages have no peripheral chrome (tabs, nav) so the extra breathing room is intentional.

---

## 6. Component primitives

These are the ground-truth specs defined in `src/index.css` `@layer components`. Do not redefine these inline — extend or override by adding classes.

### Button

```css
.btn          → rounded-xl px-4 py-3 text-sm font-semibold; min-height: 44px
.btn-primary  → bg-primary-500 text-white hover:bg-primary-600 active:bg-primary-700
.btn-outline  → border border-primary-500 text-primary-600 hover:bg-primary-50
.btn-danger   → bg-danger-500 text-white active:bg-danger-600
.btn-ghost    → text-neutral-600 hover:bg-neutral-100
              (dark: text-ink-muted hover:bg-surface-elevated)
```

Rules:
- All interactive buttons use `MotionButton` (which wraps `motion.button`) for `whileTap` spring feedback at 0.97 scale. The only exceptions are buttons inside Framer Motion already handling their own animation (e.g., `motion.button` in WasherMenu, NavLauncher).
- Destructive actions use `btn-ghost text-danger-500 hover:bg-danger-500/10` (as used in WasherMenu sign-out and JobDrawer cancel). Do NOT use `btn-danger` for cancel flows — it reads as too aggressive. `btn-danger` is for final confirmations in dialogs.
- Loading state: replace button text with `<Loader2 className="h-4 w-4 animate-spin" />` + inline text. Preserve button width by using `flex items-center gap-2`.
- Full-width: `w-full` only for primary page CTAs and bottom-of-sheet actions. Never full-width for ghost or secondary actions unless they are in a modal/sheet footer.

**Pill selectors** (Settings PillRow/GridPill, role picker in SignUp, car type in Home): these use `py-2.5` which falls short of 44px. Fix: change to `py-3` (`min-height: 44px` explicit) to meet touch target requirements.

### Input / Textarea

```css
.input → rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm;
         min-height: 44px; focus:border-primary-500 focus:ring-2 focus:ring-primary-100
```

- Label: always use `.label` class (`text-sm font-medium text-neutral-700 mb-1`).
- Error: `.field-error` below the input (`text-danger-500 text-xs mt-1`).
- Never floating labels. Never placeholder-as-label.
- LocationSheet's inline labels (`text-xs font-medium text-neutral-500`) are intentionally smaller because they're inside a compact two-column layout — this is the only exception.
- Textarea: add `resize-none` + explicit `min-h-[N]` (e.g., `min-h-[76px]`, `min-h-[80px]`).

### Card surfaces

There are two card primitives — use the right one for the right context:

**`GlassCard` component** — consumer light mode, also used on glass overlay elements:
- `bg-glass border border-glass-border backdrop-blur-xl rounded-2xl shadow-lg shadow-black/5`
- Used in: consumer pages (Home, OrderTracking, OrderHistory, Login, SignUp, Landing)

**`.card` class** — the simpler white card:
- `bg-white rounded-2xl shadow-sm border border-neutral-100 p-4`
- Dark mode: `dark:bg-surface-elevated dark:border-edge dark:text-ink`
- Used in: Skeleton components. JobDetail currently misuses this — it should use `GlassCard` or the washer inline glass pattern for consistency.

**Inline glass** (washer pages that don't use GlassCard component):
- `bg-glass border border-glass-border backdrop-blur-xl rounded-2xl p-4`
- This is the same visual as GlassCard but without the shadow. Prefer using the GlassCard component to keep things DRY. JobDrawer/ActiveJobPanel and EvidenceCard use the inline pattern — this is acceptable since they are inside a complex draggable container where the component boundary matters.

**Rule:** Consumer pages → GlassCard. Washer pages → GlassCard or inline glass pattern. Never `.card` (white bg) on washer pages.

### GlassCard shadow
Only GlassCard applies a shadow (`shadow-lg shadow-black/5`). Regular `.card` uses `shadow-sm`. All other UI elements (buttons, inputs, nav items) have no shadow. The one exception is map markers — they receive a drop shadow for map depth.

### Bottom sheet / drawer

Pattern from `LocationSheet.jsx` and `JobDrawer.jsx`:
- Top radius: `rounded-t-3xl` (24px) on mobile, zero on bottom
- Drag handle: `w-9 h-1 bg-neutral-400/40 rounded-full` (36×4px), centered, 12px from top
- Backdrop: `bg-black/40 backdrop-blur-sm` (LocationSheet) or `bg-black/50 backdrop-blur-sm` (ConfirmDialog). Standardize to `bg-black/50 backdrop-blur-sm`.
- Primary action: full-width `.btn-primary` in a `px-4 py-4 border-t border-neutral-100` footer

### Confirm dialog

From `ConfirmDialog.jsx`:
- `rounded-3xl p-6 max-w-sm`, spring scale animation
- Cancel: `.btn-ghost flex-1`
- Destructive confirm: `.btn-ghost text-danger-500 flex-1` (NOT `.btn-danger` — the dialog's contained context makes red text sufficient)
- Non-destructive confirm: `.btn-primary flex-1`

### Badge

Small inline classification labels. Not interactive — purely informational.

| Variant | Radius | Padding | Font | Use |
|---------|--------|---------|------|-----|
| Default badge | `rounded-md` (6px) | `px-2 py-0.5` | `text-[13px] font-medium` | Status labels, category tags, add-on chips |
| Pill badge | `rounded-full` | `px-3 py-1` | `text-[13px] font-medium` | Status capsules with leading dot (e.g., `● Available`) |
| Status band | `rounded-md` | `px-3 py-2` | `text-sm` | Full-width inline status banner inside a card |

**Forbidden:** `rounded` (4px) on any badge. `rounded-lg` or larger on default or pill badges — reserve larger radii for cards and containers.

**Current violations to fix:**
- `OrderHistory.jsx:109` — `rounded px-2 py-0.5` → `rounded-md px-2 py-0.5`
- `Profile.jsx:57` — role badge `rounded px-2 py-0.5` → `rounded-md px-2 py-0.5`
- `JobDetail.jsx:91,96` — add-on chips `rounded px-2 py-0.5` → `rounded-md px-2 py-0.5`

**Pill selector height:** 44px minimum touch target. Two valid patterns:
- **Connected group** (e.g., Settings PillRow): buttons are `flex-1 py-3` with no own border; a shared `border border-edge` wrapper provides the outline, `overflow-hidden` clips corners. Renders at 44px.
- **Standalone tile** (e.g., Settings GridPill): each button is `py-3 border border-edge rounded-xl`. Renders at 46px (44px + 1px border top/bottom). Both heights are acceptable; choose based on whether the pills are visually connected or separated.

**Badge vs compact button — the boundary.**

A Badge is informational only. It uses `<span>` semantics, has no hover/active/disabled states, and never takes `onClick`. If an element is `rounded-full` + small + carries text but is clickable, it is a compact button, not a Badge. Style compact buttons inline with their own classes — do not migrate them to `<Badge>`. The visual similarity is coincidence; the semantic distinction is non-negotiable.

Examples in this codebase: `JobDrawer.jsx` cancel pill is a compact button. `JobCard.jsx` service-type pill is a Badge. The first responds to user input; the second describes data.

---

## 7. Iconography

**Library:** `lucide-react` exclusively. Do not mix with other icon sets on any screen.

**Sizes in use:** `h-3 w-3` (12px, tight inline rows), `h-3.5 w-3.5` (14px, compact metadata), `h-4 w-4` (16px, standard UI actions), `h-5 w-5` (20px, nav and prominent actions), `h-6 w-6` (24px, profile avatar context), `h-9 w-9` / `h-10 w-10` (empty-state illustrations)

**Color:** Every icon takes its color from `currentColor` — no hardcoded fills, no hardcoded stroke colors. Control icon color through the parent element's text color class (`text-primary-500`, `text-ink-muted`, etc.).

**RTL-aware icons:** `ArrowLeft`, `ChevronRight`, `Navigation` — add `rtl:rotate-180`. Icons without directionality (search, settings, map pin, checkmark) — do NOT flip.

**Icon containers:**
- `rounded-full` — avatar circles, nav active pill, floating action buttons
- `rounded-lg` — icon containers inside detail cards (car type, payout, address in JobDetail)
- Never mix shapes for the same semantic element type on one screen.

### Emoji rules

Use `lucide-react` exclusively for functional UI. **Emojis are forbidden in:** category labels, feature tags, status indicators, button labels, navigation items, form labels, or any element a user interacts with or uses to identify state.

**Emojis are allowed only in:** user-generated content (chat, reviews — not currently in scope) and purely decorative empty-state graphics.

**Lucide replacements for all current emoji usage:**

| Emoji | File | Context | Lucide replacement |
|-------|------|---------|-------------------|
| 💧 | `Home.jsx:257` | Site resource: water access toggle | `Droplets` |
| 🔌 | `Home.jsx:258` | Site resource: power access toggle | `Zap` |
| 💧 | `Home.jsx:267` | Add-on: wiper fluid refill toggle | `Droplet` (distinct from `Droplets`) |
| 🛞 | `Home.jsx:268` | Add-on: tire pressure check toggle | `Gauge` |
| 💧 | `JobDetail.jsx:128` | Washer: water availability indicator | `Droplets` |
| 🔌 | `JobDetail.jsx:132` | Washer: power availability indicator | `Zap` |

---

## 8. Motion

All motion uses Framer Motion. The standard spring:

```js
const SPRING = { type: 'spring', stiffness: 300, damping: 30 }
```

Heavier/faster variants used in specific contexts:
- `stiffness: 350–500, damping: 28–40` — toggles, confirms (TOGGLE_SPRING in JobDrawer)
- `stiffness: 400, damping: 35` — swipe/drag (JobCard SPRING)

### Timings

| Interaction | Duration | Easing |
|------------|----------|--------|
| Fade in/out (backdrop, toast) | 200ms | `easeOut` |
| `whileTap` scale | Spring (instant feel) | SPRING |
| Page stagger (child items) | 250ms per item, 80–100ms stagger | `easeOut` |
| `layoutId` morphing pill | Spring | SPRING |
| Drawer drag snap | Spring | SPRING |
| Map pan | 500–800ms | Leaflet default |

### Stagger pattern

Auth pages and list pages use `staggerChildren: 0.06–0.1` on a container variant, with children animating `opacity 0→1, y 16→0`. This is the standard entrance pattern.

### Banned

- Bounce easing (the spring values above are already springy enough)
- Animations over 400ms (map pans excepted)
- `whileTap` on already-disabled elements (`.disabled:opacity-50` is the only disabled indicator)
- Slide-from-far-offscreen (WasherMenu uses 100% = full panel width, which is correct for a side drawer)

### Prefers-reduced-motion

Currently not implemented. When added: replace `y` transitions with instant opacity-only transitions. Spring scales on tap are acceptable to keep (they're below the motion threshold that causes discomfort).

---

## 9. Map UI

Two distinct map contexts:

### Consumer MapPicker (`MapPicker.jsx`)

- Tile: OpenStreetMap standard `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png` (light)
- Pin: SVG mint drop pin with white center circle, 24×36px, anchor at bottom tip. Color hardcoded as `#7DD9A2` in SVG `fill` — keep in sync with `primary-500`.
- Container: `rounded-2xl overflow-hidden border border-neutral-200`
- Zoom controls: disabled (`zoomControl={false}`)

### Washer WorkerMap (`WorkerMap.jsx`)

- Tile: CartoDB Dark (`dark_all`) — low-contrast dark tiles so mint markers pop
- Washer position: CSS-animated `washer-dot` (div with core + pulsing ring, see `WasherMarker.css`)
- Job pins: `job-pin-dot` small CSS dots — 12×12px
- Route polyline: `color="#7DD9A2"` (hardcoded, same as `primary-500`), `weight=3`, `opacity=0.85`, `dashArray="6 8"`
- Recenter FAB: `bg-glass border-glass-border`, 44×44px, `rounded-2xl`

### Rules

- Never use red markers (conflicts with semantic danger color).
- Shadows are allowed on map markers (they need depth cues on a textured map background).
- The `dir="ltr"` wrapper on `WorkerMap` is intentional — Leaflet maps must always be LTR regardless of app locale.

---

## 10. RTL & internationalization

The app switches direction based on `i18next` locale. The `useDirection` hook in `App.jsx` sets `document.dir`.

**Directional CSS rules:**
- Use `ms-*` / `me-*` (margin-inline-start/end), NOT `ml-*` / `mr-*`
- Use `ps-*` / `pe-*` (padding-inline-start/end), NOT `pl-*` / `pr-*`
- Use `insetInlineStart` / `insetInlineEnd` for fixed/absolute positioning, NOT `left` / `right`
- Use `start-0` / `end-0`, NOT `left-0` / `right-0`
- `text-start` / `text-end`, NOT `text-left` / `text-right`

**Exceptions:**
- `dir="ltr"` on map containers (`WorkerMap.jsx`) — Leaflet requires this, don't change it.
- `rtl:rotate-180` on directional icons (ArrowLeft, ChevronRight) — explicit flip class.

**Numbers and prices:** `₪` symbol and numeric values must render LTR even in Hebrew context. Wrap with `<bdi>` or `dir="ltr"` span: `<span dir="ltr">₪{price}</span>`.

**Date/time formatting:** Use `new Date().toLocaleDateString(i18n.language)` — already done consistently.

---

## 11. Mobile-specific

**Safe areas:**
- Bottom nav: `paddingBottom: 'env(safe-area-inset-bottom, 0px)'` already in `BottomNav.jsx`.
- Map FABs and fixed elements: `top: 'max(1rem, calc(env(safe-area-inset-top, 0px) + 0.5rem))'` — already in `OnlineToggle.jsx` and `WasherDashboard.jsx`. Apply this pattern to any new fixed-position top element.
- Bottom sheets: `safe-bottom` utility class (`padding-bottom: env(safe-area-inset-bottom, 0px)`) on footer confirm buttons.

**Tap delay:** `body { -webkit-tap-highlight-color: transparent; }` already set in `index.css`. Add `touch-action: manipulation` to any element that uses `onClick` without drag behavior.

**Keyboard handling:** Inputs within scrollable containers (`flex-1 overflow-y-auto`) naturally scroll into view. Don't use `fixed` positioning for inputs.

**One-handed reach:** Primary CTAs belong in the bottom 60% of the screen. The JobDrawer's slide-up architecture satisfies this for washers. Consumer booking CTA is inside a scrollable form — acceptable, since the user has engaged in a form flow.

**Bottom nav height:** 56px fixed, with safe-area padding added below. Content below the nav must have `pb-16` (64px) to clear it — this is handled by `PageShell.jsx`.

**Layout height variables:** All vertical layout heights for fixed or sticky surfaces are defined as CSS variables in `src/index.css`:

```css
--nav-height: 56px;
--drawer-collapsed-height: 120px;
--stack-gap: 12px;          /* gap between stacked floating elements */
```

Components compose these with `calc()` — never hardcode pixel offsets. `NavLauncher`'s bottom position, for example, must be `calc(var(--nav-height) + var(--drawer-collapsed-height) + var(--stack-gap))` not `188px`. Variables must compose with `env(safe-area-inset-*)` at the consumer site (the component), not at the variable definition.

---

## 12. Outdoor / bright-light usage

**Contrast requirements:**
- Body text on white/light backgrounds: minimum 4.5:1 (AA). Text on `primary-50` backgrounds: use `primary-700` (not `primary-600`) for AA compliance.
- `text-neutral-400` (the `ink-muted` light equivalent) on white: ~3.5:1 — acceptable for hint text only (not body, not labels).
- Never `text-neutral-300` on white for readable text (fails all contrast thresholds).

**Status indicators:** Always combine color AND shape or text. A green dot alone is not enough — the dot AND the label "Online" / "Offline" are already implemented in `WasherMenu.jsx`. Maintain this pattern.

**Borders in sunlight:** `border-neutral-100` (the light `.card` border and many dividers) may wash out in direct sunlight. For cards that display critical information outdoors (JobCard, active job panel) use `border-glass-border` (washer) or `border-neutral-200` (consumer) minimum.

---

## 13. Information density

Target density: Wolt-level, not Calm-level. The user is between jobs, checking quickly.

- Job list: 2-3 JobCards visible without scrolling in the default drawer snap point (40% of viewport height). Cards are compact enough: ~100px each, 12px gap.
- Bento tiles on Earnings: 2-column grid, 4 tiles in view without scrolling. ✓
- Do not increase card vertical padding beyond `p-4` on washer-side cards.
- Section spacing `gap-5` (20px) between sections is the maximum. `gap-6` (24px) is allowed only in form flows (Login, SignUp, Settings) where reading pace is slower.
- Empty states: center-aligned icon + 2 lines of text + one CTA. No more. No large decorative illustrations.

---

## 14. Background treatment

**Consumer pages:** `bg-mesh` (defined in `index.css`) — a background color with 4 radial gradient overlays at 10–18% opacity. Glass cards sit in front. Do NOT use solid white backgrounds on consumer pages.

**Washer pages:** `bg-surface` (dark: `#0f1117`). The WorkerMap is full-bleed with UI elements floating above it.

**Overlays/backdrops:** `bg-black/50 backdrop-blur-sm` for all modals, sheets, and menu backdrops. No other backdrop treatment.

**Glassmorphism:** Used for cards and drawers (`backdrop-blur-xl`). This is the deliberate aesthetic. Blur above 16px would be too heavy on mid-range Android — `backdrop-blur-xl` (24px) is the maximum. No frosted glass panels with nested blur.

---

## 15. Patterns banned project-wide

- Gradient text
- Glassmorphism beyond what already exists (no new frosted panels)
- Neumorphism (soft inner/outer shadows)
- More than one font family on a single screen
- Skeumorphic shadows on flat buttons
- Centered text in lists (always `text-start`; empty states are the only exception)
- Pure `#000000` — use `neutral-900` or `ink` (which is `#171717`)
- Pure `#ffffff` in dark mode — use `surface-elevated` (`#1a1d27`)
- Skeleton loaders that use a different shape than the actual content they represent
- Full-width buttons outside of bottom-sheet footers and modals
- `shadow-*` on buttons (the design is flat; map markers are the only shadow exception)

---

## 16. Known inconsistencies to fix

These are places where the current code drifts from the rules above. Listed in priority order:

| # | Issue | Location | Fix |
|---|-------|----------|-----|
| 1 | Teal (#14B8A6) used instead of brand mint (#7DD9A2) | `JobCard.jsx` highlight ring, `SlideToggle` in `JobDrawer.jsx` | Replace with `primary-500` / `var(--color-accent)` |
| 2 | Missing palette shades silently fail | `warning-200`, `warning-700`, `warning-800`, `danger-400` in `Home.jsx`, `OrderHistory.jsx` | Add to `tailwind.config.js` or replace with available shades |
| 3 | Screen edge padding inconsistent | `px-4` vs `px-5` across pages | Standardize to `px-4` everywhere |
| 4 | `StatusTimeline` uses hardcoded neutral classes | `StatusTimeline.jsx` — `text-neutral-900`, `text-neutral-300` | Replace with `text-ink` / `text-neutral-300 dark:text-ink-muted/30` |
| 5 | `Toast` has no dark mode | `Toast.jsx` — `bg-white border-neutral-100` | Add `dark:bg-surface-elevated dark:border-edge dark:text-ink` |
| 6 | PillRow/GridPill touch targets too small | `Settings.jsx` — `py-2.5` (~38px) | Change to `py-3` and add `min-height: 44px` |
| 7 | `JobDetail.jsx` uses `.card` (white bg) on washer route | `JobDetail.jsx` | Replace `.card` with `GlassCard` or inline glass pattern |
| 8 | Section gap inconsistent (5 vs 6) | Various pages | Standardize: `gap-5` for page sections, `gap-4` for form fields, `gap-6` only in auth form cards |

---

## 17. The disagreement protocol

If a design request conflicts with this document, do NOT silently comply. Surface the conflict, explain which rule it violates, and propose either (a) the closest in-rules alternative, or (b) the specific section of DESIGN.md that would need to be amended. Updating DESIGN.md is a deliberate decision, not an accident of following a one-off prompt.
