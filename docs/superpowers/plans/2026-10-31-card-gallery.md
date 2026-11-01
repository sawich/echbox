# Card Gallery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a read-only card gallery on `/` backed by a versioned fixture seed API, and move the M3 demo to `/uikit`.

**Architecture:** A JSON seed manifest maps stable card ids to fixture PNG paths and version metadata. A small gallery service loads each version through kkloader (with in-process cache), and Elysia exposes list/detail/image routes. The Nuxt SPA consumes them via the existing Eden `useApi()` client.

**Tech Stack:** Bun, Elysia, Zod (`@echbox/shared`), Nuxt 4, `@echbox/uikit` (M3), Eden treaty

**Spec:** `docs/superpowers/specs/2026-10-31-card-gallery-design.md`

## Global Constraints

- Bun instead of Node; `bun test` / `bun check` for backend and shared
- Read-only API only — no POST/PATCH/DELETE for cards
- Card types in gallery: `character` | `scene` only (no coordinate)
- Version numbers are monotonic integers starting at 1
- Fixtures live under `packages/backend/fixtures/`; PNGs may be gitignored
- Do not put incomplete fixtures in the seed: skip `scene/kk_scene_2023_1204.png`; truncated Sunshine chara is optional — prefer omit from seed if full parse is fragile
- Frontend is SPA (`ssr: false`); gallery fetches `runtimeConfig.public.apiUrl` at runtime
- Preserve existing `/api/kk/chara` and `/api/kk/scene` upload routes

## Review Focus

- Missing fixture file for a seed entry → API returns 500/404 with a clear error, not a hang or empty 200
- Unknown `card id` or `version` → 404
- `?type=` filter with invalid value → 400 or empty typed rejection (not 500)
- Image response `Content-Type: image/png` and non-empty body for every seeded latest version
- Multi-version card list item exposes `latestVersion` equal to max version and `versionCount > 1`

---

## File Structure

| Path | Responsibility |
| --- | --- |
| `packages/shared/src/schemas/cards.ts` | Zod schemas + inferred DTO types for list/detail |
| `packages/shared/src/index.ts` | Re-export card schemas/types |
| `packages/backend/src/gallery/seed.json` | Versioned card manifest (fixture paths relative to `fixtures/`) |
| `packages/backend/src/gallery/seed.ts` | Load/validate seed; resolve fixture absolute paths |
| `packages/backend/src/gallery/service.ts` | Parse + cache summaries/images; list/get/image helpers |
| `packages/backend/src/routes/gallery.ts` | `GET /api/kk/cards`, `/:id`, `/:id/versions/:version/image` |
| `packages/backend/src/app.ts` | `.use(galleryRoutes)` |
| `packages/backend/src/__tests__/gallery.test.ts` | HTTP + seed service tests |
| `packages/frontend/app/pages/uikit.vue` | Moved current index demo |
| `packages/frontend/app/pages/index.vue` | Gallery list |
| `packages/frontend/app/pages/cards/[id].vue` | Card detail + version switcher |
| `packages/frontend/app/components/AppNav.vue` | Minimal Gallery / UI kit links |
| `packages/frontend/app/layouts/default.vue` (optional) | Wrap pages with `AppNav` if uikit layout alone is insufficient — prefer extend via page chrome in pages or a frontend layout |

Exact seed entries (lock these ids):

