# Content tags, nameless galleries, softmod previews Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Danbooru-style tags (AND filter, aliases, votes, admin delete) on cards/scenes/clothes/softmods; drop titles there in favor of description + uploader; softmods gain up to 3 WebP previews ≤1280×720 @ q40; plugins stay title-search only.

**Architecture:** Shared `tags` / `tag_aliases` / `tag_votes` plus polymorphic `content_tags(content_kind, content_id)`. Content rows rename `author_id`→`uploader_id`, drop `title`/`slug`/`mod_author` on taggable kinds, add `description`. Softmod gallery images live in `softmod_previews`. Catalog toolbars use chip+suggest input with debounce; `/tags` rates tags.

**Tech Stack:** Bun, Elysia, Drizzle/SQLite, Nuxt, Zod (`@echbox/shared`), existing `isAdmin` / content vote patterns, `Bun.Image` WebP

**Spec:** `docs/superpowers/specs/2026-11-05-content-tags-design.md`

## Global Constraints

- Tag names: lowercase `[a-z0-9_]+`, spaces normalize to `_`; categories `author|license|character|franchise|general`.
- Taggable kinds only: `cards|clothes|scenes|softmods`. **Plugins: no tags**, keep title + `q` search.
- List filter = **AND** of all selected tags; no `-tag` in v1; no title/slug `q` on taggable kinds.
- General tags: creatable on attach by item **uploader** or **admin**. Restricted categories + aliases + category changes + tag **delete**: **admin only** (`ADMIN_DISCORD_IDS` / `isAdmin`).
- Content tag attach/detach: item uploader or admin. Tag votes: any logged-in user; like/dislike; delete tag = hard delete + cascades.
- Uploader: rename `author_id`→`uploader_id` on **all five** content parent tables (including plugins). API: `uploaderId` + nested `uploader`.
- Drop product `title` (and user-facing slug / softmod `modAuthor`) on taggable kinds; add `description`. Softmod previews: ≤**3**, fit in **1280×720**, WebP **quality 40**, per softmod not per version.
- Do **not** run `drizzle-kit generate`; hand-write SQL + journal like prior migrations (next: `0014`).
- Do not auto-create restricted-category tags from manifest metadata.

## Review Focus

- Attaching two tags then filtering with both returns only items that have **both**; one tag alone still matches.
- Non-admin cannot create an `author` (or other restricted) tag via attach; can create `general`.
- Admin delete tag removes aliases, votes, and all `content_tags` rows for it.
- Softmod 4th preview upload rejected; oversized image is resized into 1280×720 box, output is webp q40.
- Enter on empty tag input applies pending filter immediately; continued typing does not apply until debounce settles (chip commit still adds to selection).

## File Structure

| Path | Role |
| --- | --- |
| `packages/shared/src/schemas/tags.ts` | Zod: categories, tag DTOs, vote, list/suggest |
| `packages/shared/src/schemas/{cards,scenes,clothes,softmods,plugins,pagination}.ts` | Drop title/slug where required; `uploaderId`; `description`; list `tags` query; softmod `previewUrls` |
| `packages/shared/src/index.ts` | Re-exports |
| `packages/backend/src/db/schema.ts` | Column renames/drops/adds; tag tables; `softmod_previews` |
| `packages/backend/drizzle/0014_content_tags.sql` | Migration |
| `packages/backend/drizzle/meta/_journal.json` | idx 14, tag `0014_content_tags` |
| `packages/backend/src/tags/normalize.ts` | `normalizeTagName` |
| `packages/backend/src/tags/service.ts` | Suggest, CRUD, aliases, votes, content tag set/list, AND id query helper |
| `packages/backend/src/tags/errors.ts` | NotFound / Forbidden / Validation |
| `packages/backend/src/tags/__tests__/*.ts` | Domain tests |
| `packages/backend/src/cards/preview.ts` | Add `writeWebpPreviewFit(bytes, dest, { maxW:1280, maxH:720 })` (cards keep 512 helper) |
| `packages/backend/src/softmods/previews.ts` | List/add/reorder/delete previews + storage under `data/softmods/{id}/previews/` |
| `packages/backend/src/{cards,scenes,clothes,softmods,plugins}/service.ts` | uploaderId, description, no title; tag filter on list; softmod preview fields |
| `packages/backend/src/routes/tags.ts` | HTTP for tags / votes / admin |
| `packages/backend/src/routes/{gallery,scenes,clothes,softmods,plugins}.ts` | List `tags`; drop title body fields; tag + preview routes on softmods; patch description |
| `packages/backend/src/app.ts` | Mount tags routes |
| `packages/frontend/app/components/TagInput.vue` | Chips + suggest + debounce/Enter-empty |
| `packages/frontend/app/components/CatalogToolbar.vue` | Optional tag mode vs plain `q` |
| `packages/frontend/app/components/{MediaTile,CardTile,SceneTile,ClothesTile,ModRow}.vue` | Nameless tiles; softmod preview tile |
| Gallery/catalog pages + detail pages | Descriptions, tag editor, softmod previews |
| `packages/frontend/app/pages/tags/index.vue` | Rate / admin delete |

