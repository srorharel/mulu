# Support-App Design System

> Single source of truth for every visual and interaction decision in `support-app/`.
> If code disagrees with this file, **this file wins** — update the code.

---

## 1. Voice

The support-app is an **internal tool for support agents**. Design priorities:

- **Dense** — maximise information per screen; agents work fast and need everything visible.
- **Calm** — low-contrast dark palette that is easy on the eyes during long shifts.
- **Dark** — permanent dark theme; there is no light mode toggle.
- **Wolt-admin-panel feeling, not landing-page** — no hero illustrations, no marketing copy, no rounded-friendly consumer aesthetics. Straight lines, tight spacing, utilitarian type.

---

## 2. Architecture

### Single dark theme

The app ships one theme. `darkMode: 'class'` exists in `tailwind.config.js` only because the config is shared infrastructure — the `.dark` class is **always** applied.

### Two layout modes

| Mode | Breakpoint | Behaviour |
|------|-----------|-----------|
| Mobile | `< 768px` | Stacked single-column; bottom tab bar for primary navigation; push-based route switching between views. |
| Desktop | `>= 768px` | Three-pane layout — queue list (left), chat / content (centre), context panel (right). |

Breakpoint utility: Tailwind `md:` (768 px).

---

## 3. Color system

All tokens are defined in `tailwind.config.js` under `theme.extend.colors`.

### Surface scale (backgrounds)

| Token | Value | Usage |
|-------|-------|-------|
| `surface` (DEFAULT) | `#0c0d12` | Page background |
| `surface-elevated` | `#15171f` | Cards, panels, sheets |
| `surface-elevated-2` | `#1a1d27` | Nested cards, hover states |
| `surface-high` | `#22252f` | Active/selected row, pressed state |

### Ink scale (text)

| Token | Value | Usage |
|-------|-------|-------|
| `ink` (DEFAULT) | `#f4f5f7` | Primary text |
| `ink-muted` | `#a3a8b8` | Secondary text, timestamps |
| `ink-subtle` | `#6b7388` | Placeholders, disabled text |

### Edge (borders / dividers)

| Token | Value | Usage |
|-------|-------|-------|
| `edge` (DEFAULT) | `#23262f` | Default border |
| `edge-strong` | `#2e323d` | Emphasized dividers |

### Brand: consumer accent

| Token | Value | Usage |
|-------|-------|-------|
| `accent` (DEFAULT) | `#7DD9A2` | Consumer-green highlights, primary buttons |
| `accent-muted` | `rgba(125,217,162,0.16)` | Soft consumer-green background tint |

### Brand: agent green

| Token | Value | Usage |
|-------|-------|-------|
| `agent` (DEFAULT) | `#3FB58F` | Agent-specific green (darker than consumer accent) |
| `agent-deep` | `#1F7A5E` | Hover / pressed state for agent actions |
| `agent-soft` | `rgba(63,181,143,0.16)` | Badge backgrounds, soft highlights |

### Semantic states

| Token | Value |
|-------|-------|
| `danger` | `#ef4444` |
| `warning` | `#f59e0b` |
| `success` | `#22c55e` |

Each semantic color also carries `500` and `600` variants for hover/active states.

### Glass

| Token | Value | Usage |
|-------|-------|-------|
| `glass` (DEFAULT) | `rgba(21,23,31,0.70)` | Translucent overlay backgrounds |
| `glass-border` | `rgba(255,255,255,0.06)` | Subtle border on glass surfaces |

---

## 4. Typography

### Font stack

```
font-family: Inter, ui-sans-serif, system-ui, -apple-system, sans-serif;
```

Monospace (code/IDs): `ui-monospace, "SF Mono", Menlo, monospace`.

### Scale

| Role | Mobile | Desktop |
|------|--------|---------|
| Hero / page title | `text-3xl` | `md:text-5xl` |
| Body | `text-sm` | `md:text-base` |
| Labels / captions | `text-xs uppercase tracking-wider` | same |

### Rules

- Use `text-balance` on hero headings to prevent orphans.
- Constrain hero text with `max-w-[20ch]` to prevent awkward word-stacking on narrow viewports.
- **Hebrew (`he`) exception:** Labels use `tracking-normal` and `font-bold` instead of `uppercase tracking-wider` — Hebrew has no upper/lower case distinction, and wide letter-spacing harms readability.

---

## 5. Spacing

| Context | Mobile | Desktop |
|---------|--------|---------|
| Page horizontal padding | `px-4` | `px-6` |
| Card internal padding | `p-4` | `p-6` |
| Section vertical gap | `space-y-4` | `space-y-6` |

