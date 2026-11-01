# Plugins & Softmods Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship separate Plugins and Softmods download libraries (upload, version, vote, download) with Sideloader GUID identity for softmods and generated GUIDs for plugins.

**Architecture:** Two independent stacks (Approach A): Drizzle tables + service + votes + Elysia routes for softmods and for plugins, mirroring the character-card CRUD/hash/vote pattern. Softmod create parses `manifest.xml` from a `.zipmod`; plugin create takes a `.zip` plus manual title/description. Frontend adds `/plugins` and `/softmods` catalog pages, detail routes, nav links, and profile sections.

**Tech Stack:** Bun, Elysia, Drizzle/`bun:sqlite`, `fflate` (zip), lightweight XML parse of Sideloader manifest, Nuxt, Eden, `@echbox/shared` Zod schemas

**Spec:** `docs/superpowers/specs/2026-11-01-plugins-softmods-design.md`

## Global Constraints

- Separate tables/APIs/pages for plugins vs softmods (no unified `mods` table)
- Softmod `id` = Sideloader GUID from `manifest.xml` only — never generate a softmod GUID
- Plugin `id` = `crypto.randomUUID()`
- Create vs new-version contract like cards: existing softmod GUID on `POST` create → 409 (no auto-version); new version only via `POST …/:id/versions` (author-only)
- SHA-256 of entire original archive, lowercase hex, unique per kind’s version table; duplicate → 409 with existing id + version
- Votes like cards (`like` | `dislike`); separate `softmod_votes` / `plugin_votes` tables
- No application-level archive size limit in v1
- No preview/webp pipeline in v1
- Public download of originals; auth required for create/version/patch/delete/vote
- Softmod UI: **Uploader** (echbox user) and **Author** (`mod_author`); plugins: Uploader only
- Profiles include plugins + softmods in lists and aggregated upload/likes stats
- API prefixes: `/api/softmods` and `/api/plugins` (register `by-hash` before `:id`)
- Reuse `sha256Hex` from `packages/backend/src/cards/hash.ts`
- Ids for version rows / vote rows: `crypto.randomUUID()`
- Softmod PATCH metadata: **none in v1** (title/description/`mod_author` refresh only when author uploads a new version); plugins: PATCH `title` / `description`
- Profile `stats.uploadCount` / `likesReceived` / `dislikesReceived`: **sum across cards + plugins + softmods**

## Review Focus

- Softmod `POST` create when GUID already exists → 409 with existing id, no new version row/files
- Softmod / plugin re-upload of identical bytes → 409 with existing id + version
- Non-author `POST …/versions` / `DELETE` / plugin `PATCH` → 403; unauthenticated create → 401
- Softmod missing/invalid `manifest.xml` or missing GUID → 400
- Softmod list/detail responses expose both `uploader` (user id/username) and `modAuthor` (manifest); never invent softmod id

---

## File Structure

| Path | Role |
| --- | --- |
| `packages/backend/src/db/schema.ts` | Add softmod + plugin tables |
| `packages/backend/drizzle/` | New migration |
| `packages/backend/src/softmods/manifest.ts` | Zip + `manifest.xml` → fields |
| `packages/backend/src/softmods/storage.ts` | Paths under `data/softmods/{id}/v{n}/` |
| `packages/backend/src/softmods/errors.ts` | Service errors (hash, guid, auth, not found) |
| `packages/backend/src/softmods/service.ts` | CRUD + hash lookup + download path |
| `packages/backend/src/softmods/votes.ts` | Vote get/set + likes for author |
| `packages/backend/src/routes/softmods.ts` | `/api/softmods/*` |
| `packages/backend/src/plugins/storage.ts` | Paths under `data/plugins/{id}/v{n}/` |
| `packages/backend/src/plugins/errors.ts` | Service errors |
| `packages/backend/src/plugins/service.ts` | CRUD + hash lookup + download |
| `packages/backend/src/plugins/votes.ts` | Votes |
| `packages/backend/src/routes/plugins.ts` | `/api/plugins/*` |
| `packages/backend/src/app.ts` | Mount routes |
| `packages/backend/src/users/service.ts` | Profile aggregates + lists |
| `packages/shared/src/schemas/softmods.ts` | Zod list/detail |
| `packages/shared/src/schemas/plugins.ts` | Zod list/detail |
| `packages/shared/src/schemas/users.ts` | Extend profile |
| `packages/frontend/app/pages/softmods/index.vue` | Softmod catalog |
| `packages/frontend/app/pages/softmods/[id].vue` | Softmod detail |
| `packages/frontend/app/pages/plugins/index.vue` | Plugin catalog |
| `packages/frontend/app/pages/plugins/[id].vue` | Plugin detail |
| `packages/frontend/app/components/AppNav.vue` | Nav links |
| `packages/frontend/app/pages/u/[id].vue` | Profile sections |
| `packages/frontend/app/components/*Mod*.vue` | Shared list row / upload bits as needed |

