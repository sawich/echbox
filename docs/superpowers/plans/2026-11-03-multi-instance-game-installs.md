# Multi-instance game installs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow several local installs of the same catalog game, each with its own content jsonl tree under a unique `instanceId`.

**Architecture:** Replace the 1:1 `~/.echbox/games/{gameId}` map with `~/.echbox/games/{instanceId}` plus `instance.json` (`instanceId`, `gameId`, `label`, `createdAt`). Migrate legacy dirs in place. Tauri commands and `useLocalInstalls` speak instances; Library routes by `instanceId`; Store can always install another copy. Catalog `gameId` remains the API filter for content.

**Tech Stack:** Tauri/Rust (`local_install.rs`), Nuxt/Vue (`useLocalInstalls`, Library, Store, gallery pages)

**Spec:** `docs/superpowers/specs/2026-11-03-multi-instance-game-installs-design.md`

## Global Constraints

- Layout: `~/.echbox/games/{instanceId}/.echbox/instance.json` + `.echbox/{cards,plugins,scenes,clothes,softmods}.jsonl`
- `GameInstance`: `{ instanceId, gameId, label, createdAt }` camelCase JSON
- `install_game(gameId)` **always** creates a new instance (never no-ops on existing)
- Labels: first instance of a `gameId` gets `""`; additional get `"#2"`, `"#3"`, …
- Legacy: dir with `.echbox/` and no `instance.json` → `instanceId=dirName`, `gameId=dirName`, write `instance.json` on list/install touch
- Path validation: same rules as today’s `validate_game_id` applied to `instanceId`
- No custom install roots; no rename UI
- Route param is **instanceId**: `/library/[instanceId]`
- Content galleries: API uses `gameId`, local install ops use `instanceId`

## Review Focus

- Second `install_game` for same catalog id creates a **second** directory and distinct `instanceId`
- Legacy tree without `instance.json` still lists and accepts content install after migration write
- Uninstall one instance leaves sibling instances of the same `gameId` intact
- Content installed into instance A does not appear in instance B’s manifests
- Store “Open” with multiple instances lands on a real instance route (not catalog `gameId`)

---

## File Structure

| Path | Role |
| --- | --- |
| `packages/frontend/src-tauri/src/local_install.rs` | Instance model, migrate, install/list/uninstall, content by instanceId |
| `packages/frontend/src-tauri/src/lib.rs` | Register updated command signatures |
| `packages/frontend/app/composables/useLocalInstalls.ts` | TS wrappers + `GameInstance` type |
| `packages/frontend/app/pages/library.vue` | Sidebar of instances; uninstall by instanceId |
| `packages/frontend/app/pages/library/[gameId].vue` → rename to `[instanceId].vue` | Resolve instance → catalog game; pass both ids to galleries |
| `packages/frontend/app/pages/store/index.vue` | Always Install; Open → first instance; show count |
| `packages/frontend/app/components/{Card,Scene,Clothes}GalleryPage.vue`, `ModCatalogPage.vue` | Take `instanceId` for local install |
| `packages/frontend/app/pages/{plugins,softmods}/[id].vue` | Back link resolves via instances for `gameId` |

---

### Task 1: Rust instance core + migration

**Files:**
- Modify: `packages/frontend/src-tauri/src/local_install.rs`
- Modify: `packages/frontend/src-tauri/src/lib.rs` (signatures only if needed for compile; prefer finishing in Task 2)

**Interfaces:**
- Produces:
  - `struct GameInstance { instance_id, game_id, label, created_at }` (`camelCase`)
  - `fn install_game(game_id: &str) -> Result<GameInstance, String>` — new uuid instance; label `""` or `#N`
  - `fn list_installed_instances() -> Result<Vec<GameInstance>, String>` — migrates legacy dirs
  - `fn uninstall_instance(instance_id: &str) -> Result<(), String>`
  - `fn ensure_instance(instance_id: &str) -> Result<GameInstance, String>` — migrate/load one
  - Content fns take `instance_id` instead of `game_id`: `list_installed_content`, `install_content`, `uninstall_content`
  - Remove or stop exporting old `list_installed_games() -> Vec<String>` / `uninstall_game` once callers move (Task 2–3)

- [ ] **Step 1: Failing tests** in `local_install.rs` `#[cfg(test)]`:

```rust
#[test]
fn install_game_twice_creates_two_instances() { /* same game_id → 2 GameInstance with distinct instance_id; labels "" and "#2" */ }

#[test]
fn legacy_dir_migrates_on_list() { /* mkdir games/old-id/.echbox + empty jsonl; list → one instance old-id/old-id; instance.json exists */ }

#[test]
fn uninstall_one_instance_keeps_sibling() { /* two installs; uninstall first; list len 1; content in second intact */ }

#[test]
fn content_is_per_instance() { /* install card into A; list B cards empty */ }
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `cd packages/frontend/src-tauri && cargo test local_install -- --nocapture`

- [ ] **Step 3: Implement instance layout + APIs**

Use `uuid` crate already in workspace if present; otherwise `Uuid::new_v4()` via available dep or generate with a small helper. Write `instance.json` inside `.echbox/`. `install_content` must **not** call catalog-id `install_game`; ensure instance dir exists via `ensure_instance`.

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/src-tauri/src/local_install.rs
git commit -m "feat(desktop): local game installs keyed by instanceId"
```