---

### Task 1: Shared Zod + `normalizeTagName`

**Files:**
- Create: `packages/shared/src/schemas/tags.ts`
- Modify: `packages/shared/src/schemas/{cards,scenes,clothes,softmods,plugins,pagination}.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `packages/backend/src/tags/normalize.ts`
- Test: `packages/backend/src/tags/__tests__/normalize.test.ts`

**Interfaces:**
- Consumes: existing Zod pagination/vote schemas
- Produces:
  - `TagCategorySchema`, `TaggableContentKindSchema` (`cards|clothes|scenes|softmods`)
  - `TagSchema` / `TagListItemSchema` (id, name, category, likes, dislikes, myVote?, usageCount?)
  - `normalizeTagName(raw: string): string` — trim, lower case, whitespace→`_`, collapse `__+`, throw/return empty rejection for invalid leftover chars
  - Content list/detail schemas: `uploaderId` instead of `authorId`; `description: string` (softmods already); no `title`/`slug` on taggable kinds; softmods: no `modAuthor`, `previewUrls: string[]` (max 3); plugins keep `title`
  - `ListPaginationQuerySchema`: optional `tags` (string or string array) for taggable lists; plugins keep `q`

- [ ] **Step 1: Failing normalize tests**

`normalizeTagName(" Hatsune Miku ") === "hatsune_miku"`; `"Already_ok"` → `"already_ok"`; `"bad!"` rejects.

- [ ] **Step 2: Run — expect FAIL**

Run: `bun test src/tags/__tests__/normalize.test.ts` from `packages/backend`

- [ ] **Step 3: Implement normalize + shared schemas + exports**

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/shared packages/backend/src/tags
git commit -m "$(cat <<'EOF'
feat(shared): tag schemas and name normalization

Canonical lowercase underscore names shared by API and UI.
EOF
)"
```

---

### Task 2: DB migration `0014_content_tags`

**Files:**
- Modify: `packages/backend/src/db/schema.ts`
- Create: `packages/backend/drizzle/0014_content_tags.sql`
- Modify: `packages/backend/drizzle/meta/_journal.json` (idx 14, `when`: 1794047000000, tag `0014_content_tags`)
- Test: `packages/backend/src/db/__tests__/schema.test.ts` (extend) or `packages/backend/src/tags/__tests__/schema.test.ts`

**Interfaces:**
- Consumes: `migrateDb`
- Produces Drizzle tables matching SQL:
  - Parent tables `character_cards`, `scenes`, `clothes`, `softmods`: drop `title` (and `slug` on first three); add `description` text not null default `''`; rename `author_id`→`uploader_id`
  - `softmods`: drop `mod_author`; keep existing description column (already not null)
  - `plugins`: rename `author_id`→`uploader_id` only
  - `tags`, `tag_aliases`, `tag_votes`, `content_tags` per spec
  - `softmod_previews`: `id`, `softmod_id` FK cascade, `sort_index` int, `preview_path` text, `created_at`; unique `(softmod_id, sort_index)`

- [ ] **Step 1: Failing migration test**

After migrate: insert tag + alias + content_tag for a softmod; rename columns exist as `uploader_id`; `character_cards` has `description` and no `title`; insert 3 softmod_previews; deleting tag cascades alias/content_tag.

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Hand-write SQL (SQLite table rebuilds where rename/drop required) + Drizzle schema + journal**

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/db packages/backend/drizzle
git commit -m "$(cat <<'EOF'
feat(db): content tags schema and nameless content columns