---

### Task 1: Drizzle schema for softmods + plugins

**Files:**
- Modify: `packages/backend/src/db/schema.ts`
- Create: migration via `bun run db:generate` under `packages/backend/drizzle/`
- Test: `packages/backend/src/db/__tests__/schema.test.ts` (extend)

**Interfaces:**
- Produces tables matching spec: `softmods`, `softmodVersions`, `softmodVotes`, `plugins`, `pluginVersions`, `pluginVotes`
- `softmodVersions.contentHash` and `pluginVersions.contentHash` each **unique**
- `(softmodId, version)` and `(pluginId, version)` unique

- [ ] **Step 1: Write failing tests** asserting unique `content_hash` on softmod and plugin version inserts (same pattern as character card hash test)

- [ ] **Step 2: Run — expect FAIL**

Run: `bun test packages/backend/src/db/__tests__/schema.test.ts`  
Expected: FAIL (tables/columns missing)

- [ ] **Step 3: Add tables to schema; generate + apply migration**

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/db packages/backend/drizzle
git commit -m "$(cat <<'EOF'
feat(backend): add softmod and plugin Drizzle tables

EOF
)"
```

---

### Task 2: Softmod manifest parser

**Files:**
- Create: `packages/backend/src/softmods/manifest.ts`
- Modify: `packages/backend/package.json` — add `fflate`
- Test: `packages/backend/src/softmods/__tests__/manifest.test.ts`
- Create fixture zipmod under `packages/backend/fixtures/softmods/` (minimal zip with `manifest.xml`)

**Interfaces:**
- `parseSoftmodManifest(archiveBytes: Uint8Array): SoftmodManifest`
- `SoftmodManifest`: `{ guid: string; name: string; version: string; author: string; description: string; website: string | null; raw: Record<string, unknown> }`
- Find entry named `manifest.xml` (allow leading `./`; case-sensitive filename `manifest.xml`)
- Missing file / missing or empty `<guid>` → throw error with message usable as 400
- Prefer reading text tags: `guid`, `name`, `version`, `author`, `description`, `website` (empty author/description → `""`; missing website → `null`)

- [ ] **Step 1: Failing test** — build in-memory zipmod with known manifest; assert parsed guid/name/version/author

```ts
test("parseSoftmodManifest reads Sideloader fields", () => {
  const bytes = /* fixture or fflate zipSync with manifest.xml */;
  const m = parseSoftmodManifest(bytes);
  expect(m.guid).toBe("com.echbox.testmod");
  expect(m.name).toBe("Test Mod");
  expect(m.version).toBe("1.2.3");
  expect(m.author).toBe("Tester");
});