---

### Task 2: Tauri commands + `useLocalInstalls`

**Files:**
- Modify: `packages/frontend/src-tauri/src/lib.rs`
- Modify: `packages/frontend/app/composables/useLocalInstalls.ts`

**Interfaces:**
- Consumes: Task 1 Rust APIs
- Produces (TS):
  - `export type GameInstance = { instanceId: string; gameId: string; label: string; createdAt: string }`
  - `listInstalledInstances(): Promise<GameInstance[]>`
  - `installGame(gameId: string): Promise<GameInstance>`
  - `uninstallInstance(instanceId: string): Promise<void>`
  - `listInstalledContent(instanceId, kind)`, `installContent(instanceId, kind, row)`, `uninstallContent(instanceId, kind, contentId)`
  - Drop `listInstalledGames` / `uninstallGame` (update call sites in Task 3–4)

Tauri command names: `list_installed_instances`, `install_game` (returns `GameInstance`), `uninstall_instance`, content commands arg `instanceId`.

- [ ] **Step 1: Wire Rust commands in `lib.rs`** to match Interfaces

- [ ] **Step 2: Rewrite `useLocalInstalls.ts`** to the Interfaces above

- [ ] **Step 3: `cargo check` in `src-tauri`**

Run: `cd packages/frontend/src-tauri && cargo check`

- [ ] **Step 4: Commit**

```bash
git add packages/frontend/src-tauri/src/lib.rs packages/frontend/app/composables/useLocalInstalls.ts
git commit -m "feat(desktop): expose game instances to the frontend"
```

---

### Task 3: Library + hub route by instanceId

**Files:**
- Modify: `packages/frontend/app/pages/library.vue`
- Rename/Modify: `packages/frontend/app/pages/library/[gameId].vue` → `[instanceId].vue`
- Modify galleries: `CardGalleryPage.vue`, `SceneGalleryPage.vue`, `ClothesGalleryPage.vue`, `ModCatalogPage.vue` — add optional `instanceId` prop; use it for local install calls; keep `gameId` for API

**Interfaces:**
- Consumes: `listInstalledInstances`, `uninstallInstance`, content ops with `instanceId`
- Library sidebar row key = `instanceId`; display catalog title + `label` when non-empty
- Hub: `route.params.instanceId` → find instance → `api.games({ id: instance.gameId })`; pass `:game-id` + `:instance-id` to child catalogs
- Softmods/plugins back links (optional same commit or Task 4): resolve `instances.find(i => i.gameId === data.gameId)` → `/library/${instanceId}?tab=…`, else `/library`

- [ ] **Step 1: Update `library.vue`** to list/uninstall/select instances; route `/library/${instanceId}`

- [ ] **Step 2: Convert hub page** to load by instance; pass both ids; “Installed locally” = instance exists in list

- [ ] **Step 3: Galleries/ModCatalog** use `instanceId` for install toggles (guard: no install UI without `instanceId`)

- [ ] **Step 4: Manual smoke** — open Library with a legacy migrated folder still works (or unit-level: instance list shapes)

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/app/pages/library.vue packages/frontend/app/pages/library/ packages/frontend/app/components/
git commit -m "feat(library): browse and manage game instances"
```

---

### Task 4: Store multi-install + content detail back links

**Files:**
- Modify: `packages/frontend/app/pages/store/index.vue`
- Modify: `packages/frontend/app/pages/plugins/[id].vue`, `packages/frontend/app/pages/softmods/[id].vue` (and cards/scenes/clothes back links if they hardcode `/library/${gameId}`)

**Interfaces:**
- Store tracks `GameInstance[]` (or `Map<gameId, GameInstance[]>`)
- **Install** always calls `installGame(game.id)` then navigates to `/library/${created.instanceId}` (or refreshes count)
- **Open** when `instancesForGame.length > 0` → `/library/${oldestOrFirst.instanceId}`
- Show count badge when `> 0`; do not hide Install
- Detail backTo: prefer matching instance for `gameId`, else `/library`

- [ ] **Step 1: Update Store install/open UX** per Interfaces

- [ ] **Step 2: Fix detail back links** that assumed catalog id in `/library/:id`

- [ ] **Step 3: Commit**

```bash
git add packages/frontend/app/pages/store/index.vue packages/frontend/app/pages/plugins/[id].vue packages/frontend/app/pages/softmods/[id].vue
git commit -m "feat(store): allow installing another copy of a game"
```

---

### Task 5: Verification pass

**Files:** none new

- [ ] **Step 1: Run Rust tests**

Run: `cd packages/frontend/src-tauri && cargo test local_install`

Expected: PASS (including Review Focus cases from Task 1)

- [ ] **Step 2: Grep for stale APIs**

Run: `rg "listInstalledGames|uninstallGame|list_installed_games|uninstall_game" packages/frontend --glob '!**/local_install.rs'`

Expected: no call-site leftovers (tests in Rust may keep migration names only if removed)

- [ ] **Step 3: Commit only if Step 2 required cleanup**; otherwise done
