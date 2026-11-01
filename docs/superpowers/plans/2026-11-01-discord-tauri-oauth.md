# Discord OAuth via system browser (Tauri) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open Discord login in the OS browser from the Tauri app and return a working `echbox_session` cookie into the webview via `echbox://` deep link + one-time claim.

**Architecture:** Backend stores OAuth `state`/PKCE and one-time claim tokens in SQLite. Desktop start returns JSON `{ url }` (no 302). Discord still callbacks to the backend; desktop flows redirect to `echbox://auth/callback?token=…`. The app claims the token over HTTP so Set-Cookie lands in the Tauri webview. Opener + deep-link Tauri plugins wire the OS browser and return path.

**Tech Stack:** Bun, Elysia, Drizzle/`bun:sqlite`, Arctic Discord, Tauri 2 (`tauri-plugin-opener`, `tauri-plugin-deep-link`), Nuxt (client-only), Eden

**Spec:** `docs/superpowers/specs/2026-11-01-discord-tauri-oauth-design.md`

## Global Constraints

- Product path is Tauri-only; do not navigate the webview to Discord
- Discord redirect URI stays on backend (`DISCORD_REDIRECT_URI`, default `http://localhost:3001/api/auth/discord/callback`)
- Session cookie remains `echbox_session` (httpOnly, SameSite=Lax; Secure in production)
- Deep link scheme default `echbox`; claim TTL **5 minutes**, single-use
- OAuth pending TTL **10 minutes** (match existing cookie max-age)
- Ids: `crypto.randomUUID()`; claim token: cryptographically random URL-safe string (≥32 bytes)
- Env: existing Discord/session vars; optional `DESKTOP_AUTH_SCHEME` (default `echbox`)

## Review Focus

- Reusing a claim token after success → 400/401, session not re-issued
- Expired claim or OAuth pending row → fail closed (no session)
- Callback with mismatched/missing `state` → 400 (unchanged)
- Cold-start deep link (app launched by `echbox://…`) still claims and sets cookie
- Non-desktop `GET /api/auth/discord` (no `desktop=1`) keeps cookie+302 path for tests/dev

---

## File Structure

| Path | Role |
| --- | --- |
| `packages/backend/src/db/schema.ts` | `oauth_pending`, `auth_claims` tables |
| `packages/backend/drizzle/` | new migration |
| `packages/backend/src/auth/oauth-store.ts` | pending OAuth + claim CRUD |
| `packages/backend/src/routes/auth.ts` | desktop start, callback redirect, `POST /claim` |
| `packages/backend/src/__tests__/auth.test.ts` | desktop + claim coverage |
| `packages/backend/.env.example` | note `DESKTOP_AUTH_SCHEME` |
| `packages/frontend/src-tauri/Cargo.toml` / `lib.rs` / `tauri.conf.json` / `capabilities/default.json` | opener + deep-link |
| `packages/frontend/package.json` | JS plugin deps |
| `packages/frontend/app/composables/useAuth.ts` | system-browser login + claim |
| `packages/frontend/app/plugins/auth-deep-link.client.ts` | listen / cold-start deep links |

---

### Task 1: OAuth pending + claim store (SQLite)

**Files:**
- Modify: `packages/backend/src/db/schema.ts`
- Create: `packages/backend/src/auth/oauth-store.ts`
- Create/update migration under `packages/backend/drizzle/` via `bun run` drizzle generate from backend package
- Test: `packages/backend/src/__tests__/auth-oauth-store.test.ts`

**Interfaces:**
- Produces:
  - `saveOAuthPending({ state, codeVerifier, desktop: boolean, expiresAt: string }, dbPath?: string): void`
  - `takeOAuthPending(state: string, dbPath?: string): { codeVerifier: string; desktop: boolean } | null` — deletes row; null if missing/expired
  - `createAuthClaim(sessionId: string, dbPath?: string): string` — returns token; TTL 5 min
  - `consumeAuthClaim(token: string, dbPath?: string): string | null` — returns `sessionId` once; null if missing/expired/used
