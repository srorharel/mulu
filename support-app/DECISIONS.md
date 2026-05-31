# Architecture Decisions — MULU Support App

## ADR-S01: Nested project under support-app/ (not a sibling repo)

**Status:** Accepted  
**Context:** Build prompt allowed monorepo (apps/support/) or sibling repo. The main repo has no monorepo tooling.  
**Decision:** Created `support-app/` as a self-contained Vite project inside the same Git repo. Not a true monorepo — no shared package extraction. Each project manages its own `node_modules`.  
**Consequence:** Simpler; a real shared package can be extracted later.

## ADR-S02: Inline i18n translations in main.jsx

**Status:** Accepted  
**Context:** The agent app is Hebrew-first and small enough that separate JSON files add overhead.  
**Decision:** Translations are inlined as JS objects in `src/main.jsx`.  
**Consequence:** Less maintainable at scale; easy to refactor to JSON files if strings grow.

## ADR-S03: Agent role enforced in AuthContext (client + DB)

**Status:** Accepted  
**Context:** The login page is the gate. A non-agent who somehow obtains credentials sees the login succeed then gets signed out by AuthContext.loadProfile.  
**Decision:** AuthContext calls `signOut()` if the profile's role !== 'agent'. The Supabase RLS `is_agent()` function is the server-side gate for all data access.  
**Consequence:** Belt-and-suspenders protection.

## ADR-S04: Claim-on-select — agents auto-claim when tapping an unassigned conversation

**Status:** Accepted  
**Context:** The build prompt specifies "Tapping an unassigned item auto-calls claim_conversation(id)".  
**Decision:** `Dashboard.handleSelect` calls `claimConversation` before opening the chat pane. Two agents clicking simultaneously — the second gets a no-op (the SQL update's WHERE clause filters assigned_agent_id IS NULL OR = auth.uid()).  
**Consequence:** Possible brief double-claim race on high-traffic queues; acceptable for v1.
