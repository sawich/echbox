# Store game delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An admin can delete a store game, and the database removes that game's catalog rows (kinds, content, versions, votes) with it.

**Architecture:** `ON DELETE CASCADE` from `games` through the five content parents to their versions and votes. `deleteGame` deletes the game row and still removes that game's icon directory. It does not walk content files. The store card gets a confirm-then-delete control that calls the existing admin `DELETE /api/games/:id`.

**Tech Stack:** Drizzle/SQLite (`PRAGMA foreign_keys = ON` already), Elysia, Nuxt/Vue store page, Bun tests

**Spec:** `docs/superpowers/specs/2026-11-04-store-game-delete-design.md`

## Global Constraints

- Admin-only delete. The route stays admin-only and returns 204.
- `DELETE /api/games/:id` removes the game even when it still has content.
- Deleting the game row removes its content kinds, cards, clothes, scenes, plugins, softmods, their versions, and their votes.
- Foreign keys to `users` stay `ON DELETE no action`.
- Do not build a file-storage proxy. Do not delete content files (png, webp, zip) as part of game delete.
- Do not uninstall local library instances under `~/.echbox`.
- Do not change author-only delete of a single card, scene, outfit, plugin, or softmod.
- `deleteGame` drops the content-count check, deletes the game row, and still calls `removeGameIcons`. A missing game throws `GameNotFoundError`.
- Store card: Delete next to Edit, admin only. Confirming tells the admin the catalog entry and its content rows are removed. Success refreshes the list. Failure stays on the page.

## Review Focus

- A game that has a version and a vote for every kind must disappear together with those rows. A cascade that stops at the parent makes SQLite reject the delete and leave the game.
- The author `users` row must still exist after the game is gone.
- Another game's content rows must stay.
- The content file on disk must stay. The deleted game's icon directory must be gone.
- A non-admin `DELETE` returns 403 and the game remains. An unknown id returns 404.

## File Structure

| Path | Role |
| --- | --- |
| `packages/backend/src/db/schema.ts` | `onDelete: "cascade"` on the game and content-parent foreign keys listed in Task 1 |
| `packages/backend/drizzle/0011_game_delete_cascade.sql` | Recreate those tables so SQLite actually cascades |
| `packages/backend/drizzle/meta/_journal.json` | Journal entry for `0011` |
| `packages/backend/src/games/service.ts` | `deleteGame` deletes the row only (plus existing icon removal) |
| `packages/backend/src/games/__tests__/delete-cascade.test.ts` | Cascade, surviving user, surviving other game, surviving content file |
| `packages/backend/src/games/__tests__/content-kinds.test.ts` | Replace the "blocked when clothes remain" test |
| `packages/backend/src/__tests__/games-http.test.ts` | 204 with content, 403, 404 |
| `packages/frontend/app/pages/store/index.vue` | Confirm modal and Delete button |

Do not run `drizzle-kit generate`. Snapshots stop at `0006` while the journal is at `0010`; generate would rewrite later hand-written migrations.

---

### Task 1: Cascade foreign keys

**Files:**
- Modify: `packages/backend/src/db/schema.ts`
- Create: `packages/backend/drizzle/0011_game_delete_cascade.sql`
- Modify: `packages/backend/drizzle/meta/_journal.json`
- Test: `packages/backend/src/games/__tests__/delete-cascade.test.ts`

**Interfaces:**
- Consumes: `createGame`, `getDb`, `migrateDb`, `games` and the content tables from `schema.ts`
- Produces: after `migrateDb`, `db.delete(games).where(eq(games.id, id)).run()` removes that game's rows in `game_content_kinds`, `character_cards`, `character_card_versions`, `card_votes`, `scenes`, `scene_versions`, `scene_votes`, `clothes`, `clothes_versions`, `clothes_votes`, `plugins`, `plugin_versions`, `plugin_votes`, `softmods`, `softmod_versions`, `softmod_votes`. `users` and other games are untouched. No new function.