- Tables:
  - `oauth_pending(state PK, code_verifier, desktop integer 0/1, expires_at)`
  - `auth_claims(token PK, session_id, expires_at, used_at nullable)`

- [ ] **Step 1: Write failing tests** `save+take round-trip`, `take expired → null`, `create+consume once then second consume → null`

- [ ] **Step 2: Run — expect FAIL**

Run: `bun test packages/backend/src/__tests__/auth-oauth-store.test.ts`  
Expected: FAIL (module/table missing)

- [ ] **Step 3: Add schema tables, generate+apply migration, implement `oauth-store.ts`**

- [ ] **Step 4: Run — expect PASS**

Run: `bun test packages/backend/src/__tests__/auth-oauth-store.test.ts`

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/db/schema.ts packages/backend/src/auth/oauth-store.ts packages/backend/drizzle packages/backend/src/__tests__/auth-oauth-store.test.ts
git commit -m "$(cat <<'EOF'
feat(backend): store Discord OAuth pending state and one-time auth claims

EOF
)"
```

---

### Task 2: Desktop Discord start, deep-link callback, claim route

**Files:**
- Modify: `packages/backend/src/routes/auth.ts`
- Modify: `packages/backend/src/__tests__/auth.test.ts`
- Modify: `packages/backend/.env.example` (document `DESKTOP_AUTH_SCHEME`)

**Interfaces:**
- Consumes: Task 1 store + existing `createDiscordAuthUrl`, `exchangeDiscordCodeForUser`, `createSession`, cookie helpers
- Produces HTTP:
  - `GET /api/auth/discord?desktop=1` → **200** `{ url: string }` (Discord authorize URL); persists pending with `desktop: true`; **no** Set-Cookie for oauth state
  - `GET /api/auth/discord` (no desktop) → keep current **302** + state/verifier cookies (tests)
  - `GET /api/auth/discord/callback` — validate via cookies **or** `takeOAuthPending(state)`; on desktop success redirect to `${scheme}://auth/callback?token=<claim>` where `scheme = DESKTOP_AUTH_SCHEME || "echbox"`; non-desktop still redirects `FRONTEND_URL/` with session cookie
  - `POST /api/auth/claim` body `{ token: string }` → **200** `{ ok: true }` + `Set-Cookie` session built from consumed claim’s `sessionId` (look up session row / re-serialize cookie with same id via helper — prefer exporting `serializeSessionCookie(sessionId)` from `session.ts` rather than creating a second session); invalid → **400** `{ error: string }`

- [ ] **Step 1: Extend `auth.test.ts` with failing cases:**
  - `GET /api/auth/discord?desktop=1` → 200 JSON with discord authorize URL; no `discord_oauth_state` Set-Cookie; pending row exists for state in URL
  - desktop callback (pending row, mocked Discord fetch) → 302 Location starts with `echbox://auth/callback?token=`
  - `POST /api/auth/claim` with that token → 200 + session cookie; `/me` works; second claim → 400
  - Keep existing non-desktop redirect-to-`FRONTEND_URL` test green (cookie path)

- [ ] **Step 2: Run focused auth tests — expect FAIL on new cases**

Run: `bun test packages/backend/src/__tests__/auth.test.ts`

- [ ] **Step 3: Implement desktop start/callback/claim in `routes/auth.ts`; add `serializeSessionCookie(sessionId: string): string` (or equivalent) in `session.ts` if needed so claim does not insert a duplicate session**

- [ ] **Step 4: Run — expect PASS**

Run: `bun test packages/backend/src/__tests__/auth.test.ts`

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/routes/auth.ts packages/backend/src/auth/session.ts packages/backend/src/__tests__/auth.test.ts packages/backend/.env.example
git commit -m "$(cat <<'EOF'
feat(backend): desktop Discord OAuth start, deep-link redirect, and claim