### Touch targets

- Minimum tap target: **44 x 44 px** (WCAG 2.5.8).
- Buttons: `h-12` on mobile (48 px), can relax to `h-10` on desktop where pointer input is assumed.

---

## 6. Components

### Buttons

| Variant | Classes |
|---------|---------|
| **Primary** | `bg-accent text-surface font-semibold rounded-xl h-12 px-6` |
| **Secondary** | `bg-surface-elevated text-ink border border-edge rounded-xl h-12 px-6` |
| **Ghost** | `bg-transparent text-ink-muted hover:bg-surface-elevated rounded-xl h-12 px-4` |
| **Danger** | `bg-danger text-white font-semibold rounded-xl h-12 px-6` |

All buttons: `transition-colors duration-150`, disabled state uses `opacity-50 cursor-not-allowed`.

### Input

```
h-12 rounded-xl bg-surface-elevated border border-edge text-ink
placeholder:text-ink-subtle px-4
focus:ring-2 focus:ring-accent/40 focus:border-accent
```

### Card

```
bg-surface-elevated rounded-2xl border border-edge p-4 md:p-6
```

### Badge / Pill

Small status indicators:

```
inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
```

Colours vary by status — use semantic tokens (`success`, `warning`, `danger`) or `agent-soft` with `agent` text.

### Stat tile

Used on dashboard summary rows:

```
bg-surface-elevated rounded-2xl border border-edge p-4
text-2xl font-bold text-ink        /* value */
text-xs text-ink-muted mt-1        /* label */
```

---

## 7. Layout patterns

### Login

- **Mobile:** Single column, vertically centred form.
- **Desktop:** Two-column — left pane branding / illustration area (`bg-surface`), right pane login form (`bg-surface-elevated`).

### Dashboard

- **Mobile:** Bottom tab bar (Conversations, Approvals, Tickets, Washer Verifications, Settings). Each tab pushes a full-screen route-based view. Active tab highlighted with `accent`.
- **Desktop:** Three-pane layout:
  - **Left pane** (~300 px) — queue / list for the active tab.
  - **Centre pane** (flex-1) — chat thread or detail view.
  - **Right pane** (~320 px) — context panel (`OrderPanel` or `UserPanel`).

### Conversations (mobile)

1. Queue list is the default view.
2. Tapping a row pushes a full-screen chat view.
3. Swiping or tapping a context button opens a bottom drawer for `OrderPanel` / `UserPanel`.

### Approvals / Tickets / Washer Verifications (mobile)

Push navigation: list view -> detail view as a new screen.

---

## 8. Safe areas

For Capacitor / notched-device support:

| Position | Class |
|----------|-------|
| Top bar / first row | `pt-[max(1rem,env(safe-area-inset-top))]` |
| Bottom bar | `pb-[max(1rem,env(safe-area-inset-bottom))]` |

The root `<meta name="viewport">` must include `viewport-fit=cover` to enable safe-area environment variables on iOS.

---

## 9. RTL & i18n

- **Fallback language:** `he` (Hebrew). Supported languages: `he`, `en`.
- **Locale key:** `support_locale` in `localStorage`.
- **Logical properties:** Always use `ms-*` / `me-*` / `ps-*` / `pe-*` instead of `ml-*` / `mr-*` / `pl-*` / `pr-*`. This ensures correct spacing in both LTR (English) and RTL (Hebrew) layouts.
- **Numbers:** Always wrap numeric content with `dir="ltr"` to prevent digit reversal in RTL context.
- **Direction:** Set `dir="rtl"` or `dir="ltr"` on the root `<html>` element based on active locale.

---

## 10. Motion

### Spring preset

All layout animations use a single Framer Motion spring:

```js
{ type: 'spring', stiffness: 300, damping: 30 }
```

### Tab transitions (mobile)

Tab switches use a `200ms` fade (`opacity` only, no slide) to keep perceived performance high without disorienting the user.

### General rules

- Prefer `layout` prop on Framer Motion components for reflow animations.
- Keep `AnimatePresence` at route boundaries for mount/unmount transitions.
- No motion on first paint — `initial={false}` where appropriate.

---

## 11. Disagreement protocol

When implementation conflicts with this design document:

1. **This document is authoritative.** Code should be updated to match.
2. If a developer believes the document is wrong, open a discussion — do not silently deviate.
3. After agreement, update this file **first**, then update code.
4. Every token, spacing value, and component pattern listed here is intentional. "It looked better with X" is not sufficient reason to deviate without updating this doc.