test("parseSoftmodManifest rejects missing guid", () => {
  expect(() => parseSoftmodManifest(/* zip without guid */)).toThrow();
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `bun test packages/backend/src/softmods/__tests__/manifest.test.ts`

- [ ] **Step 3: Implement `parseSoftmodManifest` with `fflate` unzip + XML tag extraction**

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/softmods packages/backend/fixtures/softmods packages/backend/package.json bun.lock
git commit -m "$(cat <<'EOF'
feat(backend): parse Sideloader softmod manifest from zipmod

EOF
)"
```

---

### Task 3: Softmod service + votes

**Files:**
- Create: `packages/backend/src/softmods/storage.ts`, `errors.ts`, `service.ts`, `votes.ts`
- Test: `packages/backend/src/softmods/__tests__/service.test.ts`, `votes.test.ts`

**Interfaces:**
- Storage: `softmodVersionPaths(dataDir, softmodId, version) → { dir, originalPath }` with `original.zipmod`
- Errors: `DuplicateSoftmodHashError` `{ softmodId, version }`, `SoftmodGuidConflictError` `{ softmodId }`, `SoftmodServiceError` with `status`/`code`
- `createSoftmod({ authorId, fileBytes, notes?, dbPath?, dataDir? })` — hash check → parse manifest → if guid exists throw `SoftmodGuidConflictError` → write v1 → return detail
- `addSoftmodVersion({ softmodId, authorId, fileBytes, notes?, … })` — author-only; hash check; parse; **require manifest.guid === softmodId**; refresh title/modAuthor/description/website from manifest; bump version
- `listSoftmods`, `getSoftmod`, `findSoftmodByHash`, `deleteSoftmod` (author-only, cascade votes/files)
- List/detail include vote counts, `downloadUrl` for latest (`/api/softmods/:id/versions/:v/download`), `uploader: { id, username }`, `modAuthor`, `packageVersion` on versions
- Votes: `getSoftmodVoteCounts`, `setSoftmodVote`, `getSoftmodLikesReceivedForAuthor` (mirror cards)

- [ ] **Step 1: Failing tests** for create from fixture, GUID conflict on second create, hash duplicate 409 shape, non-author addVersion throws 403, vote like/dislike

- [ ] **Step 2: Run — expect FAIL**

Run: `bun test packages/backend/src/softmods/__tests__`

- [ ] **Step 3: Implement storage, errors, service, votes**

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/softmods
git commit -m "$(cat <<'EOF'
feat(backend): softmod CRUD, hash dedupe, and votes

EOF
)"
```

---

### Task 4: Softmod HTTP routes

**Files:**
- Create: `packages/backend/src/routes/softmods.ts`
- Modify: `packages/backend/src/app.ts` (`.use(softmodRoutes)`)
- Test: `packages/backend/src/__tests__/softmods-http.test.ts` (mirror `cards-http.test.ts` patterns)

**Interfaces:**
- Routes under `/api/softmods` with `authDerive`
- `GET /by-hash/:hash`, `GET /`, `GET /:id`, `GET /:id/versions/:version/download`
- `POST /` (file + optional notes), `POST /:id/versions`, `DELETE /:id`, vote route matching cards (`PUT` or `PATCH` `/:id/vote`)
- Map errors → 401/403/400/404/409; strip internal paths from JSON
- Download: `Content-Type: application/zip` (or `application/octet-stream`), `Content-Disposition: attachment; filename="….zipmod"`

- [ ] **Step 1: Failing HTTP tests** — unauth create 401; create OK; second create same GUID 409; download 200; delete author-only

- [ ] **Step 2: Run — expect FAIL**

Run: `bun test packages/backend/src/__tests__/softmods-http.test.ts`

- [ ] **Step 3: Implement routes + mount in `app.ts`**

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/routes/softmods.ts packages/backend/src/app.ts packages/backend/src/__tests__/softmods-http.test.ts
git commit -m "$(cat <<'EOF'
feat(backend): expose /api/softmods HTTP API

EOF
)"
```

---

### Task 5: Plugin service + votes + HTTP

**Files:**
- Create: `packages/backend/src/plugins/storage.ts`, `errors.ts`, `service.ts`, `votes.ts`
- Create: `packages/backend/src/routes/plugins.ts`
- Modify: `packages/backend/src/app.ts`
- Test: `packages/backend/src/plugins/__tests__/service.test.ts`, `packages/backend/src/__tests__/plugins-http.test.ts`
- Fixture: minimal non-empty `.zip` under `packages/backend/fixtures/plugins/`

**Interfaces:**
- Same shape as softmods but: generate `id` with `crypto.randomUUID()`; require `title`; optional `description`/`notes`; no manifest; file stored as `original.zip`
- `createPlugin({ authorId, title, description?, notes?, fileBytes, … })`
- `addPluginVersion` author-only; `patchPlugin({ id, authorId, title?, description? })` author-only
- Routes `/api/plugins` parallel to softmods including `by-hash`, download, vote, PATCH

- [ ] **Step 1: Failing service + HTTP tests** (create, hash 409, patch title, non-author 403, download)

- [ ] **Step 2: Run — expect FAIL**

Run: `bun test packages/backend/src/plugins/__tests__ packages/backend/src/__tests__/plugins-http.test.ts`

- [ ] **Step 3: Implement plugins stack + mount routes**

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/plugins packages/backend/src/routes/plugins.ts packages/backend/src/app.ts packages/backend/src/__tests__/plugins-http.test.ts packages/backend/fixtures/plugins
git commit -m "$(cat <<'EOF'
feat(backend): plugin library API with manual metadata

EOF
)"
```