Uploader rename, descriptions, tag tables, softmod previews.
EOF
)"
```

---

### Task 3: Tag domain service

**Files:**
- Create: `packages/backend/src/tags/errors.ts`
- Create: `packages/backend/src/tags/service.ts`
- Test: `packages/backend/src/tags/__tests__/service.test.ts`

**Interfaces:**
- Consumes: schema tables, `normalizeTagName`, `isAdmin` checks at call sites (service accepts `actor: { userId, isAdmin }`)
- Produces (signatures):
  - `suggestTags({ q, limit?, excludeNames?, dbPath? })`
  - `listTags({ page, limit, q?, sort?: "top"|"recent"|"name", dbPath? })` for `/tags` page
  - `getTag(idOrName, { viewerUserId?, dbPath? })`
  - `createTag({ name, category, actor, dbPath? })` — non-admin only `general`
  - `ensureGeneralTag(name, actor)` — create-if-missing general only
  - `addAlias({ tagId, alias, actor })` admin
  - `setTagCategory({ tagId, category, actor })` admin
  - `deleteTag({ tagId, actor })` admin
  - `setTagVote({ tagId, userId, vote: "like"|"dislike"|null })`
  - `setContentTags({ kind, contentId, names: string[], actor, uploaderId })` — resolve aliases; create missing generals; reject new restricted; replace full set or sync as builder chooses (**replace** recommended)
  - `getContentTags({ kind, contentId })`
  - `contentIdsHavingAllTags({ kind, tagIds: string[] }): string[]` — empty `tagIds` means no filter (all)

- [ ] **Step 1: Failing tests**

Cover: suggest by alias; non-admin create author fails; admin create author ok; setContentTags creates general; AND helper; vote + delete cascade.

- [ ] **Step 2: Run — expect FAIL**

Run: `bun test src/tags/__tests__/service.test.ts` from `packages/backend`

- [ ] **Step 3: Implement service**

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/tags
git commit -m "$(cat <<'EOF'
feat(backend): tag service with aliases, votes, and content AND helper

Hybrid create rules and admin delete with cascades.
EOF
)"
```

---

### Task 4: Content services — uploader, description, no title, tag filter

**Files:**
- Modify: `packages/backend/src/{cards,scenes,clothes,softmods,plugins}/service.ts` (+ matching `__tests__`)
- Modify: profile/`users` mappers if they expose `authorId`/`title` for taggable kinds
- Modify: any `titleSlugSearch` call sites for taggable kinds → remove `q` title search; accept `tags?: string[]` and intersect via `contentIdsHavingAllTags`

**Interfaces:**
- Consumes: Task 3 helpers; updated Drizzle columns
- Produces: create/list/get/patch use `uploaderId` + `description`; create no longer takes `title`/`slug`/`modAuthor`; softmod create still parses manifest for description seed + GUID id but does not store name/author as title fields; list options `{ tags?: string[] }` on taggable kinds; plugins unchanged except `uploaderId`

- [ ] **Step 1: Update card service tests first (fail on old title fields), then implement cards; mirror scenes/clothes/softmods/plugins**

Assert list with `tags: ["a","b"]` returns only dual-tagged card; create without title; patch description.

- [ ] **Step 2: Run affected service tests — expect FAIL then PASS after implementation**

Run: `bun test src/cards/__tests__/service.test.ts src/scenes/__tests__/service.test.ts src/clothes/__tests__/service.test.ts src/softmods/__tests__/service.test.ts src/plugins/__tests__/service.test.ts` from `packages/backend` (adjust paths to existing test files)

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src
git commit -m "$(cat <<'EOF'
feat(backend): nameless content rows with uploader and tag filters

Titles removed from taggable kinds; lists AND-filter by tags.
EOF
)"
```

---

### Task 5: Softmod previews backend

**Files:**
- Modify: `packages/backend/src/cards/preview.ts` — export `writeWebpPreviewFit(source, dest, { maxWidth: 1280, maxHeight: 720 })` using `WEBP_QUALITY`
- Create: `packages/backend/src/softmods/previews.ts`
- Modify: `packages/backend/src/softmods/service.ts` — include `previewUrls` on list/detail; delete softmod removes preview files
- Test: `packages/backend/src/softmods/__tests__/previews.test.ts` (+ preview fit unit if useful)

**Interfaces:**
- Consumes: `writeWebpPreviewFit`, `softmod_previews` table
- Produces:
  - `listSoftmodPreviews(softmodId)`, `addSoftmodPreview({ softmodId, bytes, actor, uploaderId })` (reject if count≥3), `deleteSoftmodPreview`, `reorderSoftmodPreviews({ orderedIds })`
  - Public URL path pattern consistent with card images (e.g. `/api/softmods/:id/previews/:previewId` or static under existing file serve — match cards)

- [ ] **Step 1: Failing tests** — 3 ok, 4th throws; output file is webp; delete softmod cleans rows

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement fit encoder + preview service + wire list/detail**

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/cards/preview.ts packages/backend/src/softmods
git commit -m "$(cat <<'EOF'
feat(backend): softmod gallery previews at 1280x720 webp q40

Up to three images per softmod for catalog tiles.
EOF
)"
```

---

### Task 6: HTTP routes

**Files:**
- Create: `packages/backend/src/routes/tags.ts`
- Modify: `packages/backend/src/app.ts`
- Modify: `packages/backend/src/routes/{gallery,scenes,clothes,softmods,plugins}.ts`
- Test: extend/create `packages/backend/src/__tests__/tags-http.test.ts` and update existing `*-http.test.ts` / softmods-http for new fields

