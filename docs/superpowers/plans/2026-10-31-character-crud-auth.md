# Character CRUD + Discord Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist user-owned character cards in SQLite (Drizzle), authenticate via Discord OAuth, enforce author-only CRUD with full-file SHA-256 dedupe, and generate WebP previews with `Bun.Image`.

**Architecture:** Drizzle on `bun:sqlite` owns users, sessions, cards, and versions. Arctic handles Discord OAuth; sessions are HTTP-only cookies. Upload pipeline hashes the entire original, rejects duplicates, parses with kkloader, writes `original.png` + `preview.webp`. Character list/detail switch to DB; scene gallery stays on fixtures.

**Tech Stack:** Bun, Elysia, Drizzle ORM + drizzle-kit, Arctic (`Discord`), `bun:sqlite`, `Bun.Image`, Nuxt, Eden

**Spec:** `docs/superpowers/specs/2026-10-31-character-crud-auth-design.md`

## Global Constraints

- `bun:sqlite` only; Drizzle driver `drizzle-orm/bun-sqlite`
- Discord: `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_REDIRECT_URI`; also `SESSION_SECRET`, `FRONTEND_URL`, `DATABASE_PATH` (default `packages/backend/data/sqlite.db`)
- Cookie `echbox_session`, httpOnly, sameSite=lax; secure when `NODE_ENV=production`
- SHA-256 of **entire original upload**, lowercase hex, unique across all versions; compare never uses WebP
- PNG update → new version; PATCH title/slug without new version; author-only mutate; hard delete
- Characters on `/` from DB; `/scenes` fixtures unchanged
- Register `GET /api/kk/cards/by-hash/:hash` **before** `/cards/:id` so `by-hash` is not captured as an id
- Ids: `crypto.randomUUID()`
- Preview: max edge **512**, WebP quality **80** via `new Bun.Image(bytes).resize(...).webp({ quality: 80 })` (adjust to actual Bun.Image API if method chaining differs — keep quality 80 / max 512)

## Review Focus

- Re-uploading identical original bytes (create or new version) → 409 with existing card/version, no new files
- Non-author PATCH/DELETE/POST version → 403
- Unauthenticated create → 401
- Hash lookup finds existing card; unknown hash → 404
- Image endpoint serves WebP preview by default (content-type `image/webp`), not the original PNG

---

## File Structure

| Path | Role |
| --- | --- |
| `packages/backend/drizzle.config.ts` | drizzle-kit config |
| `packages/backend/src/db/schema.ts` | Drizzle tables |
| `packages/backend/src/db/client.ts` | open DB + migrate helper |
| `packages/backend/src/db/migrate.ts` | CLI migrate entry |
| `packages/backend/drizzle/` | generated SQL migrations |
| `packages/backend/src/auth/session.ts` | create/read/revoke session, cookie helpers |
| `packages/backend/src/auth/discord.ts` | Arctic Discord client |
| `packages/backend/src/routes/auth.ts` | `/api/auth/*` |
| `packages/backend/src/cards/hash.ts` | `sha256Hex(bytes: Uint8Array): string` |
| `packages/backend/src/cards/preview.ts` | `writeWebpPreview(src: Uint8Array, destPath: string): Promise<void>` |
| `packages/backend/src/cards/storage.ts` | paths under `data/cards/{id}/v{n}/` |
| `packages/backend/src/cards/service.ts` | create/list/get/addVersion/patch/delete/findByHash |
| `packages/backend/src/routes/gallery.ts` | character reads from DB; scenes still seed; CRUD + by-hash |
| `packages/backend/.gitignore` | ignore `data/` |
| `packages/frontend/...` | login UI, upload, author actions |

---

### Task 1: Drizzle schema + DB client

**Files:**
- Create: `packages/backend/src/db/schema.ts`, `client.ts`, `migrate.ts`, `drizzle.config.ts`
- Modify: `packages/backend/package.json` (deps + scripts `db:generate`, `db:migrate`)
- Modify: `packages/backend/.gitignore` (ensure `data/` ignored)
- Test: `packages/backend/src/db/__tests__/schema.test.ts`

**Interfaces:**
- Produces tables: `users`, `sessions`, `characterCards`, `characterCardVersions` per spec
- `content_hash` column `text` **unique**
- `getDb(path?: string)` returns drizzle instance; tests use temp file under `os.tmpdir()`

- [ ] **Step 1: Write failing test** that opens temp DB, runs migrate, inserts a version with `content_hash`, and asserts a second insert with same hash throws/fails unique

- [ ] **Step 2: Run — expect FAIL**

Run: `bun test packages/backend/src/db/__tests__/schema.test.ts`  
Expected: FAIL (module missing)

- [ ] **Step 3: Add `drizzle-orm`, `drizzle-kit`, `arctic`; implement schema, client, generate+apply migration**

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/db packages/backend/drizzle.config.ts packages/backend/drizzle packages/backend/package.json packages/backend/.gitignore bun.lock
git commit -m "$(cat <<'EOF'
feat(backend): add Drizzle SQLite schema for users and character cards

