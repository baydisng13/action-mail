# AI Email Client — Product Requirements & Flow

> **Working title:** `Postscript` *(placeholder — rename freely)*
> **Status:** Draft v0.1
> **Owner:** Theodore
> **Last updated:** 2026-07-28

---

## 1. One-liner

An AI-native email client that sits on top of existing providers (Gmail first) and turns the inbox from a manual parsing chore into a place where the AI does the reading, threading, and drafting — and hands you the *action*, not the raw message.

---

## 2. The problem

Email is frozen. SMTP dates to 1982, the WYSIWYG compose box hasn't meaningfully changed, and every "innovation" since has been filtering bolted on top (Gmail's Primary/Promotions/Updates tabs being the best of a mediocre bunch).

The protocol can't move — it needs every provider on Earth to agree, which is a coordination deadlock. **But the client layer is wide open.** That's where we build.

Concretely, today's inbox forces the user to do too much manual work:

- **No real prioritisation.** Every email looks roughly equal until you open it.
- **Newsletters are unreadable.** Buried in ad chrome and template junk; no way to just *read* or *listen* to the signal.
- **Promotions are noise.** Hundreds of them; you want them collected, not interrupting.
- **No sense of context.** One address serves work, school, family, job-hunting — all mashed together.
- **Long threads are hell.** A 20-email decision thread (e.g. HR + team debating candidates) is top-to-bottom, redundant, and impossible to catch up on.
- **Actions are buried.** OTP codes, confirmation links, and one-tap actions are hidden inside template markup, forcing you to open the mail just to copy a code.

---

## 3. Vision & principles

We keep the dumb transport (SMTP/IMAP/provider APIs) exactly as-is and put **all the intelligence in the interface**. Superhuman proved people pay for a better layer over the same email; we go further by making the layer *understand* the mail semantically, not just render it faster.

Guiding principles:

1. **Extract the intent, hand over the action.** The user should rarely have to parse a raw email. Surface the code, the button, the decision.
2. **Context over folders.** Categories emerge from behaviour and content, not rigid user-defined rules.
3. **The AI holds the state.** Especially in long threads — the user shouldn't have to reconstruct a conversation from scratch.
4. **Provider-agnostic core.** The internal model is normalised; providers are pluggable adapters.
5. **Model-swappable AI.** We start on DeepSeek for cost, but the AI layer is an interface, never a hard dependency (enterprise clients will demand a specific model or on-prem).
6. **Private by design.** We're piping people's private mail through an LLM — privacy and security are features, not afterthoughts.

---

## 4. Target users

| Persona | Need |
|---|---|
| **Individual power user** | One personal Gmail, drowning in newsletters/promos, wants a calmer, smarter inbox. |
| **Multi-context individual** | Uses one or more addresses for work + school + family + job-hunting; wants those separated as "journals" automatically. |
| **Small team / company** | Already pays for cheap email (e.g. Zoho, cPanel) but the native UI is bad. Wants a shared, per-seat, intelligent client on top of their existing mail. |

---

## 5. Scope

### v1 — ship this

- **Google/Gmail only** as a connectable provider (OAuth).
- **Account creation + login flow** (email/password + Google sign-in).
- **Team concept**: create a team, invite members, per-seat.
- **Payment / billing scaffolding**: plans, seats, checkout — real from day one.
- **Core AI inbox**: categorisation/journals, newsletter digest, promo collapse, action extraction (OTP/links), thread collapse, AI reply.
- One connected email per account on the free tier; additional/work emails are a paid capability.

### Coming soon — visible but disabled in UI

- Zoho, cPanel/IMAP, Outlook, Yahoo, and other providers (shown as "Coming soon" cards in the connect screen).
- Voice/listen mode for digests.
- On-prem / bring-your-own-model AI.

---

## 6. Core AI features

### 6.1 Journals (semantic categorisation)
The AI reads each message semantically (content + sender history + user behaviour) and assigns it to a **journal**: Work, School, Family, Job Hunting, Newsletters, Promotions, Transactional, etc. Journals are dynamic and behaviour-driven — a newsletter you always read is treated differently from one you always ignore. Same inbox, reshaped by the mode you're in.

### 6.2 Readable digest
Newsletters and long-form updates are stripped of ad chrome and template junk and presented as a clean, readable (later: listenable) digest. The signal, none of the noise.

