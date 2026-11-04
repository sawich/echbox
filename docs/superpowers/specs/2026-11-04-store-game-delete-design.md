# Delete a store game and its catalog content

## Intent

An admin removes a game from the store, and the catalog rows that belong to it go with it. The app is heading toward a proxy in front of external file storage and will not own blob lifetime, so this delete is a database cascade, not a walk of files on disk.

## Goals

- Admin-only delete on the store page, with a confirmation
- `DELETE /api/games/:id` removes the game even when it still has content
- Deleting the game row removes its content kinds, cards, clothes, scenes, plugins, softmods, their versions, and their votes

## Non-goals

- A file-storage proxy, or moving blobs out of the app
- Deleting content files (png, webp, zip) as part of game delete
- Uninstalling local library instances under `~/.echbox`
- Changing author-only delete of a single card, scene, outfit, plugin, or softmod

## Anti-goals

- Refusing the delete while catalog content remains
- A service that lists every content id and deletes its directory

## Approaches

| | Approach | Tradeoff |
|---|---|---|
| A | `deleteGame` lists content and calls each type's file remover, then deletes rows | Correct for files that live in the app today; ties delete to local paths the app is leaving |
| **B (chosen)** | `ON DELETE CASCADE` from the game through content, versions, and votes | Delete stays a row delete. Files are someone else's problem once storage is external. SQLite cannot alter a foreign key in place, so the migration recreates those tables |

Chosen because the app will be a proxy with external file storage and will not keep the blobs.

## Behavior

`foreign_keys` is already on. Today only `game_content_kinds.game_id` cascades. Content parents, versions, and votes are `ON DELETE NO ACTION`, so a game delete is rejected while any of those rows exist.

Cascade the chain, and leave every foreign key to `users` as `NO ACTION`:

- `games` → `character_cards`, `scenes`, `clothes`, `plugins`, `softmods`, `game_content_kinds`
- each parent → its versions and its votes

`deleteGame` drops the content-count check and deletes the game row. It still removes that game's icon directory, which it already does. It does not remove content blobs. A missing game is still not found.

The route stays admin-only and returns 204. The store card gets a Delete control next to Edit. Confirming tells the admin the catalog entry and its content rows are removed. Success refreshes the list. Failure stays on the page. Local installs are unchanged.

## Calls

- Full chain, not only `game_id`. Versions and votes must cascade or SQLite still rejects the delete.
- Keep the existing icon-directory removal on game delete. Do not add content-file cleanup.
- Confirmation is a modal on the store card, admin only. Single-item deletes stay as they are.
