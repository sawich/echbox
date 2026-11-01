# Split Galleries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the mixed card gallery into `/` (characters, 252×352) and `/scenes` (scenes, 320×180) with matching tile aspects and nav links.

**Architecture:** Keep the existing list API (`?type=`). Extract a shared gallery page pattern (or thin pages calling the same fetch) so each route requests only its type. `CardTile` takes an explicit aspect class; nav lists Characters / Scenes / UI kit.

**Tech Stack:** Nuxt 4, Vue 3, `@echbox/uikit`, Eden `useApi()`

**Spec:** `docs/superpowers/specs/2026-10-31-split-galleries-design.md`

## Global Constraints

- Characters at `/`; scenes at `/scenes`
- Character tile aspect `252/352`; scene tile aspect `320/180`
- Remove All / Characters / Scenes filter chips from the list UI
- Detail route `/cards/:id` unchanged
- No backend/seed changes required

## Review Focus

- Visiting `/` must not show scene cards (API called with `type=character` only)
- Visiting `/scenes` must not show character cards (`type=scene` only)
- Character tiles use `aspect-[252/352]`; scene tiles use `aspect-[320/180]`
- Nav highlights Characters on `/` and `/cards/*` for character context… **Ruling for implementer:** highlight Characters when `path === '/'`; Scenes when `path.startsWith('/scenes')`; do not force Characters active on every `/cards/*` (type unknown without fetch) — only `/` and `/scenes`
- Empty gallery still shows empty state, not the other type’s cards

---

## File Structure

| Path | Role |
| --- | --- |
| `packages/frontend/app/utils/gallery.ts` | `galleryAspect(type: CardType): string` → `"aspect-[252/352]"` \| `"aspect-[320/180]"` |
| `packages/frontend/app/components/CardTile.vue` | Use aspect from card type via helper |
| `packages/frontend/app/components/CardGalleryPage.vue` | Shared list UI: props `type`, `title`, `description`; fetches `?type=` |
| `packages/frontend/app/pages/index.vue` | `<CardGalleryPage type="character" …>` |
| `packages/frontend/app/pages/scenes.vue` | `<CardGalleryPage type="scene" …>` |
| `packages/frontend/app/components/AppNav.vue` | Characters → `/`, Scenes → `/scenes`, UI kit |

---

### Task 1: Aspect helper + CardTile

**Files:**
- Create: `packages/frontend/app/utils/gallery.ts`
- Modify: `packages/frontend/app/components/CardTile.vue`
- Test: `packages/frontend/app/utils/gallery.test.ts` (`bun test`)

**Interfaces:**
- Produces: `galleryAspect(type: "character" | "scene"): "aspect-[252/352]" | "aspect-[320/180]"`
- CardTile applies `galleryAspect(card.type)` on the image wrapper (replace hard-coded `aspect-[252/352]`)

- [ ] **Step 1: Write failing test**

```ts
import { test, expect } from "bun:test";
import { galleryAspect } from "./gallery";

test("character aspect", () => {
  expect(galleryAspect("character")).toBe("aspect-[252/352]");
});

test("scene aspect", () => {
  expect(galleryAspect("scene")).toBe("aspect-[320/180]");
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `bun test packages/frontend/app/utils/gallery.test.ts`  
Expected: FAIL module not found

- [ ] **Step 3: Implement `galleryAspect` and wire `CardTile`**

- [ ] **Step 4: Run — expect PASS**

Run: `bun test packages/frontend/app/utils/gallery.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/app/utils/gallery.ts packages/frontend/app/utils/gallery.test.ts packages/frontend/app/components/CardTile.vue
git commit -m "$(cat <<'EOF'
feat(frontend): aspect ratios per card type for gallery tiles

EOF
)"
```

---

### Task 2: Split routes + nav

**Files:**
- Create: `packages/frontend/app/components/CardGalleryPage.vue`
- Create: `packages/frontend/app/pages/scenes.vue`
- Modify: `packages/frontend/app/pages/index.vue`
- Modify: `packages/frontend/app/components/AppNav.vue`
- Test: assert via `rg`/file read in verification (no Nuxt route runner); keep `galleryAspect` tests green

**Interfaces:**
- `CardGalleryPage` props: `type: CardType`, `title: string`, `description: string`
- Fetches only `api.api.kk.cards.get({ query: { type: props.type } })`
- Grid: characters `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4`; scenes prefer wider tiles e.g. `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`
- `index.vue`: type character, title “Characters”
- `scenes.vue`: type scene, title “Scenes”
- Nav labels: Characters (`/`), Scenes (`/scenes`), UI kit (`/uikit`)

- [ ] **Step 1: Implement `CardGalleryPage`, thin pages, update `AppNav`** (no filter chips)

- [ ] **Step 2: Verify**

Run:
```bash
bun test packages/frontend/app/utils/gallery.test.ts
rg -n "type=\"character\"|type=\"scene\"|aspect-\[|/scenes" packages/frontend/app/pages packages/frontend/app/components
```
Expected: gallery tests PASS; `index` uses character; `scenes.vue` exists with scene; AppNav has `/scenes`; no All/Characters/Scenes chip handlers on index

- [ ] **Step 3: Commit**

```bash
git add packages/frontend/app/components/CardGalleryPage.vue packages/frontend/app/pages/index.vue packages/frontend/app/pages/scenes.vue packages/frontend/app/components/AppNav.vue
git commit -m "$(cat <<'EOF'
feat(frontend): split character and scene galleries into routes

EOF
)"
```

---

## Spec coverage

| Spec | Task |
| --- | --- |
| `/` characters 252×352 | 1–2 |
| `/scenes` 320×180 | 1–2 |
| Nav Characters / Scenes / UI kit | 2 |
| No filter chips | 2 |
| `/cards/:id` unchanged | (no edit) |
