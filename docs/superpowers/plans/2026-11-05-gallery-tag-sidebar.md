# Gallery tag sidebar + tag modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gallery pages show a right sidebar of tags on the current page (click adds to filter); tags are created/fully edited only via modal; `/tags` gets an alias column and vote without flicker; attach no longer auto-creates tags.

**Architecture:** List APIs embed compact tags per item (Approach A); client aggregates the sidebar. Tag service opens create/alias/category/name updates to any logged-in user with uniqueness checks; `setContentTags` resolves existing tags only. Shared `TagFormModal` + `/tags` two-column layout; optimistic vote UI.

**Tech Stack:** Bun, Elysia, Drizzle/SQLite, Nuxt, existing tags module

**Spec:** `docs/superpowers/specs/2026-11-05-gallery-tag-sidebar-design.md`

## Global Constraints

- Approach A: list items include `tags: { name, category }[]` (compact).
- Sidebar: unique tags on **current page**, count = items on page with that tag; click adds to filter if not already selected.
- No auto-create from chip Enter or `setContentTags`; create/edit via modal (name, category any of five, aliases).
- Create / rename / set category / add-replace aliases: any **logged-in** user; uniqueness vs names+aliases → 409; **delete** remains admin-only.
- `/tags`: two columns — list + Add alias panel; edit modal for full edit; vote without full-page skeleton flicker.
- Plugins unchanged (no sidebar).

## Review Focus

- `setContentTags` with unknown name → 400 and existing attachments unchanged (no insert).
- Non-admin `createTag` with `category: author` succeeds; duplicate name/alias → 409.
- List page of 2 items sharing one tag: sidebar shows that tag with count 2; click adds to filter once.
- Vote on `/tags` updates counts/`myVote` without clearing list / without pending empty state.
- Alias panel rejects alias equal to another tag’s name.

## File Structure

| Path | Role |
| --- | --- |
| `packages/shared/src/schemas/tags.ts` (+ content list schemas) | Compact tag-on-item shape; patch body |
| `packages/backend/src/tags/service.ts` | Permissions, `updateTag`, no auto-create on attach, `tagsForContentIds` |
| `packages/backend/src/{cards,scenes,clothes,softmods}/service.ts` | Attach tags on list items |
| `packages/backend/src/routes/tags.ts` | Auth for create/alias/patch; PATCH body name/category/aliases |
| `packages/frontend/app/utils/page-tags.ts` | Aggregate sidebar rows from page items |
| `packages/frontend/app/components/GalleryTagSidebar.vue` | Right rail |
| `packages/frontend/app/components/TagFormModal.vue` | Create/edit modal |
| `packages/frontend/app/components/{Card,Scene,Clothes}GalleryPage.vue`, `ModCatalogPage.vue` | Layout + sidebar + filter wire |
| `packages/frontend/app/components/ContentTagEditor.vue` | Modal create; no invent-on-enter |
| `packages/frontend/app/pages/tags/index.vue` | Two columns, alias panel, optimistic vote |

---

### Task 1: Tag service — open create/alias/edit; no attach auto-create; batch tags for lists

**Files:**
- Modify: `packages/backend/src/tags/service.ts`
- Modify: `packages/backend/src/tags/__tests__/service.test.ts`
- Modify: `packages/backend/src/routes/tags.ts` (+ `tags-http.test.ts` as needed)
- Modify: `packages/shared/src/schemas/tags.ts` if PATCH shape needs exporting

**Interfaces:**
- Consumes: existing tag tables, `normalize`/`canonicalName`
- Produces:
  - `createTag` / `addAlias` / category+name update: any logged-in actor (drop admin-only for those); delete still `requireAdmin`
  - `updateTag({ tagId, name?, category?, aliases?: string[], actor })` — full replace of alias set when `aliases` provided; uniqueness checks
  - `setContentTags`: resolve existing only; unknown → `InvalidTagError` **before** delete/replace
  - `tagsByContentIds({ kind, contentIds }): Map<string, { name, category }[]>`

- [ ] **Step 1: Failing tests** — non-admin creates `author`; non-admin addAlias; unknown name on setContentTags leaves prior tags; updateTag rename collision 409; tagsByContentIds returns map

