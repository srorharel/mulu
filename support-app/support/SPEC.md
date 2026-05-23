# Support App — Design Document

Agent-only web app running on port 3001. Agents do not use the main Wash app; all support tooling lives exclusively here.

---

## Purpose

Provides human agents with a real-time workspace to:
- Handle consumer and washer support conversations
- Approve completed jobs (review photos + GPS)
- Manage support tickets (auto-created on 1★ rating or manually)
- Override order status (cancel or force-complete)

No public signup. Agent accounts are created via the Supabase dashboard (`role = 'agent'`). Non-agents are signed out immediately on login.

---

## Stack

| Layer | Choice |
|---|---|
| UI framework | React 18 + Vite (port 3001) |
| Styling | Tailwind CSS v3 — dark-only theme |
| Animation | Framer Motion |
| Routing | React Router v6 |
| Backend | Supabase (Postgres, Auth, Realtime, Storage) |
| Maps | Leaflet + react-leaflet (`MiniMap`) |
| Icons | Lucide React |
| i18n | i18next — Hebrew + English; strings defined inline in `main.jsx` |

---

## Design System

### Color Tokens (Tailwind)

| Token | Value | Use |
|---|---|---|
| `surface` | `#0c0d12` | Page/card backgrounds |
| `surface-elevated` | `#15171f` | Raised panels, queue column |
| `surface-elevated-2` | `#1a1d27` | Selected state, hover backgrounds |
| `surface-high` | `#22252f` | Kbd hints, high-contrast surfaces |
| `ink` | `#f4f5f7` | Primary text |
| `ink-muted` | `#a3a8b8` | Secondary text |
| `ink-subtle` | `#6b7388` | Placeholders, timestamps |
| `edge` | `#23262f` | Dividers, outlines |
| `edge-strong` | `#2e323d` | Composer border, stronger outlines |
| `accent` | `#7DD9A2` | Consumer brand green (mirrors main app) |
| `agent` | `#3FB58F` | Agent-specific UI — deep teal-green, distinct from lighter consumer green |
| `agent-deep` | `#1F7A5E` | Hover state for agent-colored elements |
| `agent-soft` | `rgba(63,181,143,0.16)` | Active tab/item fill, selected row background |
| `success` | `#22c55e` | Positive states |
| `warning` | `#f59e0b` | Caution states, unassigned queue, pending approvals |
| `danger` | `#ef4444` | Destructive actions, open tickets, tab badges (inactive) |

**Note:** The agent accent was changed from violet `#7C3AED` to teal-green `#3FB58F` so the support tool reads as the agent edition of Wash (brand-family) rather than a separate product. It remains distinct from the lighter consumer `#7DD9A2`.

Dark mode is hardcoded — there is no light mode toggle in the support app.

### Typography

Base font: **Inter**. No custom scale beyond Tailwind defaults.

### Component Classes (`index.css`)

Defined in the `@layer components` block:

- `.btn` — base button (rounded, medium weight, transition)
- `.btn-primary` — green accent fill
- `.btn-ghost` — transparent with hover surface
- `.btn-danger` — red destructive
- `.input` — dark surface input with edge border
- `.card` — elevated surface with rounded corners

---

## Routing

```
/login                      Login (redirects to / if already authenticated)
/                           Dashboard — Conversations tab
/conversations/:id          Dashboard — auto-selects conversation by ID
/settings                   Agent settings & canned responses
*                           Redirect to /
```

**Guards:**
- `RedirectIfAuthed` — skips login for authenticated agents
- `RequireAgent` — requires a valid session with `role = 'agent'` in `profiles`

---

## Layout Architecture

```
App
└── AuthProvider
    └── Router
        ├── /login → Login
        ├── /settings → Settings
        └── / (and /conversations/:id) → Dashboard
            ├── Tab bar (Conversations · Approvals · Tickets)
            ├── [Conversations tab]
            │   ├── QueueList (left column)
            │   ├── ChatPane (center column)
            │   └── Context panel (right column)
            │       ├── OrderPanel (when conversation has a linked order)
            │       └── UserPanel (when no linked order)
            ├── [Approvals tab]
            │   └── ApprovalRow list (photo review + approve button)
            └── [Tickets tab]
                └── Ticket list / detail view
```

The selected conversation is URL-driven (`/conversations/:id`). On load, Dashboard reads the param and auto-selects the conversation once the queue has loaded.

---

## State & Data Flow

### Auth (`context/AuthContext.jsx`)

- Supabase `onAuthStateChange` drives session state
- `profiles` row fetched on login; role validated
- `signIn()`, `signOut()`, `refreshProfile()` exposed via context

### Conversation Queue (`hooks/useAgentQueue.js`)

- Fetches `support_conversations` filtered to active statuses
- Realtime `POSTGRES_CHANGES` subscription keeps queue live
- Grouped into: **Unassigned**, **Mine**, **All**

