# Games Store + Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an admin-curated game Store and a local Tauri Library where users install games (folder stub) and install content into per-game jsonl manifests, with all content required to bind to a game.

**Architecture:** Approach A — API owns `games` + content with required `gameId`; disk under `~/.echbox/games/{uuid}/.echbox/*.jsonl` owns install state via Tauri commands. Nav becomes Library | Store; content browsed inside `/library/[gameId]`.

**Tech Stack:** Bun, Elysia, Drizzle/`bun:sqlite`, Nuxt, Tauri 2 (Rust commands), `@echbox/shared` Zod

**Spec:** `docs/superpowers/specs/2026-11-01-games-store-library-design.md`

## Global Constraints

- `ADMIN_DISCORD_IDS` comma-separated Discord snowflakes; only those users create/patch/delete games
- Content tables require non-null `game_id`; versions inherit parent game (no per-version game)
- Wipe existing seed content before NOT NULL `game_id` migration
- Delete game blocked while any content references it
- Install game/content only in Tauri; web disables install with notice
- jsonl row: `{ id, version, title, contentHash?, installedAt }`
- No game cover images in v1
- Skip git commits unless the user asks (user rule overrides plan commit steps)

## Review Focus

- Non-admin `POST /api/games` → 403
- Create card/scene/plugin/softmod without `gameId` → 400
- List content with `?gameId=` returns only that game’s items
- Delete game with content → 409; empty game → 204/ok
- Install content twice for same id updates version, does not duplicate jsonl lines
- Path traversal in game uuid (`..`) never escapes `~/.echbox/games`

---

## File Structure

| Path | Role |
| --- | --- |
| `packages/backend/src/db/schema.ts` | `games` table + `gameId` on content |
| `packages/backend/drizzle/` | Migration (wipe content then add FK) |
| `packages/backend/src/auth/admin.ts` | `isAdmin(user)` from env |
| `packages/backend/src/games/service.ts` | CRUD + delete-if-empty |
| `packages/backend/src/games/errors.ts` | Service errors |
| `packages/backend/src/routes/games.ts` | `/api/games` |
| `packages/backend/src/cards|scenes|plugins|softmods/service.ts` | Require + filter `gameId` |
| `packages/backend/src/routes/{gallery,scenes,plugins,softmods}.ts` | Pass `gameId` |
| `packages/shared/src/schemas/games.ts` | Zod schemas |
| `packages/shared/src/schemas/{cards,scenes,plugins,softmods,users}.ts` | Add `gameId` |
| `packages/frontend/src-tauri/src/lib.rs` | Install/list/uninstall commands |
| `packages/frontend/src-tauri/capabilities/default.json` | Allow commands |
| `packages/frontend/app/composables/useLocalInstalls.ts` | Invoke Tauri + web stub |
| `packages/frontend/app/pages/store/index.vue` | Store |
| `packages/frontend/app/pages/library/index.vue` | Library grid |
| `packages/frontend/app/pages/library/[gameId].vue` | Game hub tabs |
| `packages/frontend/app/pages/index.vue` | Redirect → `/library` |
| `packages/frontend/app/components/AppNav.vue` | Library \| Store |

---

### Task 1: Games schema + admin helper + games API

**Files:**
- Modify: `packages/backend/src/db/schema.ts`
- Create: `packages/backend/src/auth/admin.ts`, `packages/backend/src/games/errors.ts`, `packages/backend/src/games/service.ts`, `packages/backend/src/routes/games.ts`
- Modify: `packages/backend/src/app.ts`, `packages/backend/.env.example`
- Test: `packages/backend/src/__tests__/games-http.test.ts`, extend schema test

**Interfaces:**
- Produces: `games` table; `isAdmin(user: { discordId: string } | null): boolean`
- `listGames()`, `getGame(id)`, `createGame({ title, slug?, description?, createdByUserId })`, `patchGame`, `deleteGame` (409 if content exists)
- Routes under `/api/games`

- [ ] **Step 1:** Failing HTTP tests: admin create ok; non-admin 403; list public; delete with content 409
- [ ] **Step 2:** Schema + migration + service + routes; `ADMIN_DISCORD_IDS` in `.env.example`
- [ ] **Step 3:** Tests pass

### Task 2: Require `gameId` on all content + wipe seed

**Files:**
- Modify schema content tables + migration that deletes existing content rows/files-safe wipe then adds NOT NULL `game_id`
- Modify create/list in cards/scenes/plugins/softmods services + routes
- Modify shared Zod + profile
- Update existing service/http tests to create a game first and pass `gameId`

**Interfaces:**
- `Create*Input.gameId: string` required
- `list*(opts & { gameId?: string })` filters when provided
- List/detail responses include `gameId`

- [ ] **Step 1:** Update tests to expect `gameId`; fail without it
- [ ] **Step 2:** Migration wipe + column; wire services/routes/schemas
- [ ] **Step 3:** Full backend content tests pass

### Task 3: Tauri local install commands

**Files:**
- Modify: `packages/frontend/src-tauri/src/lib.rs`, `capabilities/default.json`, `Cargo.toml` if needed
- Test: unit-testable pure helpers if extracted, or document manual verify; prefer `#[cfg(test)]` in Rust for path join safety + jsonl upsert

**Interfaces (commands):**
- `list_installed_games() -> Vec<String>` (uuids)
- `install_game(game_id: String) -> ()`
- `uninstall_game(game_id: String) -> ()`
- `list_installed_content(game_id, kind: "cards"|"scenes"|"plugins"|"softmods") -> Vec<ContentInstall>`
- `install_content(game_id, kind, row: ContentInstall) -> ()`
- `uninstall_content(game_id, kind, content_id) -> ()`
- Reject `game_id` containing `/`, `\`, `..`

- [ ] **Step 1:** Rust tests for safe path + jsonl upsert/remove
- [ ] **Step 2:** Implement commands + register
- [ ] **Step 3:** Tests pass

### Task 4: Frontend Store + Library + nav

**Files:**
- Create store/library pages + `useLocalInstalls.ts`
- Modify `AppNav.vue`, `index.vue` redirect
- Adapt gallery/mod catalog components to accept `gameId`
- Pass `gameId` on uploads from hub
- Detail pages show game title when available
- Profile badge optional

- [ ] **Step 1:** Nav Library|Store; `/` → `/library`
- [ ] **Step 2:** Store page with install/open + admin create form
- [ ] **Step 3:** Library list + `[gameId]` hub tabs reusing catalogs with `gameId`
- [ ] **Step 4:** Wire install content buttons; disable outside Tauri
- [ ] **Step 5:** Smoke: `bun test` backend; frontend typecheck if available

---

## Self-review

- Spec Store/Library/admin/`gameId`/jsonl/wipe/block-delete covered by Tasks 1–4
- Path traversal + duplicate jsonl covered in Task 3 Review Focus tests
- No server install tracking (non-goal)
