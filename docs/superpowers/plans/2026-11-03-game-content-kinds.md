# Game content kinds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins enable content kinds per catalog game (checkboxes, default off) with optional relative install paths under the instance root, and hide disabled kinds in Library/upload UX.

**Architecture:** New `game_content_kinds` table (PK `game_id`+`kind`); absence of a row = disabled. Shared Zod kinds + path sanitizer. Game create/patch replace the full set; list/detail include `contentKinds`. Library tabs filter by enabled kinds; content create APIs reject uploads for disabled kinds.

**Tech Stack:** Drizzle/SQLite, Elysia multipart FormData, Zod in `@echbox/shared`, Nuxt/Vue Store modals + Library page, Bun tests

**Spec:** `docs/superpowers/specs/2026-11-03-game-content-kinds-design.md`

## Global Constraints

- Kind enum (API/DB/manifest): `cards` | `clothes` | `scenes` | `plugins` | `softmods` (Library tab `characters` ↔ kind `cards`)
- Default on create: no kinds enabled (no rows)
- `relPath` optional; empty/whitespace → store `null` (= instance root `~/.echbox/games/{instanceId}/`)
- Reject absolute paths and any `..` segment; normalize `\` → `/`; strip leading/trailing `/`
- Replace-all on create/patch: body `contentKinds` is the full desired set (omit or `[]` = clear all)
- Multipart: send `contentKinds` as a JSON string FormData field
- No backfill for existing games
- Cascade delete kinds with game; do not implement blob copy into `relPath` in this plan

## Review Focus

- Absolute path / `..` in `relPath` → 400, game not created with bad kinds
- Duplicate kind in payload → 400
- Patch with `contentKinds: []` clears previously enabled kinds
- Library with zero enabled kinds shows empty state (no default Characters tab)
- Upload card/plugin/etc. for a game that does not enable that kind → 400/403 with clear code

---

## File Structure

| Path | Role |
| --- | --- |
| `packages/shared/src/schemas/games.ts` | `ContentKind`, `GameContentKind`, create/patch + list schemas |
| `packages/shared/src/content-path.ts` (new) | `normalizeContentRelPath(input) → string \| null` or throw |
| `packages/backend/src/db/schema.ts` | `gameContentKinds` table |
| `packages/backend/drizzle/0010_game_content_kinds.sql` (+ journal/meta via generate) | Migration |
| `packages/backend/src/games/service.ts` | Persist/load kinds; `assertGameSupportsKind` |
| `packages/backend/src/routes/games.ts` | Parse `contentKinds` from multipart; pass through |
| `packages/backend/src/{cards,scenes,clothes,plugins,softmods}/service.ts` | Call `assertGameSupportsKind` on create |
| `packages/frontend/app/pages/store/index.vue` | Checkboxes + optional path fields; FormData |
| `packages/frontend/app/pages/library/[instanceId].vue` | Filter tabs; empty state |
| Tests: `packages/shared/src/__tests__/content-path.test.ts`, `packages/backend/src/games/__tests__/content-kinds.test.ts`, extend `games-http.test.ts` |

---

### Task 1: Shared kinds + path normalizer

**Files:**
- Modify: `packages/shared/src/schemas/games.ts`
- Create: `packages/shared/src/content-path.ts`
- Modify: `packages/shared/src/index.ts` (re-exports)
- Test: `packages/shared/src/__tests__/content-path.test.ts`

**Interfaces:**
- Produces:
  - `ContentKindSchema = z.enum(["cards","clothes","scenes","plugins","softmods"])`
  - `GameContentKindSchema = z.object({ kind: ContentKindSchema, relPath: z.string().nullable() })`
  - Extend `GameListItemSchema` with `contentKinds: z.array(GameContentKindSchema)`
  - Extend `CreateGameBodySchema` with `contentKinds: z.array(z.object({ kind: ContentKindSchema, relPath: z.string().nullable().optional() })).optional()`
  - `normalizeContentRelPath(raw: string | null | undefined): string | null` — empty→null; reject absolute (`/`, `C:\`, UNC) and `..`; normalize separators; trim slashes
  - `parseContentKindsInput(raw: unknown): GameContentKind[]` — Zod parse, normalize each path, reject duplicates (throws `Error` with message suitable for 400)

- [ ] **Step 1: Write failing tests** in `content-path.test.ts`

```ts
test("empty and whitespace become null", () => {
  expect(normalizeContentRelPath("")).toBeNull();
  expect(normalizeContentRelPath("  ")).toBeNull();
  expect(normalizeContentRelPath(null)).toBeNull();
});