### Message Stream (`hooks/useConversationStream.js`)

- Fetches messages for the selected conversation
- Realtime INSERT listener appends new messages; sender profile fetched per message
- `claim_conversation(conv_id)` RPC called when agent opens an unassigned conversation

### Typing Presence (`hooks/useTypingPresence.js`)

- Supabase Presence channel `typing:{convId}`
- Tracks which agents are typing; drives `TypingIndicator`

### Approvals

- `lib/approvals.js` queries `orders` where `status = 'pending_approval'`
- `ApprovalRow` shows 4 arrival photos + 4 completion photos (signed URLs from `job-evidence` bucket, 600 s TTL) and washer GPS via `MiniMap`
- Approve calls `transition_order_status(order_id, 'completed')`

### Tickets

- `support_tickets` table; statuses `open → in_progress → resolved`
- Auto-created by DB trigger on 1★ rating; also creatable manually
- Live badge count of open tickets in tab bar

---

## Component Reference

| Component | Responsibility |
|---|---|
| `QueueList` | Scrollable conversation list with type-label pills (Mine / In treatment / Waiting / General) |
| `QueueItem` | Single conversation row — preview text, timestamp, unread badge |
| `ChatPane` | Message thread, send controls, read-only state when conversation is closed |
| `MessageComposer` | Text input, file attachment button, `/` canned-response trigger |
| `MessageBubble` | Renders a single message (agent vs. user sides, attachment preview) |
| `CannedResponseMenu` | Slash-command dropdown filtered by typed prefix |
| `OrderPanel` | Order details card — status, vehicle info, consumer/washer contact, Cancel + Mark Complete buttons; realtime order subscription |
| `UserPanel` | Opener profile + recent orders + live washer GPS via `MiniMap` |
| `ApprovalRow` | Photo grid + location card + Approve button for `pending_approval` orders |
| `MiniMap` | Leaflet map component (washer GPS pin); used in `ApprovalRow` and `UserPanel` |
| `AgentStatusToggle` | Animated Active/Away switch |
| `TypingIndicator` | Animated "…" indicator when another agent is typing |

---

## Pages

### `Login.jsx`

Email + password form. Supabase `signInWithPassword`. On success, `RequireAgent` guard validates role before allowing through. Non-agents are signed out with an error message.

### `Dashboard.jsx`

Main workspace. Three-column layout on conversations tab; full-width list on approvals and tickets tabs. Reads `:conversationId` URL param to restore selection on refresh. Tab bar shows live badge counts (pending approvals, open tickets, unread conversations).

### `Settings.jsx`

Agent display name editor (written to `profiles.agent_display_name`) and personal canned responses — create and delete shortcuts from `support_canned_responses`.

---

## Database Tables Used

| Table | Access |
|---|---|
| `profiles` | Read (agent, consumer, washer profiles); write `agent_display_name` |
| `support_conversations` | Read + realtime; claim/release via RPC |
| `support_messages` | Read + write; realtime INSERT listener |
| `support_canned_responses` | Read + write (agent's own rows) |
| `support_tickets` | Read + write status; realtime badge |
| `orders` | Read; `transition_order_status` RPC for approve/cancel/force-complete |

### RPC Functions

| Function | Called from |
|---|---|
| `claim_conversation(conv_id)` | `QueueList` / `ChatPane` on open |
| `release_conversation(conv_id)` | On conversation close/reassign |
| `mark_conversation_read(conv_id)` | On focus |
| `transition_order_status(order_id, new_status)` | `OrderPanel` and `ApprovalRow` |

---

## Storage

| Bucket | Used for |
|---|---|
| `job-evidence` | Washer arrival + completion photos shown in `ApprovalRow` |
| `support-attachments` | File attachments in support messages (jpg/png/webp, max 5 MB) |

Photos are served as signed URLs with a 600 s TTL.

---

## i18n

Translations for Hebrew and English are defined inline in `support-app/src/main.jsx` (no separate locale files). Locale key in localStorage: `support_locale`. Fallback language: Hebrew (`fallbackLng: 'he'`).

---

## Build & Code Splitting

Vite manual chunks: `framer-motion`, `@supabase/supabase-js`, and `leaflet` each land in a separate vendor bundle to maximize long-term cache hits. Output goes to `support-app/dist/`.

---

## Constraints & Conventions

- **Agent-only**: never add agent UI to the main `src/` app.
- **Dark theme hardcoded**: no `isDark` toggling; skip `useTheme()`.
- **No public auth**: agent accounts provisioned via Supabase dashboard only.
- **URL-first navigation**: conversation selection is always reflected in the URL so refreshes restore state.
- **Realtime everywhere**: queue, messages, order panel, approvals, and ticket badge all subscribe to Postgres Changes — avoid polling.
