# Game content kinds (per-game enablement + relative install paths)

## Intent

Not every catalog game supports every content type. When creating/editing a game, admins opt in to character cards, clothes, scenes, plugins, and softmods via checkboxes (default **off**). For each enabled kind they may set an optional relative install directory under the instance root (`~/.echbox/games/{instanceId}/`). Empty path means the instance root.

## Goals

- Per-game enablement of the five content kinds
- Optional relative path per enabled kind (default = instance root)
- Library / upload UX only exposes kinds the game supports
- Settings live on the **catalog game**, shared by all instances of that game

## Non-goals

- Changing the instance root location (`~/.echbox/games/{instanceId}/` stays fixed)
- Copying/downloading content blobs into those relative dirs in this change (paths are stored and used when install-to-disk lands; until then they still gate UI)
- Per-instance overrides of kind enablement or paths
- Russian UI strings

## Anti-goals

- Showing all five Library tabs for a game that supports none / a subset
- Treating unchecked kinds as “hidden but still installable”

## Approaches considered

| | Approach | Tradeoff |
|---|---|---|
| A | Five bool + five path columns on `games` | Simple reads; schema churn for new kinds |
| B | JSON blob on `games` | Flexible; weaker validation/querying |
| **C (chosen)** | Table `game_content_kinds` | Normalized; easy to extend; matches fixed but growing kind set |

Chosen because the user preferred C and the kind set is already a closed enum elsewhere.

## Data model

Table `game_content_kinds`:

| Column | Notes |
|---|---|
| `game_id` | FK → `games.id`, cascade delete |
| `kind` | enum: `cards` \| `clothes` \| `scenes` \| `plugins` \| `softmods` |
| `rel_path` | text, nullable or empty string = instance root; must be relative (no absolute paths, no `..`) |

Primary key `(game_id, kind)`. Absence of a row = kind **disabled**. Presence = enabled; `rel_path` null/empty → install at instance root.

Existing games: no rows → no content kinds enabled (matches “default off”). Caller's choice: no backfill.

## API / shared types

- `GameDetail` / `GameListItem` include `contentKinds: Array<{ kind, relPath: string | null }>` (only enabled kinds).
- Create/update accept the same array (replace-all semantics for the game’s kinds).
- Validate: known kinds only, no duplicates, `relPath` relative and sanitized.

## UI

**Create / edit game modals** (Store): five checkboxes, all unchecked by default on create. When checked, show an optional relative-path input (placeholder implying instance root). Edit loads current rows into checkboxes + paths.

**Library instance page**: tabs = intersection of the five kinds with the game’s enabled set. If none enabled, show empty state (no tabs / message).

**Galleries / upload**: respect game enablement (don’t offer upload for a disabled kind on that game).

## Builder calls

- Kind string values match existing Tauri `CONTENT_KINDS` / manifest names (`cards`, not `characters`).
- Path validation: reject absolute paths and `..` segments; normalize empty → `null` in storage.
- Cascade delete kinds when a game is deleted.