**Interfaces:**
- Consumes: tag + content + preview services
- Produces routes (names flexible, behaviors fixed):
  - `GET /api/tags/suggest?q=`
  - `GET /api/tags` (paginated browse)
  - `POST /api/tags` admin-or-general rules as service
  - `POST /api/tags/:id/aliases`, `PATCH /api/tags/:id`, `DELETE /api/tags/:id` admin
  - `PUT /api/tags/:id/vote` body `{ vote: "like"|"dislike"|null }` auth
  - `GET|PUT /api/{cards|scenes|clothes|softmods}/:id/tags` — PUT body `{ tags: string[] }`
  - List endpoints accept `tags` query (repeatable or comma-separated → string[]); drop title from POST bodies for taggable kinds; softmod preview POST/DELETE
  - Plugins list still `q` on title

- [ ] **Step 1: HTTP tests for suggest, AND list filter, forbidden restricted create, preview cap**

- [ ] **Step 2: Implement routes + fix OpenAPI/body schemas**

- [ ] **Step 3: Run HTTP tests — expect PASS**

Run: `bun test src/__tests__/tags-http.test.ts src/__tests__/softmods-http.test.ts` (and other updated http tests) from `packages/backend`

- [ ] **Step 4: Commit**

```bash
git add packages/backend/src
git commit -m "$(cat <<'EOF'
feat(api): tag, content-tag, and softmod preview endpoints

Wire AND filters and admin tag moderation to HTTP.
EOF
)"
```

---

### Task 7: Frontend TagInput + catalog filter

**Files:**
- Create: `packages/frontend/app/components/TagInput.vue`
- Modify: `packages/frontend/app/components/CatalogToolbar.vue`
- Modify: `packages/frontend/app/components/{CardGalleryPage,SceneGalleryPage,ClothesGalleryPage,ModCatalogPage}.vue`
- Modify: `packages/frontend/app/utils/catalog.ts` (+ tests if present) — drop title sort for taggable toolbars; plugins keep `q`

**Interfaces:**
- Consumes: `GET /api/tags/suggest`
- Produces: `TagInput` v-models `tags: string[]` (canonical names); internal draft string; debounce **250ms** before emitting “apply” / parent refetch; selecting suggestion or Enter on non-empty draft commits chip (normalize spaces→`_`); Enter on **empty** draft forces immediate apply; chips removable
- `CatalogToolbar`: mode `search="tags" | "text"` — tags mode uses TagInput; text mode keeps current `q` for plugins
- Galleries watch selected tags (debounced apply) instead of `q` for taggable kinds

- [ ] **Step 1: Component/unit test or thin harness for normalize-on-commit + empty-Enter apply behavior if frontend test setup exists; otherwise manual checklist in commit body and implement against VueUse `refDebounced` already used**

- [ ] **Step 2: Implement TagInput + wire four taggable catalogs; plugins unchanged text search**

- [ ] **Step 3: Smoke via existing frontend tests if any (`bun test` in frontend)**

- [ ] **Step 4: Commit**

```bash
git add packages/frontend
git commit -m "$(cat <<'EOF'
feat(frontend): Danbooru-style tag chip search on catalogs

Debounced AND filters with immediate apply on empty Enter.
EOF
)"
```

---

### Task 8: Nameless UI, descriptions, softmod previews, `/tags` page

**Files:**
- Modify: `MediaTile.vue` — make `title` optional; omit name overlay when absent; keep votes/semver/kind
- Modify: `CardTile`, `SceneTile`, `ClothesTile` — stop passing title/subtitle
- Softmod catalog: preview-led tile (reuse MediaTile with first `previewUrls[0]`) instead of title-centric `ModRow` for softmods; plugins keep `ModRow`
- Detail pages `cards|scenes|clothes|softmods/[id].vue` — no title header; show description; tag editor for uploader/admin; softmod preview manager (≤3)
- Upload forms — remove title/slug fields; description field; softmod preview upload on create/edit
- Create: `packages/frontend/app/pages/tags/index.vue` (+ nav link in `layouts/default.vue`)
- Fix install/task labels that used `title` → description snippet or id

**Interfaces:**
- Consumes: Task 6/7 APIs
- Produces: product UI matching spec (no names on taggable kinds; `/tags` with like/dislike + admin delete)

- [ ] **Step 1: Implement UI changes page by page; fix TypeScript against updated shared types (`bun check` / package scripts)**

- [ ] **Step 2: Run frontend typecheck + backend tests regression**

Run: `bun check` (or package equivalents) and `bun test` from `packages/backend`

- [ ] **Step 3: Commit**

```bash
git add packages/frontend packages/shared
git commit -m "$(cat <<'EOF'
feat(frontend): nameless galleries, softmod previews, tags page

Descriptions and tags replace titles; users can rate tags.
EOF
)"
```

---

## Execution note

This is one plan for one approved spec. Tasks 1→3 are backend foundation; 4–6 finish API; 7–8 are UI. Prefer **subagent-driven** execution so each task gets an independent review before the next couples to its interfaces.
