# Settings information architecture + header redesign — design

- **Date:** 2026-06-20
- **Status:** Proposal — for review with the owner (NOT implemented)
- **Author:** ui-engineer
- **Scope:** Where settings live (scoping model), the AI-config scoping decision,
  per-project agent/model selection, the header redesign, the `/settings`
  surface, and a phased plan. **Design doc only — no app code, no migrations.**
- **Reconciles with:** the just-merged org-level multi-provider AI foundation
  (`ai_connection` + `ai_org_default`, migration `0003`, `docs/multi-provider-ai.md`).
  This spec **extends** that model; it does not throw it away.

---

## 0. Current state (what exists today)

**Tenancy** (`packages/db/src/schema/auth.ts`, `app.ts`):
`Organization → Workspace → Project → Diagram → Version`.
- `organization` + `member` (roles `owner | admin | member`) come from Better
  Auth's organization plugin. `session.activeOrganizationId` already tracks an
  active org — so **multi-org per user is structurally supported today**, even
  though `getUserOrgId()` collapses it to "first membership."
- `workspace` + `workspaceMember` (roles `admin | member`).
- `project` + `projectMember` (roles `owner | editor | viewer`).
- `user` (name, email, image) is the only profile surface; **there is no
  per-user preferences table** (no theme, no personal defaults).

**AI config today** is **org-level** and in transition:
- Legacy single-row `ai_provider_config` (one per org) — `@deprecated`, still the
  live read path via `getOrgAiConfig(orgId)` in `apps/web/lib/ai.ts`.
- New foundation (landed, not yet wired): `ai_connection` (one row per
  `(org, provider)`) + `ai_org_default` (one default `(provider, model)` per org).
  Writers/readers still point at the legacy table; the blueprint in
  `docs/multi-provider-ai.md` describes the follow-up wiring.
- All keys are **BYOK, AES-256-GCM encrypted** (`apps/web/lib/crypto.ts`).
- Edit gate: **org owner/admin only** (`saveAiConfig`, `removeAiConfig`).

**Header today** is two unrelated surfaces:
- Workbench: `apps/web/components/top-bar.tsx` — a floating frosted pill
  (brand `/ diagram / Saved`), an AI status pill (`AI: off|provider`), a gear to
  `/settings/ai`, and a sign-out button. No profile menu, no workspace context.
- Dashboard: an inline `<header>` inside `apps/web/components/dashboard.tsx` —
  brand `/ Projects` + a bare sign-out button. Duplicated brand markup; no
  shared component; no settings entry point at all.

**Settings surface today** is a single self-contained route: `/settings/ai`.
There is no `/settings` shell, no profile/org/team pages.

**Design tokens** (`apps/web/app/globals.css`): dark-first, Linear-minimal.
`--color-accent: #4d8dff` reserved for selection/primary/AI. shadcn primitives
available in `components/ui/`: `badge, button, command, dialog, input, label,
popover, select`. (No `dropdown-menu`, `tabs`, `avatar`, `tooltip`, `separator`
yet — the header/profile-menu work will add the first three.)

---

## 1. Settings scoping model

The guiding principle: **a setting lives at the lowest tier that fully owns its
meaning.** Identity and personal preference are the user's. Money, governance,
and shared resources are the org's. Membership is the tier it grants access to.
Run-time choices that a single diagram-editor makes belong to the project.