- [ ] **Step 1: Write the failing test**

Create `delete-cascade.test.ts`. Use the temp-db `beforeEach` from `content-kinds.test.ts` (`migrateDb`, one user). `seedAllKinds(db, gameId, userId, dataDir)` inserts one parent, one version, and one vote for each of `cards`, `scenes`, `clothes`, `plugins`, and `softmods`, and `Bun.write`s a file at each version's `originalPath` under `dataDir`. It returns those five paths.

Image kinds `cards`, `scenes`, `clothes` need `previewPath` on the version. `plugins` and `softmods` do not. Every version needs a unique `contentHash`. Vote value is `"like"`. Parent columns are the not-null set on that table in `schema.ts` (`latestSemver` / `latestVersionId` may be null). Both games get all five kinds, so after the delete exactly one parent, one version, and one vote remain per kind, and they belong to the surviving game.

```ts
test("deleting the game row cascades every kind and leaves the user, the other game, and the file", () => {
  const kinds = [
    { kind: "cards" as const, relPath: null },
    { kind: "clothes" as const, relPath: null },
    { kind: "scenes" as const, relPath: null },
    { kind: "plugins" as const, relPath: null },
    { kind: "softmods" as const, relPath: null },
  ];
  const game = createGame({ title: "Gone", createdByUserId: userId, dbPath, contentKinds: kinds });
  const other = createGame({ title: "Stays", createdByUserId: userId, dbPath, contentKinds: kinds });
  const db = getDb(dbPath);
  const goneFiles = seedAllKinds(db, game.id, userId, dataDir);
  seedAllKinds(db, other.id, userId, dataDir);

  db.delete(games).where(eq(games.id, game.id)).run();

  expect(db.select().from(games).where(eq(games.id, game.id)).all()).toHaveLength(0);
  expect(db.select().from(users).where(eq(users.id, userId)).all()).toHaveLength(1);
  expect(db.select().from(gameContentKinds).where(eq(gameContentKinds.gameId, game.id)).all()).toHaveLength(0);
  expect(db.select().from(gameContentKinds).where(eq(gameContentKinds.gameId, other.id)).all()).toHaveLength(5);
  for (const table of [characterCards, scenes, clothes, plugins, softmods]) {
    const left = db.select().from(table).all();
    expect(left).toHaveLength(1);
    expect(left[0]!.gameId).toBe(other.id);
  }
  for (const table of [
    characterCardVersions, cardVotes,
    sceneVersions, sceneVotes,
    clothesVersions, clothesVotes,
    pluginVersions, pluginVotes,
    softmodVersions, softmodVotes,
  ]) {
    expect(db.select().from(table).all()).toHaveLength(1);
  }
  for (const path of goneFiles) expect(existsSync(path)).toBe(true);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/games/__tests__/delete-cascade.test.ts` from `packages/backend`

Expected: FAIL with a foreign-key constraint error from `db.delete(games)`.

- [ ] **Step 3: Cascade the foreign keys**

In `schema.ts`, add `{ onDelete: "cascade" }` to:

- `characterCards.gameId`, `scenes.gameId`, `clothes.gameId`, `plugins.gameId`, `softmods.gameId` → `games.id`
- `characterCardVersions.cardId` → `characterCards.id`, `cardVotes.cardId` → `characterCards.id`
- `sceneVersions.sceneId` → `scenes.id`, `sceneVotes.sceneId` → `scenes.id`
- `clothesVersions.clothesId` → `clothes.id`, `clothesVotes.clothesId` → `clothes.id`
- `pluginVersions.pluginId` → `plugins.id`, `pluginVotes.pluginId` → `plugins.id`
- `softmodVersions.softmodId` → `softmods.id`, `softmodVotes.softmodId` → `softmods.id`

Leave every `authorId` / `userId` → `users.id` without `onDelete`. `gameContentKinds.gameId` already cascades.

