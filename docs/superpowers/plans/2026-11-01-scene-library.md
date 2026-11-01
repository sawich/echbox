# Scene Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Studio scenes the same upload, versioning, and like/dislike library as character cards, on a separate DB/API stack, with a one-shot seed import under system user `echbox`.

**Architecture:** Mirror `packages/backend/src/cards/*` as `packages/backend/src/scenes/*` (tables, hash dedupe, WebP preview, votes) but parse with `KoikatuSceneData`. Expose `/api/scenes`. Cut `/scenes` frontend off fixture gallery. Import seed scenes idempotently; stop serving `gallery.listCards("scene")` for the public list.

**Tech Stack:** Bun, Elysia, Drizzle/`bun:sqlite`, `KoikatuSceneData`, `Bun.Image` WebP, Nuxt, Eden, `@echbox/shared`

**Spec:** `docs/superpowers/specs/2026-11-01-scene-library-design.md`

## Global Constraints

- Separate tables: `scenes`, `scene_versions`, `scene_votes` — not `character_cards`
- API prefix `/api/scenes`; register `by-hash` before `:id`
- Softmod-style path safety: scene ids are UUIDs from server (`crypto.randomUUID()`); storage under `data/scenes/{id}/v{n}/`
- SHA-256 of entire original PNG; unique on `scene_versions.content_hash` → 409
- Parse with `KoikatuSceneData.load`; reject non-scenes with 400
- Preview: scene image → WebP max edge **512**, quality **80** via existing `writeWebpPreview`
- Votes: like/dislike like cards; separate `scene_votes`
- System user: username `echbox`, `discord_id = system:echbox`, fixed UUID in import module constant
- After import path exists: public list/detail no longer use fixture `gallery` for scenes
- Profile: `scenes[]` + stats sum includes scenes
- Detail URL: `/scenes/:id`
- Characters `/api/kk/cards` unchanged (character-only)

## Review Focus

- Uploading a character PNG to `/api/scenes` → 400 (wrong loader)
- Re-upload identical scene bytes → 409 with existing scene id + version
- Non-author mutate → 403; unauth create → 401
- Vote on scene must not touch `card_votes`
- After cutover, `GET /api/kk/cards?type=scene` must not be the scenes UI source (UI uses `/api/scenes`); fixture list unused for `/scenes` page

---

## File Structure

| Path | Role |
| --- | --- |
| `packages/backend/src/db/schema.ts` | Add scene tables |
| `packages/backend/drizzle/` | Migration |
| `packages/backend/src/scenes/storage.ts` | Paths under `data/scenes/` |
| `packages/backend/src/scenes/errors.ts` | Service errors |
| `packages/backend/src/scenes/service.ts` | CRUD + hash + image bytes |
| `packages/backend/src/scenes/votes.ts` | Votes + likes for author |
| `packages/backend/src/scenes/import-seed.ts` | Ensure `echbox` user + import seed scenes |
| `packages/backend/src/routes/scenes.ts` | `/api/scenes/*` |
| `packages/backend/src/app.ts` | Mount routes |
| `packages/backend/src/routes/gallery.ts` | Stop returning fixture scenes for mixed/character paths as needed; scene type from kk cards optional 404/empty |
| `packages/shared/src/schemas/scenes.ts` | Zod list/detail |
| `packages/shared/src/schemas/users.ts` | Profile `scenes` |
| `packages/backend/src/users/service.ts` | Aggregate scenes |
| `packages/frontend/app/pages/scenes/index.vue` | Gallery + upload (replace thin `scenes.vue`) |
| `packages/frontend/app/pages/scenes/[id].vue` | Detail |
| `packages/frontend/app/pages/u/[id].vue` | Scenes section |
| `packages/frontend/app/components/CardGalleryPage.vue` | Characters-only upload path cleanup if scenes leave this component |

---

### Task 1: Schema for scenes

**Files:**
- Modify: `packages/backend/src/db/schema.ts`
- Create: next drizzle migration
- Test: extend `packages/backend/src/db/__tests__/schema.test.ts`

**Interfaces:**
- Tables `scenes`, `sceneVersions`, `sceneVotes` matching character card shapes (slug/title on scene; content_hash unique on versions)

- [ ] **Step 1: Failing test** — duplicate `content_hash` on two scene versions throws

- [ ] **Step 2: Run — expect FAIL**

Run: `bun test packages/backend/src/db/__tests__/schema.test.ts`

- [ ] **Step 3: Add tables + migrate**

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/db packages/backend/drizzle
git commit -m "$(cat <<'EOF'
feat(backend): add scene library Drizzle tables

EOF
)"
```

---

### Task 2: Scene service + votes

**Files:**
- Create: `packages/backend/src/scenes/storage.ts`, `errors.ts`, `service.ts`, `votes.ts`
- Test: `packages/backend/src/scenes/__tests__/service.test.ts`, `votes.test.ts`
- Reuse: `cards/hash.ts`, `cards/preview.ts`
- Fixture: `packages/backend/fixtures/scene/kk_scene_simple.png` (existing)

**Interfaces:**
- `createScene`, `addSceneVersion`, `listScenes`, `getScene`, `findSceneByHash`, `deleteScene`, `patchScene`, `getSceneVersionImage`
- Preview source: scene `image` bytes from `KoikatuSceneData`
- List/detail include vote counts, `imageUrl` like `/api/scenes/:id/versions/:v/image`, `authorId`
- Errors mirror cards (`DuplicateSceneHashError`, 403/404/400)
- Prefer staging+txn write pattern if copying from softmods is straightforward; otherwise match character card write order and note in report

- [ ] **Step 1: Failing tests** — create from fixture; hash 409; character PNG → 400; non-author addVersion 403; vote like

- [ ] **Step 2: Run — expect FAIL**

Run: `bun test packages/backend/src/scenes/__tests__`

- [ ] **Step 3: Implement service + votes**

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/scenes
git commit -m "$(cat <<'EOF'
feat(backend): scene CRUD, hash dedupe, votes, and previews

EOF
)"
```