### 6.3 Promotion collapse
Promotional mail is collected into an "Approved Promotions" area and stays out of the main flow unless something is genuinely relevant to the user. Nothing interrupts.

### 6.4 Action extraction ⭐
For transactional mail, the AI scrapes the content and surfaces the single thing that matters, without the user opening the mail:
- **OTP / verification code** → shown as a big **copy** button (and optionally auto-copied).
- **Confirmation / magic link** → shown as a labelled button ("Open link", "Verify", "Reset password"); one tap opens it.
- Suspicious/unknown links are flagged before opening.

### 6.5 Thread collapse (group-chat mode) ⭐
A long decision thread (e.g. HR + team debating candidates over 20 emails) is re-rendered as a **running group conversation** with the AI holding the state:
- "Here's where the group landed."
- "Person A backed candidates X & Y; Person B backed Y & Z; the group is now leaning toward Y."
- **"Your move — reply with one of: [Agree with Y] [Propose Z] [Ask for more info] [Custom]."**

The user follows the conversation like a chat, not an archaeological dig.

### 6.6 AI reply / reply-readiness
When an email needs an action, the AI pre-drafts a reply *in the user's voice* so they're editing, not staring at a blank box. On send inside a group thread, the AI also updates the summary so everyone stays in sync.

### 6.7 End-of-day briefing
A single view: "Here's what actually needs you tonight." Nothing important slips through.

---

## 7. User flows

### 7.1 Auth & account creation

```
Landing page
  └─> "Get started"
        └─> Create account
              ├─ Email + password
              └─ Continue with Google  ──┐
        └─> Verify email (if email/pw)   │
challenge)
              └─> Onboarding             │
                    └─> Connect a mailbox <┘
```

- v1 only lets people **create an account** (no waitlist gating beyond what we choose).
- Account creation is provider-independent — signing in *with* Google is distinct from *connecting* a Gmail mailbox (a user can sign up with Google and connect a different Gmail, or sign up with email/password and connect Gmail later).

### 7.2 Connect a mailbox (Gmail OAuth)

```
Onboarding: "Connect your inbox"
  ├─ [Gmail]  ── active ──> Google OAuth consent
  │                              └─> grant read/modify scopes
  │                              └─> initial sync starts (background)
  │                              └─> AI begins classifying into journals
  ├─ [Zoho]      "Coming soon" (disabled)
  ├─ [Outlook]   "Coming soon" (disabled)
  ├─ [IMAP/cPanel] "Coming soon" (disabled)
  └─ [Yahoo]     "Coming soon" (disabled)
```

- Free tier: **one** connected mailbox.
- Adding a **second / work** mailbox is a paid capability (upsell here).
- Initial sync shows progressive state ("Analysing 1,240 emails… journals forming…") rather than a blank spinner.

### 7.3 Team & invites

```
Settings > Team
  └─> Create team
        └─> Invite by email (role: admin / member)
              └─> Invitee accepts ──> joins team ──> consumes a seat
  └─> Shared mailbox connect (e.g. team's Zoho — coming soon)
        └─> members access the shared inbox via our UI
```

- Teams are **per-seat**. Adding a member consumes/purchases a seat.
- The Zoho angle: a company already pays for cheap Zoho email but hates the UI — they buy *our* seats, connect the shared mailbox, and everyone works through our client.

### 7.4 Billing

```
Settings > Billing
  ├─ Plan: Free (1 mailbox, solo) / Pro (multi-mailbox) / Team (per-seat)
  ├─ Seats: +/- (Team)
  ├─ Payment method
  └─ Checkout ──> provider ──> webhook ──> entitlements updated
```

- Model: base plan + per-seat (e.g. a flat price plus per-seat add-on — exact numbers TBD, see §11).
- **Payment provider is an open question** — Stripe is the default, but for the Ethiopian market Telebirr / CBE Birr rails may matter for local customers. Design billing behind an interface so we can add a local processor without reworking entitlements.

### 7.5 Core inbox experience

```
Inbox
  ├─ Journal switcher (Work / School / Family / Job Hunting / Newsletters / Promotions / ...)
  ├─ Prioritised list (needs-you first)
  ├─ Message view
  │     ├─ Normal mail       ──> reader + AI reply
  │     ├─ Newsletter        ──> readable digest
  │     ├─ Transactional     ──> action card (copy code / open link)
  │     └─ Long thread       ──> group-chat collapse + decision buttons
  └─ End-of-day briefing (entry point)
```

