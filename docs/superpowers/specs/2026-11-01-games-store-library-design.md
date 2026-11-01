# Games Store + Library (Approach A)

## Intent

echbox becomes game-scoped: admins publish games; users “install” a game locally (folder stub only); inside that game they browse and install cards/scenes/plugins/softmods by appending rows to local jsonl manifests. No real Koikatsu/BepInEx install yet.

## Goals

- Admin-only game CRUD (allowlist via `ADMIN_DISCORD_IDS`)
- Store page to browse/install games
- Library (Steam-like) of locally installed games; content lives inside a selected game
- Required `gameId` on cards, scenes, plugins, softmods (versions inherit parent game)
- Desktop install writes `~/.echbox/games/{game_uuid}/.echbox/{cards,plugins,scenes,softmods}.jsonl`
- Wipe existing seed/DB content that lacks a game

## Non-goals

- Actual game binary / BepInEx / Sideloader file install
- Server-side install tracking / cross-device sync
- User-created games
- Keeping global top-nav Characters/Scenes/Plugins/Softmods catalogs

## Approaches

- **A (chosen):** API catalog + local disk installs
- **B:** Also persist installs on server — deferred (sync cost, no KK install yet)
- **C:** Local-first catalog — rejected (breaks current API upload/vote stack)

## Data model

New table `games`:

- `id` (uuid PK), `slug`, `title`, `description` (nullable), `createdByUserId`, `createdAt`, `updatedAt`

Add non-null `game_id` FK → `games.id` on:

- `character_cards`, `scenes`, `plugins`, `softmods`

Versions stay on the parent row (no per-version game change).

Migration strategy: drop/wipe seed card/scene/plugin/softmod rows + files (seed-only), then add NOT NULL `game_id`. Provide at least one admin-created game before re-upload.

## AuthZ

- `ADMIN_DISCORD_IDS` comma-separated in env
- `isAdmin(user)` helper; `POST/PATCH/DELETE /api/games` admin-only
- `GET /api/games` + `GET /api/games/:id` public
- Content create requires `gameId`; list/detail include and filter by `gameId`

## Local install layout (Tauri only)

```
~/.echbox/games/{game_uuid}/
  .echbox/
    cards.jsonl
    plugins.jsonl
    scenes.jsonl
    softmods.jsonl
```

- **Install game:** mkdir + create four empty jsonl files if missing
- **Install content:** append one JSON line (idempotent by `id`, update `version` if already present)
- **jsonl row shape:** `{ "id", "version", "title", "contentHash", "installedAt" }`
  (softmods/plugins may omit `contentHash` if not applicable; use latest version fields from API)
- **Uninstall content:** rewrite jsonl without that `id`
- **Uninstall game:** delete `~/.echbox/games/{uuid}/`
- Web/non-Tauri: Store/Library UI works for browsing API data; install actions disabled with short notice

Prefer small Rust Tauri commands scoped to `$HOME/.echbox` over broad FS plugin permissions.

## API surface

- `/api/games` — list, get, create (admin), patch (admin), delete (admin)
- Delete game **blocked** while any content references it
- Content list endpoints accept `?gameId=`; Library always passes it
- Create/upload bodies include `gameId`
- Shared Zod schemas gain `gameId` / `GameListItem` / `GameDetail`

## Frontend IA

Nav becomes **Library** | **Store** (replace Characters/Scenes/Plugins/Softmods).

Routes:

- `/` → redirect to `/library`
- `/store` — game catalog; Install / Open in Library; admin “Add game”
- `/library` — installed games grid (from local FS ∩ API metadata)
- `/library/[gameId]` — game hub with tabs Characters | Scenes | Plugins | Softmods; Install on items; upload with game fixed
- Keep `/cards/[id]`, `/scenes/[id]`, `/plugins/[id]`, `/softmods/[id]` for detail/version/vote; show game name

## Builder calls

- No cover image for games in v1
- Profile sections show game title badge on listed items when `gameId` is present
- Tauri command naming left to implementer; capabilities must not grant whole-home write