---

### Task 3: Scene HTTP routes + gallery cutover

**Files:**
- Create: `packages/backend/src/routes/scenes.ts`
- Modify: `packages/backend/src/app.ts`
- Modify: `packages/backend/src/routes/gallery.ts` — `type=scene` returns `{ cards: [] }` or 400; remove fixture scene from mixed list; keep character paths
- Test: `packages/backend/src/__tests__/scenes-http.test.ts`

**Interfaces:**
- Routes parallel to character gallery CRUD under `/api/scenes`
- Download/image: WebP default; `?original=1` like cards
- Vote `PUT /:id/vote`

- [ ] **Step 1: Failing HTTP tests** — unauth 401; create OK; hash 409; download/image 200; vote; delete author-only

- [ ] **Step 2: Run — expect FAIL**

Run: `bun test packages/backend/src/__tests__/scenes-http.test.ts`

- [ ] **Step 3: Implement routes + mount; cut fixture scenes from gallery list**

- [ ] **Step 4: Run — expect PASS** (also ensure existing cards-http still pass)

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/routes packages/backend/src/app.ts packages/backend/src/__tests__/scenes-http.test.ts
git commit -m "$(cat <<'EOF'
feat(backend): expose /api/scenes and stop fixture scene gallery

EOF
)"
```

---

### Task 4: Seed import under `echbox`

**Files:**
- Create: `packages/backend/src/scenes/import-seed.ts`
- Create: `packages/backend/src/scenes/import-seed-cli.ts` (or `bun run` script entry)
- Modify: `packages/backend/package.json` — script `scenes:import-seed`
- Test: `packages/backend/src/scenes/__tests__/import-seed.test.ts`

**Interfaces:**
- Constant `ECHBOX_SYSTEM_USER = { id: '<fixed-uuid>', discordId: 'system:echbox', username: 'echbox' }`
- `ensureEchboxUser(dbPath?)` upserts user
- `importSeedScenes({ dbPath?, dataDir? })` reads scene entries from `gallery/seed.json`, loads fixture bytes, calls create pipeline; **skip if hash exists**; return `{ imported, skipped }`
- Idempotent second run: all skipped

- [ ] **Step 1: Failing test** — import creates N scenes for echbox; second import skips

- [ ] **Step 2: Run — expect FAIL**

Run: `bun test packages/backend/src/scenes/__tests__/import-seed.test.ts`

- [ ] **Step 3: Implement import + CLI script**

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/scenes packages/backend/package.json
git commit -m "$(cat <<'EOF'
feat(backend): idempotent seed scene import as echbox

EOF
)"
```

---

### Task 5: Shared schemas + profile scenes

**Files:**
- Create: `packages/shared/src/schemas/scenes.ts`
- Modify: `packages/shared/src/index.ts`, `packages/shared/src/schemas/users.ts`
- Modify: `packages/backend/src/users/service.ts`
- Test: extend `packages/backend/src/__tests__/users.test.ts`

**Interfaces:**
- Scene list/detail Zod aligned with service JSON
- `UserProfile.scenes` array; `stats` sum includes scene uploads + scene vote likes/dislikes received

- [ ] **Step 1: Failing profile test** — user with a scene → appears in `scenes`; uploadCount includes it; likes include scene votes

- [ ] **Step 2: Run — expect FAIL**

Run: `bun test packages/backend/src/__tests__/users.test.ts`

- [ ] **Step 3: Schemas + profile aggregation**

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/shared packages/backend/src/users packages/backend/src/__tests__/users.test.ts
git commit -m "$(cat <<'EOF'
feat: shared scene schemas and profile scene lists

EOF
)"
```

---

### Task 6: Frontend scenes gallery, detail, profile

**Files:**
- Replace/create: `packages/frontend/app/pages/scenes/index.vue` (move away from `CardGalleryPage type=scene` fixture API)
- Create: `packages/frontend/app/pages/scenes/[id].vue`
- Delete or redirect: old `packages/frontend/app/pages/scenes.vue` if it conflicts with `scenes/index.vue`
- Modify: `packages/frontend/app/pages/u/[id].vue` — scenes section (landscape tiles)
- Modify: `packages/frontend/app/pages/cards/[id].vue` — remove fixture-scene fallback assumptions if any remain for votes
- Optional: extract shared gallery bits from `CardGalleryPage` for character-only use

**Interfaces:**
- List via Eden `/api/scenes`; upload multipart; votes; duplicate hash link
- Detail `/scenes/:id` with versions/image URLs, author actions
- Profile links to `/scenes/:id`

- [ ] **Step 1: Implement pages + profile section**

- [ ] **Step 2: Smoke typecheck / lint on touched Vue files**

- [ ] **Step 3: Commit**

```bash
git add packages/frontend
git commit -m "$(cat <<'EOF'
feat(frontend): scene library gallery, detail, and profile

EOF
)"
```

---

## Self-review notes (plan author)

- Spec coverage: separate stack, votes, upload, import, profile, fixture cutover, detail `/scenes/:id` — tasks 1–6
- Character PNG rejection and hash 409 pinned in Task 2 tests (Review Focus)
- Gallery cutover pinned in Task 3