Hand-write `0011_game_delete_cascade.sql` by copying the recreate blocks from `0008_nullable_latest_version.sql` (cards, scenes, plugins, softmods, and their versions and votes) and `0009_clothes.sql` (clothes and its versions and votes). Same columns, same indexes. Change only those foreign keys to `ON DELETE cascade`. Do not touch `users`, `sessions`, `games`, `game_content_kinds`, `oauth_pending`, or `auth_claims`.

Append to `_journal.json`:

```json
{
  "idx": 11,
  "version": "6",
  "when": 1794044000000,
  "tag": "0011_game_delete_cascade",
  "breakpoints": true
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/games/__tests__/delete-cascade.test.ts` from `packages/backend`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/db/schema.ts packages/backend/drizzle/0011_game_delete_cascade.sql packages/backend/drizzle/meta/_journal.json packages/backend/src/games/__tests__/delete-cascade.test.ts
git commit -m "feat: cascade catalog rows when a game is deleted"
```

---

### Task 2: `deleteGame` deletes through the cascade

**Files:**
- Modify: `packages/backend/src/games/service.ts` (`deleteGame`, remove `contentCountForGame`)
- Modify: `packages/backend/src/games/__tests__/content-kinds.test.ts` (the clothes-block test)
- Modify: `packages/backend/src/__tests__/games-http.test.ts` (the 409 test)
- Test: those two files, plus `delete-cascade.test.ts` for icon removal

**Interfaces:**
- Consumes: Task 1 cascade. `deleteGame(id: string, options?: GameServiceOptions): void`. `removeGameIcons(gameId, dataDir?)`. `GameNotFoundError`.
- Produces: `deleteGame` throws `GameNotFoundError` when the id is missing, deletes the row when content exists, then calls `removeGameIcons`. It does not throw `GameConflictError` with code `game_has_content`. `DELETE /api/games/:id` returns 204 for an admin when a plugin exists, 403 for a non-admin, 404 for an unknown id.

- [ ] **Step 1: Write the failing tests**

Replace `deleteGame blocked when only clothes remain` in `content-kinds.test.ts` with a test that inserts one clothes row (same insert as today) and expects `deleteGame(game.id, { dbPath, dataDir })` to leave zero games with that id and zero clothes with that `gameId`.

Add to `delete-cascade.test.ts`:

```ts
test("deleteGame removes the icon directory and leaves the content file", () => {
  const game = createGame({
    title: "Icons",
    createdByUserId: userId,
    dbPath,
    contentKinds: [{ kind: "cards", relPath: null }],
  });
  const db = getDb(dbPath);
  const [file] = seedAllKinds(db, game.id, userId, dataDir);
  const icon = join(gameIconsDir(game.id, dataDir), "32.webp");
  mkdirSync(dirname(icon), { recursive: true });
  Bun.write(icon, new Uint8Array([1, 2, 3]));

  deleteGame(game.id, { dbPath, dataDir });

  expect(existsSync(icon)).toBe(false);
  expect(existsSync(file!)).toBe(true);
  expect(() => deleteGame(game.id, { dbPath, dataDir })).toThrow(GameNotFoundError);
});
```

Replace `delete blocked while content exists` in `games-http.test.ts`. Keep the `createGame` + `createPlugin` setup and assign the plugin. `createPlugin` returns `PluginDetail`; `versions[0].originalPath` is the zip. Import `getGame` from `../games/service`.

```ts
test("admin delete removes the game and plugin rows and leaves the zip", async () => {
  const plugin = await createPlugin({ /* same args as the old test */ });
  const zipPath = plugin.versions[0]!.originalPath;

  const denied = await app.handle(new Request(`http://localhost/api/games/${game.id}`, {
    method: "DELETE",
    headers: { cookie: userCookie },
  }));
  expect(denied.status).toBe(403);
  expect(getGame(game.id, { dbPath })).not.toBeNull();

  const res = await app.handle(new Request(`http://localhost/api/games/${game.id}`, {
    method: "DELETE",
    headers: { cookie: adminCookie },
  }));
  expect(res.status).toBe(204);
  expect(getGame(game.id, { dbPath })).toBeNull();
  expect(existsSync(zipPath)).toBe(true);

  const missing = await app.handle(new Request(`http://localhost/api/games/${game.id}`, {
    method: "DELETE",
    headers: { cookie: adminCookie },
  }));
  expect(missing.status).toBe(404);
});
```

Add a sibling test `admin delete of a game with no content returns 204` using `createGame` and no plugin.

- [ ] **Step 2: Run the tests to verify they fail**

Run from `packages/backend`:

`bun test src/games/__tests__/content-kinds.test.ts src/games/__tests__/delete-cascade.test.ts src/__tests__/games-http.test.ts`

Expected: the clothes test and the HTTP content test FAIL because `deleteGame` throws `GameConflictError` (`game_has_content`) before the row delete. The icon test fails the same way.

- [ ] **Step 3: Implement**

In `deleteGame`, delete `contentCountForGame` and the `refs > 0` branch. Keep the missing-row `GameNotFoundError`, the `db.delete(games)` , and `removeGameIcons`. Drop the `count` import if nothing else in the file uses it. Leave `GameConflictError` in place for slug conflicts.

- [ ] **Step 4: Run the tests to verify they pass**

Run from `packages/backend`: `bun test`

Expected: PASS, including existing author-only delete tests for cards, clothes, scenes, plugins, and softmods.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/games/service.ts packages/backend/src/games/__tests__/content-kinds.test.ts packages/backend/src/games/__tests__/delete-cascade.test.ts packages/backend/src/__tests__/games-http.test.ts
git commit -m "feat: delete a store game that still has catalog content"
```