---

### Task 6: Shared Zod schemas + profile aggregation

**Files:**
- Create: `packages/shared/src/schemas/softmods.ts`, `plugins.ts`
- Modify: `packages/shared/src/schemas/users.ts`, `packages/shared/src/index.ts`
- Modify: `packages/backend/src/users/service.ts`
- Test: `packages/backend/src/__tests__/users.test.ts` (extend)

**Interfaces:**
- Softmod list item: `id`, `title`, `modAuthor`, `uploader: { id, username }`, `latestVersion`, `packageVersion`, `downloadUrl`, vote fields, `description?`, `website?`
- Plugin list item: `id`, `title`, `description?`, `uploader`, `latestVersion`, `downloadUrl`, votes
- `UserProfileSchema` adds `plugins` and `softmods` arrays; `stats` remain single totals summed across cards + plugins + softmods

- [ ] **Step 1: Failing profile test** — user with one softmod and one plugin → `uploadCount: 2` (+cards), arrays populated, likes sum includes mod votes

- [ ] **Step 2: Run — expect FAIL**

Run: `bun test packages/backend/src/__tests__/users.test.ts`

- [ ] **Step 3: Add shared schemas; update `getUserProfile`**

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/shared packages/backend/src/users packages/backend/src/__tests__/users.test.ts
git commit -m "$(cat <<'EOF'
feat: shared mod schemas and profile lists for plugins/softmods

EOF
)"
```

---

### Task 7: Frontend softmods + plugins pages and nav

**Files:**
- Create: `packages/frontend/app/pages/softmods/index.vue`, `softmods/[id].vue`, `plugins/index.vue`, `plugins/[id].vue`
- Create: shared presentational components as needed (e.g. `ModCatalogPage.vue`, `ModRow.vue`) — keep editorial row layout, not card aspect grids
- Modify: `packages/frontend/app/components/AppNav.vue`
- Modify: `packages/frontend/app/pages/u/[id].vue`

**Interfaces:**
- Consumes Eden client routes from Tasks 4–6
- Softmod list/detail labels: **Uploader**, **Author**; download buttons hit download URLs
- Logged-in upload: softmod file-only; plugin file + title (+ optional description)
- Duplicate GUID/hash UX: link to existing id (mirror card gallery)
- Author actions on detail: new version / delete; plugins also edit title/description
- Nav: Plugins, Softmods
- Profile: sections for plugins and softmods

- [ ] **Step 1: Implement pages + nav + profile sections wired to API**

- [ ] **Step 2: Smoke-check typecheck**

Run: `bun check` in frontend (or package script equivalent)  
Expected: no type errors on new pages

- [ ] **Step 3: Commit**

```bash
git add packages/frontend
git commit -m "$(cat <<'EOF'
feat(frontend): plugins and softmods catalog, detail, and profile

EOF
)"
```

---

## Self-review notes (plan author)

- Spec coverage: both stacks, GUID rules, votes, profiles, nav, download, create/version like cards, no size cap, Uploader+Author — mapped to tasks 1–7
- Softmod PATCH none in v1 pinned in Global Constraints
- Profile stats summed across kinds pinned
- API prefixes pinned to `/api/softmods` and `/api/plugins`
