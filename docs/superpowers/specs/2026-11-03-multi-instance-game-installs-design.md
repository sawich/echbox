# Multi-instance game installs (Approach A)

## Intent

Allow several local installs of the same catalog game so users can keep separate content sets (e.g. clean vs modded) without duplicating the game in the Store API.

## Goals

- Multiple local instances per catalog `gameId`
- Library lists instances (not bare game ids); each has its own content jsonl tree
- Store can install another copy of an already-installed game
- Migrate existing `~/.echbox/games/{gameId}/` trees in place (no data loss)
- Content install/uninstall targets the **active instance**, not the catalog id

## Non-goals

- Custom filesystem roots / real KK or BepInEx folders (Approach B — later)
- Server-side tracking or sync of instances
- Fancy instance management (rename UI, clone, export) beyond a default label
- Changing catalog APIs or `gameId` on content rows

## Approaches

- **A (chosen):** Local `instanceId` under `~/.echbox/games/{instanceId}/` with `instance.json` linking to catalog `gameId`
- **B:** User-picked install path — deferred until real binary installs
- **C:** Slots under `{gameId}/{slot}/` — rejected (still path-tied to catalog id; awkward composite keys)

## Local layout

```
~/.echbox/games/{instanceId}/
  .echbox/
    instance.json        # { instanceId, gameId, label, createdAt }
    cards.jsonl
    plugins.jsonl
    scenes.jsonl
    clothes.jsonl
    softmods.jsonl
```

- **Install:** create new `instanceId` (uuid), write `instance.json`, create empty jsonl stubs
- **List:** return instance records (not bare game id strings)
- **Uninstall:** delete `games/{instanceId}/`
- **Content ops:** take `instanceId` (path key); catalog `gameId` stays for API filters only

### Migration

On read/list (and once on install-related commands):

- If `games/{dir}/.echbox/` exists and `instance.json` is missing → treat as legacy instance with `instanceId = dir`, `gameId = dir`, `label` from catalog title when UI has it (Rust may use empty/`gameId`), then write `.echbox/instance.json` so the tree is canonical.
- If `games/{dir}/instance.json` exists beside `.echbox/` (pre-relocation) → move it to `.echbox/instance.json` on read/list.

## Tauri / composable surface

Replace string game-id install APIs with instance-aware ones:

| Command | Change |
|---------|--------|
| `install_game(gameId)` | returns created `GameInstance` (always new instance) |
| `list_installed_games()` | → `list_installed_instances()` → `GameInstance[]` |
| `uninstall_game(gameId)` | → `uninstall_instance(instanceId)` |
| `list/install/uninstall_content` | first arg becomes `instanceId` |

`GameInstance`: `{ instanceId, gameId, label, createdAt }` (camelCase JSON).

Keep thin aliases only if needed for a one-release shim; prefer a clean break in the desktop app (local-only state).

## Frontend IA

- Route **`/library/[instanceId]`** (param is instance id, not catalog game id)
- Library sidebar: one row per instance; show catalog title + label when multiple share a `gameId` (builder call: default label `""` for first, auto `"#2"`, `"#3"`… at create time)
- Store: **Install** always available on desktop; if instances exist, secondary **Open** goes to an existing instance (first by `createdAt`) or Library; show small count when `> 0`
- Game hub tabs unchanged; content galleries receive **`gameId` (API) + `instanceId` (local install)**

## Builder calls

- Labels: auto `#2`, `#3`… when creating an additional instance of a game that already has ≥1 local instance; first instance unlabeled (title alone in sidebar)
- No rename UI in this pass
- UUIDv4/v7 for `instanceId` — implementer’s choice; validate same as today’s game id path rules
- Do not keep dual route `/library/:gameId` forever; migrate call sites to instance id

## Success

User can install Koikatsu twice, open each from Library, and install different cards into each without collision.