```json
[
  {
    "id": "chara-sample",
    "type": "character",
    "slug": "chara-sample",
    "title": "Sample character",
    "versions": [
      { "version": 1, "createdAt": "2024-01-01T00:00:00.000Z", "fixture": "chara/kk_chara.png", "notes": "Reference card" },
      { "version": 2, "createdAt": "2024-06-01T00:00:00.000Z", "fixture": "chara/kk_mod_chara.png", "notes": "KKEx update" }
    ]
  },
  {
    "id": "chara-tatsumaki-fubuki",
    "type": "character",
    "slug": "tatsumaki-fubuki",
    "title": null,
    "versions": [
      { "version": 1, "createdAt": "2026-02-09T00:00:00.000Z", "fixture": "chara/kk_tatsumaki_fubuki.png", "notes": "ownCloud/Other" }
    ]
  },
  {
    "id": "chara-82127594",
    "type": "character",
    "slug": "82127594",
    "title": null,
    "versions": [
      { "version": 1, "createdAt": "2026-02-08T00:00:00.000Z", "fixture": "chara/kk_82127594.png", "notes": "ownCloud/Other" }
    ]
  },
  {
    "id": "scene-simple",
    "type": "scene",
    "slug": "scene-simple",
    "title": "Simple scene",
    "versions": [
      { "version": 1, "createdAt": "2024-01-01T00:00:00.000Z", "fixture": "scene/kk_scene_simple.png" }
    ]
  },
  {
    "id": "scene-main",
    "type": "scene",
    "slug": "scene-main",
    "title": "Studio scene",
    "versions": [
      { "version": 1, "createdAt": "2024-01-01T00:00:00.000Z", "fixture": "scene/kk_scene.png" }
    ]
  },
  {
    "id": "scene-mod",
    "type": "scene",
    "slug": "scene-mod",
    "title": "Mod scene",
    "versions": [
      { "version": 1, "createdAt": "2024-01-01T00:00:00.000Z", "fixture": "scene/kk_scene_mod.png" }
    ]
  },
  {
    "id": "scene-sunshine",
    "type": "scene",
    "slug": "scene-sunshine",
    "title": "Sunshine scene",
    "versions": [
      { "version": 1, "createdAt": "2024-01-01T00:00:00.000Z", "fixture": "scene/kks_scene.png" }
    ]
  }
]
```

When `title` is `null`, resolve display title from character `summary.name` or fall back to `slug` for scenes.

DTO shapes (shared):

```ts
// CardListItem
{
  id: string
  type: "character" | "scene"
  slug: string
  title: string
  latestVersion: number
  versionCount: number
  imageUrl: string  // absolute path on API host, e.g. /api/kk/cards/chara-sample/versions/2/image
  summary: Record<string, unknown>
}

// CardDetail
{
  id: string
  type: "character" | "scene"
  slug: string
  title: string
  latestVersion: number
  versions: Array<{
    version: number
    createdAt: string
    notes?: string
    imageUrl: string
    summary: Record<string, unknown>
  }>
}
```

---

### Task 1: Shared card schemas

**Files:**
- Create: `packages/shared/src/schemas/cards.ts`
- Modify: `packages/shared/src/index.ts`
- Test: covered by `bun run --filter @echbox/shared typecheck` (no separate test runner in shared)

**Interfaces:**
- Consumes: `zod` (existing)
- Produces: `CardTypeSchema`, `CardListItemSchema`, `CardListResponseSchema`, `CardDetailSchema`, exported types `CardType`, `CardListItem`, `CardDetail`

- [ ] **Step 1: Add Zod schemas matching the DTO shapes above** in `packages/shared/src/schemas/cards.ts` and re-export from `packages/shared/src/index.ts`

- [ ] **Step 2: Typecheck**

Run: `bun run --filter @echbox/shared typecheck`  
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/schemas/cards.ts packages/shared/src/index.ts
git commit -m "$(cat <<'EOF'
feat(shared): add card gallery DTO schemas

EOF
)"
```

---

### Task 2: Seed + gallery service

**Files:**
- Create: `packages/backend/src/gallery/seed.json`
- Create: `packages/backend/src/gallery/seed.ts`
- Create: `packages/backend/src/gallery/service.ts`
- Test: `packages/backend/src/__tests__/gallery.test.ts` (service-level tests in this task; HTTP in Task 3)

**Interfaces:**
- Consumes: `KoikatuCharaData`, `KoikatuSceneData` from `../kkloader`; fixtures via path join from `import.meta.dir` → `../../fixtures`
- Produces:
  - `loadSeed(): SeedCard[]` (validated)
  - `createGalleryService(): { listCards(type?: CardType): Promise<CardListItem[]>; getCard(id: string): Promise<CardDetail | null>; getVersionImage(id: string, version: number): Promise<Uint8Array | null> }`
  - Character image: prefer `kc.image` if present, else `kc.faceImage`
  - Scene image: `scene.image` if present, else raw fixture file bytes
  - In-process `Map` cache keyed by `fixture` path for `{ summary, imageBytes }`

- [ ] **Step 1: Write failing service tests** in `packages/backend/src/__tests__/gallery.test.ts`

```ts
test("listCards includes multi-version sample with latestVersion 2", async () => {
  const svc = createGalleryService();
  const cards = await svc.listCards();
  const sample = cards.find((c) => c.id === "chara-sample");
  expect(sample).toBeDefined();
  expect(sample!.latestVersion).toBe(2);
  expect(sample!.versionCount).toBe(2);
  expect(sample!.imageUrl).toBe("/api/kk/cards/chara-sample/versions/2/image");
  expect(sample!.title.length).toBeGreaterThan(0);
});