---

### Task 3: Store delete control

**Files:**
- Modify: `packages/frontend/app/pages/store/index.vue`

**Interfaces:**
- Consumes: `DELETE /api/games/:id` via `api.api.games({ id }).delete(undefined, { fetch: { credentials: 'include' } })`, same error shape as `handleDeleteCard` in `packages/frontend/app/pages/cards/[id].vue`. `isAdmin`, `refresh` from the store page.
- Produces: no new export. Admin sees Delete beside Edit. Confirm is required before the request.

- [ ] **Step 1: Add the control**

There is no component-test runner for pages. This step is the implementation; Step 2 is the check.

On the store page, next to the admin Edit button (`v-if="isAdmin"`):

- A `UButton` labeled `Delete`, `color="error"`, `variant="outline"`, icon `i-lucide-trash-2`, opens a `UModal`.
- Modal title `Delete game`. Body: `This removes {title} from the store, including its cards, clothes, scenes, plugins, and softmods. Local installs stay.`
- Cancel closes the modal and does not call the API.
- Confirm button `Delete forever` calls the treaty delete above for that game id, then `refresh()` and closes on success.
- On failure, keep the modal open and show the server `error` string in a `UAlert` (`color="error"`). Disable both buttons while the request is in flight.
- Do not call `uninstallInstance` or any library uninstall.

- [ ] **Step 2: Check the page**

Run from `packages/frontend`: `bunx nuxi typecheck` if that script works, otherwise `bunx vue-tsc --noEmit` is not the project check — the repo typecheck is `bun run typecheck` at the root and does not include the frontend. From `packages/frontend` run `bunx nuxi typecheck`.

Expected: no error in `app/pages/store/index.vue`.

Read the template once and confirm the DELETE call sits on the confirm handler, not on the button that opens the modal.

- [ ] **Step 3: Commit**

```bash
git add packages/frontend/app/pages/store/index.vue docs/superpowers/specs/2026-11-04-store-game-delete-design.md docs/superpowers/plans/2026-11-04-store-game-delete.md
git commit -m "feat: let an admin delete a game from the store"
```