EOF
)"
```

---

### Task 3: Tauri opener + deep-link wiring

**Files:**
- Modify: `packages/frontend/src-tauri/Cargo.toml`
- Modify: `packages/frontend/src-tauri/src/lib.rs`
- Modify: `packages/frontend/src-tauri/tauri.conf.json` — `plugins.deep-link.desktop.schemes: ["echbox"]`
- Modify: `packages/frontend/src-tauri/capabilities/default.json` — permissions for opener + deep-link
- Modify: `packages/frontend/package.json` — `@tauri-apps/plugin-opener`, `@tauri-apps/plugin-deep-link`

**Interfaces:**
- Produces: app registers `echbox://`; JS can `open(url)` and `onOpenUrl` / `getCurrent`
- Prefer `bun tauri add deep-link` and `bun tauri add opener` from `packages/frontend` so Cargo/capabilities stay consistent; then verify scheme `echbox` in conf

- [ ] **Step 1: Add plugins via Tauri CLI from `packages/frontend`, set scheme to `echbox`, ensure `lib.rs` initializes both plugins**

- [ ] **Step 2: Verify config** — `tauri.conf.json` contains deep-link desktop schemes including `echbox`; capabilities mention opener/deep-link permissions; `bun install` at repo root if lockfile changed

- [ ] **Step 3: Commit**

```bash
git add packages/frontend/src-tauri packages/frontend/package.json bun.lock
git commit -m "$(cat <<'EOF'
feat(tauri): register echbox deep link and system opener

EOF
)"
```

---

### Task 4: Frontend login opens system browser; deep link claims session

**Files:**
- Modify: `packages/frontend/app/composables/useAuth.ts`
- Create: `packages/frontend/app/plugins/auth-deep-link.client.ts`
- Optional tiny helper: `packages/frontend/app/utils/auth-deeplink.ts` — `parseClaimToken(url: string): string | null` for `echbox://auth/callback?token=`

**Interfaces:**
- Consumes: `GET /api/auth/discord?desktop=1`, `POST /api/auth/claim`, opener `open`, deep-link `getCurrent` + `onOpenUrl`
- `login()`: fetch desktop URL with `credentials: 'include'` not required; `open(url)` via `@tauri-apps/plugin-opener`; never set `window.location` to Discord
- Deep-link handler: extract token → `api.api.auth.claim.post({ token }, { fetch: { credentials: 'include' } })` → `refresh()`; focus main window if API available
- Cold start: on plugin init, `getCurrent()` and handle same as `onOpenUrl`
- Detect Tauri with `window.__TAURI_INTERNALS__` or `@tauri-apps/api/core` `isTauri()` if available — if somehow not Tauri, still use desktop JSON + `window.open` only as last resort; product assumes Tauri

- [ ] **Step 1: Implement `parseClaimToken` + unit test in frontend if a `*.test.ts` pattern exists nearby; otherwise keep parser trivial inline and cover via manual smoke notes in commit body**

- [ ] **Step 2: Update `useAuth.login` and add `auth-deep-link.client.ts` plugin**

- [ ] **Step 3: Typecheck / smoke**

Run: `bun run typecheck` from repo root (and frontend check if separate)  
Expected: no new type errors in auth paths

- [ ] **Step 4: Commit**

```bash
git add packages/frontend/app/composables/useAuth.ts packages/frontend/app/plugins/auth-deep-link.client.ts packages/frontend/app/utils/auth-deeplink.ts
git commit -m "$(cat <<'EOF'
feat(frontend): open Discord in system browser and claim session via deep link

EOF
)"
```

---

### Task 5: End-to-end verification notes + backend suite green

**Files:** none required beyond fixes discovered while verifying

- [ ] **Step 1: Run full backend tests**

Run: `bun test` from repo root  
Expected: PASS

- [ ] **Step 2: Manual smoke checklist (document results in PR/commit message if running locally):**
  1. `bun run dev:backend` + `bun run dev:tauri`
  2. Click Login → OS browser opens Discord
  3. Approve → browser hits backend → OS offers/opens echbox
  4. App shows logged-in user; `/api/auth/me` via app works
  5. Logout clears session

- [ ] **Step 3: Commit only if fixes were needed**