---

## 8. Technical architecture

### 8.1 Stack

- **Framework:** TanStack Start (SSR + file-based routing).
- **Data fetching:** TanStack Query with **Axios** as the transport.
- **API access pattern:** aggressive **nested API-hook** pattern — the "T3 feel" (typed, colocated, hook-per-endpoint) **without adopting the full T3 stack**. Effectively a thin typed client + generated/handwritten hooks grouped by resource (e.g. `api.mail.list`, `api.mail.thread`, `api.team.invite`).
- **Styling/UI:** (assumed) Tailwind + shadcn/ui — confirm.
- **DB:** normalised relational store (Postgres) as the single source of truth across providers.

### 8.2 Provider adapter layer

Each provider is an adapter that normalises into our internal model:

```
Gmail adapter (v1)  ─┐
Zoho adapter         ├─> Normaliser ─> Postgres (unified schema)
IMAP/cPanel adapter  │        └─> Sync engine (initial + incremental/push)
Outlook adapter     ─┘
```

- Gmail: OAuth + Gmail API + push notifications (Pub/Sub) for incremental sync.
- Others: adapters conform to the same interface; ship later.

### 8.3 AI layer

```
Normalised message ─> AI Service (interface)
                         ├─ classify (journal)
                         ├─ summarise (digest / thread state)
                         ├─ extract (OTP / link / action)
                         └─ draft (reply in user voice)
                       └─ Provider: DeepSeek (v1)  [swappable]
```

- **DeepSeek** for v1 (cost). The service is an interface — model choice is config, never hard-wired.
- Classification/summarisation results are **cached** on the message record so we don't re-run the model on every view.

### 8.4 Sync engine

- Initial backfill on connect (batched, rate-limit aware), with progressive UI.
- Incremental sync via provider push where available (Gmail Pub/Sub), polling fallback otherwise.
- Write-back (send, label, archive) goes out through the same adapter to the real provider.

---

## 9. Data model (sketch)

| Entity | Key fields |
|---|---|
| `user` | id, name, auth method |
| `team` | id, name, plan, seats |
| `membership` | user_id, team_id, role |
| `mailbox` | id, owner (user/team), provider, oauth tokens (encrypted), sync state |
| `message` | id, mailbox_id, thread_id, from/to, subject, body, provider_msg_id |
| `ai_meta` | message_id, journal, summary, extracted_actions[], draft_reply |
| `thread` | id, mailbox_id, ai_state (running summary + decision options) |
| `subscription` | team_id, plan, seat_count, provider_ref |

---

## 10. Privacy & security (non-negotiable)

- OAuth tokens and mail bodies **encrypted at rest**; least-privilege scopes.
- Clear disclosure + consent that content is processed by an AI model; per-team data-processing controls.
- Ability to route to a specific/on-prem model for enterprise (roadmap).
- No training on customer mail. No cross-tenant leakage.
- Deletion: disconnecting a mailbox purges synced content.

---

## 11. Pricing (open — placeholder)

- **Free:** 1 mailbox, solo, core AI features.
- **Pro:** multiple mailboxes (incl. work), solo.
- **Team:** per-seat; shared mailbox; admin controls.
- Directional numbers mentioned (~$10 base, ~$1/seat-style add-on) are **placeholders** — needs a proper pricing pass, including local (Telebirr/CBE) rails for the Ethiopian market.

---

## 12. Roadmap

**Phase 1 (v1):** Gmail-only, auth + account creation, team + invites, billing scaffolding, core AI inbox (journals, digest, promo collapse, action extraction, thread collapse, AI reply), DeepSeek.

**Phase 2:** Add providers (Zoho, IMAP/cPanel, Outlook, Yahoo). Listen/voice digest. End-of-day briefing polish.

**Phase 3:** Model choice / on-prem for enterprise. Deeper team collaboration. Local payment rails.

---

## 13. Open questions

1. Payment provider for v1 — Stripe now, local rails when? Behind an interface either way.
2. Gmail scopes — read-only vs modify (labels/send)? Affects consent friction and feature set.
3. Where does classification run — on ingest (cost, freshness) vs on first view (lazy)?
4. UI library confirmation (Tailwind + shadcn/ui assumed).
5. Free-tier abuse controls (one mailbox, rate limits on AI calls).
6. Naming — `Postscript` is a placeholder.