| Setting | Level | Who edits | Notes / rationale |
|---|---|---|---|
| Name, avatar/image | **User/Profile** | self | Already on `user`; just needs UI. Global identity, not per-org. |
| Email / password / sessions | **User/Profile** | self | Better Auth account surface. |
| Theme, density, reduced-motion pref | **User/Profile** | self | Pure presentation. Dark-first today; a `user_preference` table is the home for this (and for the personal AI bits below). |
| Default landing (last project, etc.) | **User/Profile** | self | Convenience; `user_preference`. |
| **AI provider connections + keys (shared)** | **Organization** | owner/admin | Governance + (future) billing live with the org. This is `ai_connection` as it exists today. |
| **AI org default model** | **Organization** | owner/admin | `ai_org_default` as it exists today. The fallback every run resolves to. |
| **Personal AI key (optional BYO)** | **User/Profile** | self | *New, optional.* A member's own key for a provider, used only by their own runs. See §2. Off by default; org keys are the norm. |
| **Per-project default model / agent** | **Project** | project owner/editor | *New.* A pointer that overrides the org default for runs in this project. Resolves against connections the org has. See §2–§3. |
| Org name, slug, logo | **Organization** | owner/admin | `organization` table. |
| Member roles + invites (org) | **Organization** | owner/admin | `member` + `invitation` (Better Auth org plugin). |
| Workspace name/slug, workspace members | **Workspace/Team** | workspace admin | `workspace` + `workspaceMember`. "Team" in the UI = Workspace + Org members combined. |
| Project name/description, project members | **Project** | project owner | `project` + `projectMember`. |
| **Billing / plan / usage / spend caps** (future) | **Organization** | owner | The org is the billing entity. Hard dependency on shared org keys/gateway being the metered path. Stub now, build P4. |
| Asset Catalog (types, assets, links) | **Organization** | owner/admin | Already org-scoped (G3). Confirmed correct — assets are shared org IP. |
| Audit log / data export (future) | **Organization** | owner/admin | Org-level compliance surface. |

**Reconciling the owner's hypothesis ("settings must be user level"):**
this is **right for identity and preference, wrong for the team-shared and
metered things.** Claril is explicitly team-oriented (shared org Asset Catalog,
roles, future billing). Provider keys and the default model are governance +
spend concerns → they stay **org-level**. We honour the user-level intent by
(a) building a real Profile surface, and (b) allowing an **optional personal
key** so a solo user or a contractor can BYO without org-admin rights. So the
answer is **hybrid, defaulting to org**, not "everything user-level."

---

## 2. The crux — AI config scoping

### The three candidate models

**A. Org-level only (status quo + multi-provider foundation).**
All connections + keys + default belong to the org; owner/admin manage them; all
members share them.
- ✅ Single source of truth; trivial governance; the obvious billing path; matches
  the team product; **zero schema change** (the foundation already does this).
- ❌ A solo user or contractor with no admin rights can't turn AI on for
  themselves. Every key is visible-in-effect to every member's runs (cost
  attribution is org-wide, not per-person). The owner's "user-level" instinct is
  unmet.