- [ ] **Step 2: Run — expect FAIL**

Run: `bun test src/tags/__tests__/service.test.ts` from `packages/backend`

- [ ] **Step 3: Implement service + HTTP auth/body updates**

- [ ] **Step 4: Run — expect PASS** (+ tags-http adjustments)

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/tags packages/backend/src/routes/tags.ts packages/backend/src/__tests__/tags-http.test.ts packages/shared/src/schemas/tags.ts
git commit -m "$(cat <<'EOF'
feat(tags): open create/edit to users and stop attach auto-create

Full tag updates with uniqueness checks; batch fetch for list embeds.
EOF
)"
```

---

### Task 2: Embed tags on taggable list responses

**Files:**
- Modify: shared list schemas for cards/scenes/clothes/softmods — `tags: z.array(z.object({ name, category }))`
- Modify: list mappers in `cards|scenes|clothes|softmods/service.ts`
- Test: one service test per kind (or shared helper test) asserting tags on list item

**Interfaces:**
- Consumes: `tagsByContentIds`
- Produces: list DTOs include `tags` (empty array default)

- [ ] **Step 1: Failing list assertion with attached tag**

- [ ] **Step 2: Implement embed on all four list paths**

- [ ] **Step 3: Tests PASS**

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(api): include tags on taggable catalog list items

Enables gallery sidebar aggregation without N+1 fetches.
EOF
)"
```

---

### Task 3: GalleryTagSidebar + page layout + aggregate util

**Files:**
- Create: `packages/frontend/app/utils/page-tags.ts` (+ test)
- Create: `packages/frontend/app/components/GalleryTagSidebar.vue`
- Modify: four gallery/catalog pages — `lg:grid` with sticky aside; `@select` → append to `tags` model and apply

**Interfaces:**
- `aggregatePageTags(items: { tags?: { name, category }[] }[]): { name, category, count }[]` sorted by category then name
- Sidebar emits `select(name: string)`; parent ignores duplicates

- [ ] **Step 1: Unit test aggregate counts / sort**

- [ ] **Step 2: Implement util + sidebar + wire pages (softmods only in ModCatalog when softmod)**

- [ ] **Step 3: Frontend util tests PASS**

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(frontend): gallery tag sidebar from page items

Click adds the tag to the active AND filter set.
EOF
)"
```

---

### Task 4: TagFormModal + ContentTagEditor without invent-on-enter

**Files:**
- Create: `packages/frontend/app/components/TagFormModal.vue`
- Modify: `ContentTagEditor.vue` (and TagInput create path if any)
- Wire modal from editor “Create tag…” and after success append name via existing commit/PUT

**Interfaces:**
- Modal props: `mode: 'create'|'edit'`, optional initial tag; emits `saved` with `{ name, category, aliases }`
- Calls `POST /api/tags` or PATCH + alias endpoints per service contract from Task 1

- [ ] **Step 1: Implement modal + stop ContentTagEditor from adding unknown names without modal**

- [ ] **Step 2: Manual/API error surfacing for 409 duplicate**

- [ ] **Step 3: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(frontend): tag create/edit modal with category and aliases

Chip fields only attach existing tags; creation goes through the modal.
EOF
)"
```

---

### Task 5: `/tags` two-column alias panel + vote without flicker

**Files:**
- Modify: `packages/frontend/app/pages/tags/index.vue`

**Interfaces:**
- Layout: main list | sticky Add alias (target tag search/select + alias input → POST aliases)
- Edit opens `TagFormModal`
- Vote: update local `data.tags` entry (`myVote`, likes/dislikes) from response body if API returns counts; else optimistic adjust; **do not** await full `refresh()` that blanks UI — use `refresh` only if it keeps previous `data` visible (`pending && !data` pattern already elsewhere)

- [ ] **Step 1: Fix vote path first (no skeleton flash)**

- [ ] **Step 2: Add alias column + edit entry points**

- [ ] **Step 3: Smoke / existing frontend tests**

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(frontend): tags page alias column and flicker-free votes

Logged-in users can add aliases; votes update in place.
EOF
)"
```

---

## Execution note

Prefer **Native** for this follow-up (5 tasks, tightly coupled to existing tag UI) unless you want subagent-driven gates again.
