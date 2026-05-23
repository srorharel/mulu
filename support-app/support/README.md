# Wash Support — Hi-fi designs (Agent app)

Agent-only React/Vite app on port 3001. Dark-only theme, deep-green agent accent.

## What's here

- `Support.html` — open in a browser to view all 4 screens on a pan/zoom canvas
- `SPEC.md` — source-of-truth design spec
- `support-shared.jsx` — dark tokens, agent palette (#3FB58F), window chrome, left rail
- `support-conversations.jsx` — 3-column conversations dashboard
- `support-other.jsx` — Login, Approvals, Tickets
- `brand.jsx` — Wash logo + dark map (shared visual language with main app)
- `design-canvas.jsx` — pan/zoom canvas host
- `assets/wash-logo.png` — brand logo

## Note on accent color

The spec lists violet (`#7C3AED`) as the agent accent. After review we switched to a
deeper, brand-aligned green (`#3FB58F` / `#1F7A5E`) so the support tool reads as the
agent edition of Wash. It's distinct from the consumer's lighter `#7DD9A2` brand green
so the two apps still feel like different surfaces. Update `SPEC.md` §Design System
when the codebase is migrated.

## Verifying against the codebase

> Compare the React app in `support-app/` against the designs in `Support.html`
> (spec in `SPEC.md`). Report mismatches in dark-mode tokens, layout (Queue/Chat/Context
> three-column on Conversations, photo-grid + MiniMap on Approvals, table on Tickets),
> realtime hooks (useAgentQueue, useConversationStream, useTypingPresence),
> and component contracts (QueueItem, MessageBubble, ApprovalRow, OrderPanel).

Key things to check:
- Three-column layout on `/` and `/conversations/:id`
- ApprovalRow shows 4 arrival + 4 completion photos with signed URLs
- Tickets table shows live badge count of open tickets in tab bar
- Auto-created ticket on 1★ rating is flagged in the UI
- All agent UI uses the new deep-green accent (not violet)