**B. User-level only (the literal reading of the owner's note).**
Each user brings their own key; nothing shared.
- ✅ Matches "settings must be user level"; personal cost ownership; no admin
  bottleneck; great for OSS/self-host solo use.
- ❌ Breaks the team story: no shared governance, no org spend caps, no billing
  entity, every teammate must paste a key before AI works, the Asset-Catalog +
  advisor story fragments per person. Discards the just-landed foundation.

**C. Hybrid — org-shared connections (governed) + optional per-user personal
key + a per-project default-model/agent override. ← RECOMMENDED.**
- Org connections (`ai_connection`) are the **default, governed, billable** path.
- A user **may optionally** add a **personal** connection for a provider; it is
  used only by that user's own runs (never by teammates). Off by default.
- A **per-project** pointer can pin a default `(provider, model)`/agent for runs
  in that project, resolving against whatever connections are reachable.
- ✅ Keeps governance + billing org-level; honours the user-level intent without
  fracturing the team; lets each project pick the right model (cheap model for a
  big legacy project, frontier model for a critical one); **builds on** the
  foundation with a small additive delta.
- ❌ Resolution logic is more involved (spelled out in §3); "whose key paid for
  this run" must be explicit in the UI to avoid cost surprises.

### Recommendation — adopt **C**, as a thin extension of the existing schema

Keep `ai_connection` and `ai_org_default` exactly as designed. Add:

1. **`user_id` nullable on `ai_connection`** → a connection is **org-shared** when
   `user_id IS NULL` (today's behaviour, the default) and **personal** when set.
   The unique key changes so a user can have a personal connection for a provider
   the org also has shared.

   ```
   ai_connection (revised)
     id              text PK
     organization_id text NN   FK organization        -- scope stays org-bound
     user_id         text NULL FK user                 -- NULL = org-shared; set = personal  [NEW]
     provider        text NN
     encrypted_key   text NULL
     base_url        text NULL
     default_model   text NULL
     created_at / updated_at
     -- replace ai_connection_org_provider_unique with a NULL-safe pair:
     UNIQUE (organization_id, provider) WHERE user_id IS NULL   -- ≤1 shared per provider  [NEW]
     UNIQUE (organization_id, user_id, provider)                -- ≤1 personal per user/provider [NEW]
     index on (organization_id), index on (user_id)
   ```

   > Postgres needs the shared-uniqueness as a **partial unique index**
   > (`WHERE user_id IS NULL`) because `NULL` is not equal to `NULL` in a plain
   > composite unique. Migration note below.

2. **`user_preference`** (new table) — the home for user-level settings, incl. an
   optional personal-model preference pointer:

   ```
   user_preference
     user_id        text PK   FK user ON DELETE cascade
     theme          text NULL          -- 'dark' (default) | 'system' | 'light'
     reduced_motion boolean default false
     ai_prefer_personal boolean default false  -- "use my personal key when available"
     ai_pref_provider text NULL                 -- optional personal default provider
     ai_pref_model    text NULL                 -- optional personal default model
     updated_at     timestamp
   ```

3. **`ai_project_default`** (new table) — the per-project default pointer,
   mirroring `ai_org_default`'s single-row-per-scope design (PK = project_id):

   ```
   ai_project_default
     project_id text PK   FK project ON DELETE cascade
     provider   text NN              -- must match a connection reachable for this project's org
     model      text NN
     -- future agent fields (persona/tools) attach here; see §3
     updated_at timestamp
   ```

   Same rationale as `ai_org_default`: the default is a property of the project,
   PK makes "exactly one default per project" structurally true, no `is_default`
   flag gymnastics, no composite FK (the action layer validates `provider` is a
   live connection and clears/repoints when a connection is removed).

**Migration impact** (one additive migration, e.g. `0004`):
- `ALTER TABLE ai_connection ADD COLUMN user_id text NULL` + FK + index.
- Drop `ai_connection_org_provider_unique`; add the two new (partial + full)
  unique indexes. **Backfill is a no-op** — every existing row has
  `user_id = NULL` (org-shared), which is exactly the intended default, so the
  partial unique index holds with zero data changes.
- `CREATE TABLE user_preference`, `CREATE TABLE ai_project_default` (+ FKs).
- Purely additive and backward-compatible: the live legacy `ai_provider_config`
  path and the new resolver are untouched. Reversible (drop the new columns/tables).
- **Does not block** the multi-provider follow-up wiring — it composes with it.
  Ideally land the resolver switch (per `docs/multi-provider-ai.md`) **first or
  together**, since this delta extends that resolver.

**Who pays / cost clarity (UI requirement, not schema):** every AI run shows
which connection it used — an org pill (org logo) vs a personal pill ("your
key"). Personal connections are opt-in and never silently override a working org
connection unless the user set `ai_prefer_personal`.

---

## 3. Per-project agent/model selection

### What "agent" means here
For the first slice an **agent = a `(provider, model)` pair** — i.e. choosing
"Claude Sonnet" vs "GPT-4o" vs a local Ollama model for this project's AI runs.
The schema (`ai_project_default`) is shaped so that **future** agent attributes —
**persona/system-prompt, allowed tools, temperature, an EditPlan policy** (see
the agentic-editing spec) — attach to the same project-scoped row without another
migration reshuffle. So "agent" today is "model pick"; tomorrow it's "named,
configured advisor persona." We call the UI control **Model / Agent** to leave
room without overpromising.

### Resolution order (single source of truth for the resolver)
When an AI run needs a config, resolve in this order and **stop at the first hit**:

1. **Per-run override** (if the workbench model switcher set one for this session)
   → `{provider, model}`.
2. **Per-project default** — `ai_project_default[project_id]`, if set.
3. **User preference** — if `user_preference.ai_prefer_personal` and the user has
   a usable personal connection, use `user_preference.ai_pref_*` (or that
   connection's default model).
4. **Org default** — `ai_org_default[org_id]`.
5. **Sole-connection rule** — if exactly one usable connection exists for the
   org (or the user has exactly one personal one), use it.
6. Else → `null` → the familiar "No AI provider configured" → one-click setup.

Then **select the connection** that satisfies the chosen `(provider)`:
prefer a **personal** connection for that provider if the user has one *and*
`ai_prefer_personal` is set; otherwise the **org-shared** connection. Build
`LLMProviderConfig` from it (decrypt key, baseUrl, model = chosen model). This is
the natural superset of the resolver already specified in
`docs/multi-provider-ai.md` §1 — that doc's steps 2–4 become steps 4–6 here, with
1–3 layered on top.

### UX
- **Workbench header**: a compact **Model / Agent** selector (popover, grouped by
  provider, sourced from `listConnections(org, user)` + the model catalog in
  `@claril/ai-advisor`). It shows the *effective* default for the current project
  with a subtle source hint ("project default" / "org default" / "your key").
  Selecting an entry sets the **per-run** override; a secondary action
  **"Set as project default"** writes `ai_project_default` (gated to project
  owner/editor). The `✦` badge marks it as an AI control.
- **Project settings page** (§5): the canonical place to set the project default
  model/agent, with the same selector plus the future persona/tool fields.
- **No connection?** the selector collapses to a quiet **"Connect AI"** CTA →
  settings (org) or "Add your key" (personal) — never a blocking modal (T3 rule).

---

## 4. Header redesign

### Goals
- One **shared header component** for dashboard **and** workbench (kill the
  duplicated brand markup). Context-aware: it renders more breadcrumb in the
  workbench, more nav on the dashboard.
- Host: brand/home · workspace→project context · an **org/workspace switcher**
  (future-proof, even if single-org today) · **AI status + quick Model/Agent
  switch** · a **profile menu** (profile / settings / theme / sign out) · a path
  into the settings surface.
- Keep the **floating frosted** aesthetic in the workbench (canvas-maximal,
  `pointer-events-none` header with `pointer-events-auto` islands) and a docked
  hairline-bordered bar on the dashboard. Reuse `popover` + add `dropdown-menu`,
  `avatar`, `tooltip` from shadcn. Never hardcode colors — use tokens.

### New / reused primitives
- **`<AppHeader context="dashboard" | "workbench" ... />`** — the shared shell.
- **`<OrgWorkspaceSwitcher />`** — popover listing orgs (Better Auth
  `activeOrganizationId`) → workspaces. Single-org today renders as a static
  label that *upgrades* to a switcher when >1 exists. Future-proofs multi-org.
- **`<AiStatusButton />`** — the existing pill, but its menu now also hosts the
  quick **Model/Agent** switch (§3) and "AI: off → Connect".
- **`<ProfileMenu />`** — avatar → dropdown: name/email header, **Profile**,
  **Settings**, **Theme** submenu, **Sign out**. Replaces the bare sign-out
  buttons in both surfaces.

### Mockup A — Dashboard (docked bar)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ● Claril   [ Acme ▾ / Platform Team ▾ ]            ✦ AI: Anthropic ▾    ( G ) ▾ │
└──────────────────────────────────────────────────────────────────────────────┘
   ▲ brand    ▲ org / workspace switcher          ▲ AI status+model  ▲ profile menu
                                                                        │
                                          ┌─────────────────────────────┘
                                          │  giorgi@…  (Giorgi N.)
                                          │  ─────────────────────
                                          │  Profile
                                          │  Settings            ⌘,
                                          │  Theme            Dark ▸
                                          │  ─────────────────────
                                          │  Sign out
                                          └─────────────────────────────
```

### Mockup B — Workbench (floating frosted islands over the canvas)

```
┌ float ─────────────────────────┐                        ┌ float ───────────────────────┐
│ ● Claril / Platform / Order…    │      (full-bleed       │ ✦ Anthropic·Sonnet ▾   ( G )▾ │
│   ↳ "Checkout flow"  · Saved    │       canvas)          └───────────────────────────────┘
└─────────────────────────────────┘                          ▲ Model/Agent     ▲ profile
   ▲ brand→home  ▲ project · diagram · save state              quick-switch       menu

      Model/Agent popover (from the ✦ pill):
      ┌──────────────────────────────┐
      │ Effective: Sonnet  (project)  │
      │ ── Anthropic (org) ───────────│
      │  • Claude Sonnet         ✓    │
      │  • Claude Opus                │
      │ ── OpenAI (org) ──────────────│
      │  • GPT-4o                     │
      │ ── Your key (personal) ───────│
      │  • Llama 3 (Ollama)           │
      │ ──────────────────────────────│
      │  Set as project default       │
      │  Manage AI in settings →      │
      └──────────────────────────────┘
```

Notes: the brand pill stays the "back to projects" affordance. Save state stays
where it is. The right island merges the AI pill + the profile menu so the canvas
keeps its breathing room. On the dashboard, the breadcrumb is org/workspace; in
the workbench it's project → diagram. `prefers-reduced-motion` respected; menu
open/close 150–200ms.

---

## 5. Settings surface structure

A real `/settings` area replacing the lone `/settings/ai` route. Left rail of
sections (or, when nav budget is tight, a `tabs` row), content on the right.
Sections gate on role; you only see what you can touch.

```
/settings
  /profile            User/Profile   — name, avatar, email, theme, reduced-motion   [P1]
  /ai                 User/Profile   — your personal key(s) + "prefer my key"       [P2]
                      + (if owner/admin) link/inline to org AI below
  /organization       Organization   — name, slug, logo                              [P3]
    /organization/ai  Organization   — shared connections + org default (the cards   [P2]
                                        grid from multi-provider-ai.md §3)
    /organization/members  Org        — members + roles + invitations                [P3]
    /organization/billing  Org        — plan / usage / spend caps (stub→build)        [P4]
  /workspace/[id]     Workspace/Team  — name, members                                 [P3]
  /project/[id]       Project         — name, description, members, default model/agent [P2/P3]
```

**Routing/nav.** `/settings` is a server layout with an auth guard (redirect to
`/sign-in`) and a client left-rail driven by role + active org. The existing
`/settings/ai` **becomes `/settings/organization/ai`** (org shared keys) and a new
`/settings/ai` hosts the *personal* key surface — a deliberate rename so the URL
matches the scope. Entry points: the profile menu's **Settings** item, the
workbench gear, and the Model/Agent popover's "Manage AI" link all land here.

**Ships first vs later:** Profile + Settings shell + the AI cards relocation are
P1/P2; org members, workspace, billing are P3/P4 (see below).

---

## 6. Phased plan

Ordered, each phase independently shippable. "Files" lists the load-bearing
touch points, not an exhaustive list.

### P1 — Header unification + profile menu + settings shell *(UI-only, no schema)*
- **Scope:** one `<AppHeader>` used by dashboard + workbench; `<ProfileMenu>`
  (profile/settings/theme/sign out); `<OrgWorkspaceSwitcher>` (static label,
  switcher-ready); `/settings` shell + `/settings/profile` (name/avatar/theme).
  Theme is client-stored until `user_preference` lands (P2).
- **Files:** new `components/app-header.tsx`, `components/profile-menu.tsx`,
  `components/org-workspace-switcher.tsx`; refactor `components/top-bar.tsx` +
  `components/dashboard.tsx` to consume it; new `app/settings/layout.tsx`,
  `app/settings/profile/page.tsx`; add shadcn `dropdown-menu`, `avatar`,
  `tooltip`, `separator` to `components/ui/`.
- **Schema:** none.
- **Dependencies:** none. Pure front-end refactor — safe to land first.

### P2 — AI-config scoping change + per-project model override
- **Scope:** the §2 schema delta (`ai_connection.user_id`, `user_preference`,
  `ai_project_default`); evolve `getOrgAiConfig` → the §3 resolver (`resolveAiConfig(orgId, userId, projectId, override?)`); org shared-connections cards (relocate `/settings/ai` → `/settings/organization/ai`); personal-key surface at `/settings/ai`; project default control in project settings + the workbench **Model/Agent** popover; cost-source pills.
- **Files:** `packages/db/src/schema/app.ts` (+ migration `0004`); `apps/web/lib/ai.ts`; `apps/web/lib/actions.ts` (`runAdvisor`/`runDocGen`/`runAdvisorQuestion` gain `override`; add `connect/removeAiProvider`, `setOrgDefaultModel`, `setProjectDefaultModel`, personal-key actions); `components/ai-settings-dialog.tsx` + `components/ai/*`; new project-settings page; `components/top-bar.tsx`/`app-header.tsx` model switcher.
- **Schema:** additive migration `0004` (see §2). No-op backfill.
- **Dependencies:** ideally lands with/after the `multi-provider-ai.md` wiring (it extends that resolver). Header from P1 hosts the switcher.

### P3 — Organization, workspace & member settings
- **Scope:** `/settings/organization` (name/slug/logo), `/settings/organization/members` (list, role change, invite/revoke via Better Auth org plugin), `/settings/workspace/[id]`, `/settings/project/[id]` members; the switcher becomes a real multi-workspace/org switcher.
- **Files:** new `app/settings/organization/**`, `app/settings/workspace/[id]/page.tsx`, `app/settings/project/[id]/page.tsx`; member/invite server actions; `org-workspace-switcher.tsx` upgrade.
- **Schema:** none new (uses `organization`, `member`, `invitation`, `workspace`, `workspaceMember`, `project`, `projectMember`).
- **Dependencies:** P1 shell.

### P4 — Billing / plan / usage *(future)*
- **Scope:** org billing entity, plan, usage metering tied to **org-shared** connections / a gateway, spend caps; `/settings/organization/billing`.
- **Files:** new billing schema + provider integration (out of scope to detail here); `app/settings/organization/billing/page.tsx`.
- **Schema:** new billing tables (TBD).
- **Dependencies:** P2 (the metered path is org-shared connections), an owner decision on billing model (§7).

---

## 7. Open questions for review

1. **Personal keys alongside org keys — yes or no?** The recommendation (model C)
   allows an **optional** per-user personal connection. If the owner wants strict
   governance, we drop the `user_id` column and ship org-only (model A) — simpler,
   but unmet "user-level" intent. **Decision needed before P2 schema.**
2. **Whose key pays, and is that acceptable?** With personal keys, cost
   attribution splits (org vs individual). Confirm the UI cost-source pills are
   enough, or whether personal keys should be **self-host-only** / disabled on the
   hosted plan.
3. **Single-org vs multi-org per user.** The schema + Better Auth already support
   multi-org (`activeOrganizationId`); `getUserOrgId` collapses it. Do we commit
   to multi-org now (build the switcher for real in P3) or keep single-org and
   defer? Affects how hard P1's switcher tries.
4. **Billing assumptions.** Is the org the sole billing entity (assumed here)? Is
   billing hosted-only, or also relevant to self-host (likely BYO-only there)?
   This sets whether P4 even applies to OSS/self-host installs.
5. **"Agent" scope creep.** Is per-project selection just `(provider, model)` for
   now (recommended), or does the owner want personas/tools/temperature in the
   first cut? Reshaping `ai_project_default` later is cheap, but the UI label and
   expectations differ.
6. **Theme storage.** Ship theme in `user_preference` (server, P2) or keep it
   client-only (localStorage) given dark-first is the only real theme today?
   Determines whether P1 needs any schema at all (recommendation: client-only in
   P1, migrate to `user_preference` in P2).