test("listCards filters by type=scene", async () => {
  const svc = createGalleryService();
  const scenes = await svc.listCards("scene");
  expect(scenes.length).toBeGreaterThan(0);
  expect(scenes.every((c) => c.type === "scene")).toBe(true);
});

test("getCard returns all versions for chara-sample", async () => {
  const svc = createGalleryService();
  const card = await svc.getCard("chara-sample");
  expect(card).not.toBeNull();
  expect(card!.versions.map((v) => v.version)).toEqual([1, 2]);
  expect(card!.versions[1]!.notes).toContain("KKEx");
});

test("getVersionImage returns png bytes for latest sample", async () => {
  const svc = createGalleryService();
  const bytes = await svc.getVersionImage("chara-sample", 2);
  expect(bytes).not.toBeNull();
  expect(bytes!.byteLength).toBeGreaterThan(8);
  expect(bytes![0]).toBe(0x89);
  expect(bytes![1]).toBe(0x50); // PNG
});

test("getCard unknown id returns null", async () => {
  const svc = createGalleryService();
  expect(await svc.getCard("nope")).toBeNull();
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `bun test packages/backend/src/__tests__/gallery.test.ts`  
Expected: FAIL (module / functions missing)

- [ ] **Step 3: Implement `seed.json`, `seed.ts`, and `createGalleryService` in `service.ts`**

- [ ] **Step 4: Run tests — expect PASS**

Run: `bun test packages/backend/src/__tests__/gallery.test.ts`  
Expected: PASS (requires fixtures present; if missing, fail with clear path error from seed load)

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/gallery packages/backend/src/__tests__/gallery.test.ts
git commit -m "$(cat <<'EOF'
feat(backend): add versioned gallery seed service

EOF
)"
```

---

### Task 3: Gallery HTTP routes

**Files:**
- Create: `packages/backend/src/routes/gallery.ts`
- Modify: `packages/backend/src/app.ts`
- Modify: `packages/backend/src/__tests__/gallery.test.ts` (add HTTP cases) or `packages/backend/src/__tests__/app.test.ts`

**Interfaces:**
- Consumes: `createGalleryService()`, shared schemas for response typing where practical
- Produces: Elysia plugin prefix `/api/kk` with:
  - `GET /cards` query `type?: "character" | "scene"` → `{ cards: CardListItem[] }`
  - `GET /cards/:id` → `CardDetail` or 404
  - `GET /cards/:id/versions/:version/image` → PNG body or 404  
  Mount via `app.use(galleryRoutes)` alongside existing `kkloaderRoutes` (same `/api/kk` prefix is fine if routes don’t collide — prefer one combined plugin or nest gallery under the same prefix carefully). **Decision:** implement `galleryRoutes` as `new Elysia({ prefix: "/api/kk" })` with `/cards...` paths only; keep upload routes in `kkloader.ts`.

- [ ] **Step 1: Write failing HTTP tests**

```ts
test("GET /api/kk/cards returns seeded cards", async () => {
  const res = await app.handle(new Request("http://localhost/api/kk/cards"));
  expect(res.status).toBe(200);
  const body = (await res.json()) as { cards: { id: string }[] };
  expect(body.cards.some((c) => c.id === "chara-sample")).toBe(true);
});

test("GET /api/kk/cards?type=character excludes scenes", async () => {
  const res = await app.handle(
    new Request("http://localhost/api/kk/cards?type=character"),
  );
  expect(res.status).toBe(200);
  const body = (await res.json()) as { cards: { type: string }[] };
  expect(body.cards.every((c) => c.type === "character")).toBe(true);
});

test("GET /api/kk/cards/chara-sample returns versions", async () => {
  const res = await app.handle(
    new Request("http://localhost/api/kk/cards/chara-sample"),
  );
  expect(res.status).toBe(200);
  const body = (await res.json()) as { versions: unknown[] };
  expect(body.versions).toHaveLength(2);
});

test("GET missing card is 404", async () => {
  const res = await app.handle(
    new Request("http://localhost/api/kk/cards/does-not-exist"),
  );
  expect(res.status).toBe(404);
});

test("GET version image is png", async () => {
  const res = await app.handle(
    new Request(
      "http://localhost/api/kk/cards/chara-sample/versions/2/image",
    ),
  );
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("image/png");
  const buf = new Uint8Array(await res.arrayBuffer());
  expect(buf[0]).toBe(0x89);
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `bun test packages/backend/src/__tests__/gallery.test.ts`  
Expected: FAIL on HTTP cases (404/route missing)

- [ ] **Step 3: Implement `routes/gallery.ts` and wire into `app.ts`**

- [ ] **Step 4: Run tests — expect PASS**

Run: `bun test packages/backend/src/__tests__/gallery.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/routes/gallery.ts packages/backend/src/app.ts packages/backend/src/__tests__/gallery.test.ts
git commit -m "$(cat <<'EOF'
feat(backend): expose read-only card gallery HTTP API

EOF
)"
```

---

### Task 4: Move UI kit page + nav chrome

**Files:**
- Create: `packages/frontend/app/pages/uikit.vue` (move content from current `index.vue`)
- Create: `packages/frontend/app/components/AppNav.vue`
- Modify: `packages/frontend/app/pages/index.vue` → temporary stub or leave for Task 5 (prefer replace in Task 5; this task only adds `/uikit` + nav)
- Create: `packages/frontend/app/layouts/default.vue` if needed to host nav for all pages

**Interfaces:**
- Consumes: existing M3 / Nuxt UI components already used on index
- Produces: `/uikit` route with prior demo; `AppNav` with links to `/` (Gallery) and `/uikit`

- [ ] **Step 1: Copy current `index.vue` body into `pages/uikit.vue`; add `AppNav` at top of layout or both pages**

- [ ] **Step 2: Leave `index.vue` as a minimal placeholder (“Gallery coming”) OR jump straight to Task 5 if implementing immediately after — do not leave broken routes**

- [ ] **Step 3: Verify pages resolve**

Run: `bun run --filter frontend postinstall` (if needed) then ensure files exist under `app/pages/`  
Expected: `uikit.vue` present; no TypeScript errors in moved script

- [ ] **Step 4: Commit**

```bash
git add packages/frontend/app/pages/uikit.vue packages/frontend/app/components/AppNav.vue packages/frontend/app/layouts/default.vue packages/frontend/app/pages/index.vue
git commit -m "$(cat <<'EOF'
feat(frontend): move M3 playground to /uikit

EOF
)"
```

---

### Task 5: Gallery + detail pages

**Files:**
- Modify: `packages/frontend/app/pages/index.vue`
- Create: `packages/frontend/app/pages/cards/[id].vue`
- Optional: `packages/frontend/app/components/CardTile.vue`

**Interfaces:**
- Consumes: `useApi()` → Eden paths matching Task 3 (`api.api.kk.cards.get`, etc. — confirm generated path after routes exist; adjust to actual treaty shape)
- Image `src`: `${apiUrl}${card.imageUrl}` (or absolute URL if API returns full)
- Produces: gallery grid with type filter (`character` / `scene` / all); tiles show preview, title, type, version badge when `versionCount > 1`; click navigates to `/cards/:id` with version list and switchable preview

- [ ] **Step 1: Implement gallery list on `index.vue` using `useApi()` + `useRuntimeConfig().public.apiUrl`**

- [ ] **Step 2: Implement `cards/[id].vue` detail with version buttons updating displayed image/summary**

- [ ] **Step 3: Manual / typecheck verification**

Run: `bun run typecheck` from repo root (shared + backend); for frontend, `bun run --filter frontend postinstall` and fix any obvious TS issues in new pages  
Expected: backend/shared typecheck PASS; gallery compiles

- [ ] **Step 4: Smoke against running API** (when fixtures + `bun run dev:backend` available)

```bash
curl -s http://localhost:3001/api/kk/cards | head -c 200
```

Expected: JSON with `cards` array

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/app/pages/index.vue packages/frontend/app/pages/cards packages/frontend/app/components
git commit -m "$(cat <<'EOF'
feat(frontend): add card gallery and version detail pages

EOF
)"
```

---

## Spec coverage checklist

| Spec item | Task |
| --- | --- |
| Gallery on `/` | 5 |
| UI kit on `/uikit` | 4 |
| Seed + versioned model | 2 |
| List / detail / image API | 3 |
| Shared DTOs | 1 |
| Multi-version demo card | 2 (`chara-sample`) |
| No write CRUD | Global / all |
| Coordinates omitted | Seed excludes them |

## Execution notes

- If a fixture PNG is missing, gallery tests fail fast with the fixture path — restore per `packages/backend/fixtures/README.md`
- Prefer embedding latest `summary` on list responses (already in DTO) to avoid N+1 from the frontend