test("normalizes relative path", () => {
  expect(normalizeContentRelPath("UserData\\\\cards/")).toBe("UserData/cards");
});

test("rejects absolute and parent segments", () => {
  expect(() => normalizeContentRelPath("/etc")).toThrow();
  expect(() => normalizeContentRelPath("a/../b")).toThrow();
  expect(() => normalizeContentRelPath("C:\\\\mods")).toThrow();
});

test("parseContentKindsInput rejects duplicates", () => {
  expect(() =>
    parseContentKindsInput([
      { kind: "cards", relPath: null },
      { kind: "cards", relPath: "x" },
    ]),
  ).toThrow();
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd packages/shared && bun test src/__tests__/content-path.test.ts`

- [ ] **Step 3: Implement schemas + `normalizeContentRelPath` + `parseContentKindsInput`; re-export from index**

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): content kind schemas and relative path normalizer"
```

---

### Task 2: DB table + game service kinds

**Files:**
- Modify: `packages/backend/src/db/schema.ts`
- Create: migration via `bun run db:generate` in `packages/backend` (expect `0010_*.sql` + journal)
- Modify: `packages/backend/src/games/service.ts`
- Test: `packages/backend/src/games/__tests__/content-kinds.test.ts`

**Interfaces:**
- Consumes: `parseContentKindsInput`, `ContentKind` from shared
- Produces:
  - Table `game_content_kinds`: `gameId` text FK cascade, `kind` text, `relPath` text nullable; PK `(gameId, kind)`
  - `GameRecord.contentKinds: { kind: ContentKind; relPath: string | null }[]`
  - `CreateGameInput.contentKinds?: …`; `PatchGameInput.contentKinds?: …` (if provided on patch, replace-all; if omitted on patch, leave unchanged)
  - `assertGameSupportsKind(gameId, kind, options?)` — throws `BadGameError` with code usable as `kind_not_supported` when row missing
  - `createGame` / `patchGame` / `getGame` / `listGames` load kinds; `deleteGame` relies on FK cascade (verify)

- [ ] **Step 1: Failing service tests** (`content-kinds.test.ts`, use temp db + `migrateDb`)

```ts
test("createGame with kinds persists and getGame returns them", () => { /* cards+plugins; empty path → null */ });
test("createGame defaults to empty contentKinds", () => { /* no arg → [] */ });
test("patchGame replace-all clears and sets", () => { /* enable two → patch [] → []; patch one kind */ });
test("assertGameSupportsKind throws when disabled", () => { /* create without kinds; assert cards throws */ });
test("invalid relPath rejected before insert", () => { /* create with relPath ".." throws BadGameError; no game row */ });
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd packages/backend && bun test src/games/__tests__/content-kinds.test.ts`

- [ ] **Step 3: Add Drizzle table, generate+apply migration, implement service helpers**

After editing schema: `cd packages/backend && bun run db:generate` then ensure journal entry `0010_…`. Implement `replaceContentKinds(db, gameId, kinds)` used by create/patch. On create, always call replace with parsed list (default `[]`). On patch, call replace only when `contentKinds !== undefined`.

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/db packages/backend/drizzle packages/backend/src/games
git commit -m "feat(games): persist per-game content kinds and relative paths"
```

---

### Task 3: HTTP create/patch + content create guards

**Files:**
- Modify: `packages/backend/src/routes/games.ts`
- Modify: `packages/backend/src/cards/service.ts` (create path), `scenes/service.ts`, `clothes/service.ts`, `plugins/service.ts`, `softmods/service.ts` — call `assertGameSupportsKind` after `assertGameExists` (or equivalent)
- Modify: `packages/backend/src/__tests__/games-http.test.ts`
- Optionally extend one content HTTP test (e.g. gallery/plugins) for `kind_not_supported`

**Interfaces:**
- Consumes: Task 2 service APIs; `parseContentKindsInput`
- Produces: POST/PATCH accept optional FormData field `contentKinds` (JSON string); responses include `contentKinds`
- Error: bad JSON / validation → 400 `{ error, code: "bad_content_kinds" }`

- [ ] **Step 1: Extend `games-http.test.ts`** with failing cases

```ts
test("create game with contentKinds JSON field", async () => { /* FormData contentKinds=JSON.stringify([{kind:"cards",relPath:"UserData/cards"}]); expect 201 + body.contentKinds */ });
test("create rejects bad relPath", async () => { /* .. → 400 bad_content_kinds */ });
test("patch clears contentKinds with []", async () => { /* create with cards; patch contentKinds=[] ; get → [] */ });
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd packages/backend && bun test src/__tests__/games-http.test.ts`

- [ ] **Step 3: Wire routes + assertGameSupportsKind on content creates**

Parse helper in routes: if `body.contentKinds` is string, `JSON.parse` then `parseContentKindsInput`; if missing on POST, `[]`; on PATCH omit when field absent. Add `contentKinds: t.Optional(t.String())` to body schemas.

- [ ] **Step 4: Run games-http + a smoke content create test — expect PASS**

Also add/adjust one test that creating a plugin for a game with no plugin kind returns error with `kind_not_supported` (or BadGameError message mapped in that route).

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/routes/games.ts packages/backend/src/{cards,scenes,clothes,plugins,softmods}/service.ts packages/backend/src/__tests__
git commit -m "feat(api): accept contentKinds on games; gate content uploads"
```

---

### Task 4: Store create/edit UI

**Files:**
- Modify: `packages/frontend/app/pages/store/index.vue`

**Interfaces:**
- Consumes: `ContentKind`, `GameListItem.contentKinds` from shared
- UI kinds (label → kind): Characters→`cards`, Clothes→`clothes`, Scenes→`scenes`, Plugins→`plugins`, Softmods→`softmods`
- Create state: five `{ enabled: false, relPath: "" }` defaults
- Edit: hydrate from `game.contentKinds`
- FormData: `form.set("contentKinds", JSON.stringify(enabledEntries))` where each entry is `{ kind, relPath: string | null }` (empty input → `null`)

- [ ] **Step 1: Add checkbox group + conditional path inputs to create and edit modals**

Use `UCheckbox` (or native checkbox + Nuxt UI pattern already in project if `UCheckbox` unused — prefer Nuxt UI). Path `UInput` only when checked; hint “Relative to instance root; leave empty for root”.

- [ ] **Step 2: Wire submitCreate / submitEdit / reset / openEdit**

- [ ] **Step 3: Manual check** — open Store as admin in desktop, create game with only Scenes + path `scenes`, edit and clear; confirm list payload has expected `contentKinds` (browser network or temporary log). No automated frontend test required unless one already covers Store.

- [ ] **Step 4: Commit**

```bash
git add packages/frontend/app/pages/store/index.vue
git commit -m "feat(store): content kind checkboxes and relative paths on create/edit"
```

---

### Task 5: Library tabs filter + empty state

**Files:**
- Modify: `packages/frontend/app/pages/library/[instanceId].vue`

**Interfaces:**
- Consumes: `game.contentKinds`
- Map tab key → kind: `characters→cards`, others same name
- `visibleTabs = tabs.filter(t => game.contentKinds.some(k => k.kind === tabKind(t.key)))`
- Default tab: first visible, else none; if `route.query.tab` not in visible, fall back to first
- Empty: when `game` loaded and `visibleTabs.length === 0`, show short message (“This game has no content types enabled”) and hide tab nav + galleries

- [ ] **Step 1: Implement filtered tabs + empty state + safe default tab**

- [ ] **Step 2: Smoke** — instance of game with only `plugins` shows Plugins tab only; game with `[]` shows empty state

- [ ] **Step 3: Commit**

```bash
git add packages/frontend/app/pages/library/[instanceId].vue
git commit -m "feat(library): show only enabled content kind tabs"
```

---

## Self-review checklist (done)

- Spec coverage: table C, default off, optional path→root, create/edit UI, library filter, upload gate, validation, no blob copy, no backfill → Tasks 1–5
- Types: `contentKinds` / `relPath` / kind enum consistent across shared → service → HTTP → UI
- Review Focus lines each have a test in Tasks 1–3 or UI smoke in 4–5