EOF
)"
```

---

### Task 2: Hash + WebP preview helpers

**Files:**
- Create: `packages/backend/src/cards/hash.ts`, `preview.ts`
- Test: `packages/backend/src/cards/__tests__/hash.test.ts`, `preview.test.ts`

**Interfaces:**
- `sha256Hex(bytes: Uint8Array): string` — 64-char lowercase hex
- `writeWebpPreview(sourcePngOrImageBytes: Uint8Array, destPath: string): Promise<void>` — max edge 512, webp q=80; creates parent dirs

- [ ] **Step 1: Failing tests**

```ts
test("sha256Hex is stable 64 hex", () => {
  expect(sha256Hex(new TextEncoder().encode("abc"))).toBe(
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
});

test("writeWebpPreview writes webp magic", async () => {
  // use a tiny real PNG from fixtures/chara/kk_chara.png face/image or minimal PNG
  // expect dest ends with RIFF....WEBP
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement helpers** (`new Bun.Image(bytes)` + resize + `.webp()` / `.write`)

- [ ] **Step 4: PASS**

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(backend): add content hash and Bun.Image WebP preview helpers

EOF
)"
```

---

### Task 3: Discord OAuth + sessions

**Files:**
- Create: `packages/backend/src/auth/session.ts`, `discord.ts`, `routes/auth.ts`
- Modify: `packages/backend/src/app.ts` (`.use(authRoutes)`, cookie plugin if needed)
- Test: `packages/backend/src/__tests__/auth.test.ts` (mock Discord token exchange where needed; session create/me/logout with cookie)

**Interfaces:**
- `createSession(userId: string): Promise<{ id: string; cookie: string }>`
- `getUserFromSessionCookie(cookieHeader: string | null): Promise<User | null>`
- Routes: `GET /api/auth/discord`, `GET /api/auth/callback/discord` (or `/api/auth/discord/callback` — **lock:** `/api/auth/discord/callback`), `POST /api/auth/logout`, `GET /api/auth/me`
- On callback: upsert user by `discord_id`, set cookie, redirect `FRONTEND_URL/`

- [ ] **Step 1: Failing tests** for session round-trip and `GET /api/auth/me` 401 without cookie / 200 with valid session (insert user+session directly, skip live Discord)

- [ ] **Step 2: FAIL**

- [ ] **Step 3: Implement Arctic Discord + session cookie auth routes; export `authDerive` for later CRUD**

- [ ] **Step 4: PASS**

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(backend): add Discord OAuth and cookie sessions

EOF
)"
```

---

### Task 4: Character card service (CRUD + dedupe)

**Files:**
- Create: `packages/backend/src/cards/storage.ts`, `service.ts`
- Test: `packages/backend/src/cards/__tests__/service.test.ts` (temp DB + temp data dir; fixture PNG)

**Interfaces:**
- `createCard({ authorId, title?, fileBytes, notes? })`
- `addVersion({ cardId, authorId, fileBytes, notes? })` — 403 if not author; 409 if hash exists
- `findByHash(hash: string): { cardId, version } | null`
- `listCharacters()`, `getCard(id)`, `patchCard`, `deleteCard`
- On create/addVersion: hash → unique check → kkloader load → write original + preview → insert rows

- [ ] **Step 1: Failing tests** including: create ok; duplicate bytes → conflict; second create same file 409; addVersion as other user 403; findByHash

- [ ] **Step 2: FAIL**

- [ ] **Step 3: Implement service**

- [ ] **Step 4: PASS**

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(backend): character card CRUD with hash dedupe and previews

EOF
)"
```

---

### Task 5: HTTP routes — gallery split + CRUD + by-hash

**Files:**
- Modify: `packages/backend/src/routes/gallery.ts`, `app.ts`
- Modify: `packages/backend/src/gallery/service.ts` (scenes-only list OR filter characters out of seed)
- Test: `packages/backend/src/__tests__/gallery.test.ts` + new `cards-http.test.ts`

**Interfaces:**
- `GET /api/kk/cards?type=character` → DB list (preview URLs)
- `GET /api/kk/cards?type=scene` → existing seed scenes
- `GET /api/kk/cards/by-hash/:hash` → lookup
- Auth CRUD routes as spec
- Default image response: WebP from `preview_path`

- [ ] **Step 1: Failing HTTP tests** for by-hash 404/200, character list empty then after create, duplicate 409, scene list still works

- [ ] **Step 2: FAIL**

- [ ] **Step 3: Wire routes; ensure by-hash registered before `:id`**

- [ ] **Step 4: PASS** (`bun test packages/backend/src`)

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(backend): expose character DB gallery, hash lookup, and CRUD routes

EOF
)"
```

---

### Task 6: Frontend — auth + upload + author UI

**Files:**
- Modify: `AppNav.vue` (Login / user / Logout)
- Modify: `pages/index.vue` / `CardGalleryPage.vue` (upload when authed)
- Modify: `pages/cards/[id].vue` (author actions: patch title, new version, delete)
- Create: composable `useAuth.ts` calling `/api/auth/me`
- Optional: `pages/upload.vue` or modal on `/`

**Interfaces:**
- Login navigates to `${apiUrl}/api/auth/discord` (full page)
- Upload: `FormData` POST create; client may `sha256` then `GET by-hash` first (optional UX)
- Credentials: fetch/Eden with `credentials: "include"` — configure treaty/client accordingly

- [ ] **Step 1: Implement UI wired to APIs**

- [ ] **Step 2: Verify** typecheck / manual smoke with env Discord app (if credentials absent, UI still builds; document `.env.example`)

- [ ] **Step 3: Add `packages/backend/.env.example` with required keys**

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(frontend): Discord login and character upload/author controls

EOF
)"
```

---

## Spec coverage

| Spec item | Task |
| --- | --- |
| Drizzle + bun:sqlite | 1 |
| Discord + sessions | 3 |
| SHA-256 full file + unique + by-hash | 2, 4, 5 |
| WebP via Bun.Image | 2, 4 |
| Author-only CRUD | 4, 5, 6 |
| `/` DB characters, `/scenes` seed | 5, 6 |
| PNG → new version; PATCH metadata | 4, 5 |
