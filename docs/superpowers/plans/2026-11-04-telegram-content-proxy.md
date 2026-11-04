# Telegram content proxy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Catalog content originals are stored in a Telegram channel (zipped, chunked) and served through a temp-backed proxy; previews stay local at WebP quality 40.

**Architecture:** Content-addressed `content_blobs` / `content_blob_chunks` keyed by existing `content_hash`. A shared blob store packs with `fflate` level 9, splits at 19 MiB, uploads via Bot API, and on download reassembles under `DATA_DIR/tmp/proxy` then returns original bytes. Version `original_path` becomes nullable; local path remains a read fallback for legacy rows.

**Tech Stack:** Bun, Elysia, Drizzle/SQLite, `fflate`, Telegram Bot API (`fetch`)

**Spec:** `docs/superpowers/specs/2026-11-04-telegram-content-proxy-design.md`

## Global Constraints

- All five content kinds use the proxy for originals: cards, scenes, clothes, plugins, softmods.
- Zip max compression before Telegram (`fflate` `level: 9`); single entry named `content`.
- Chunk size ≤ **19 MiB**; store `file_id`, `message_id`, `chat_id` per chunk.
- Hash is sha256 of **original** bytes (unchanged).
- Download endpoints keep URLs and return **original** bytes/content-types (not the outer zip).
- Startup wipes `DATA_DIR/tmp/proxy`.
- Catalog/game deletes do not call Telegram delete and do not CASCADE-delete blob rows.
- Previews local only; WebP **quality 40**; max edge 512 unchanged.
- Game icons stay on disk. Bot API only. No orphan GC.
- Do not run `drizzle-kit generate`; hand-write SQL + journal like prior migrations.
- New uploads must not leave durable originals on disk after a successful blob put.

## Review Focus

- Chunk boundary: archive size exactly 19 MiB → one chunk; 19 MiB+1 → two chunks; download returns original bytes.
- Telegram upload failure mid-chunks: no blob row committed; no durable original left on disk.
- Legacy row with `original_path` on disk and no blob: download still serves the file.
- Deleting a game/version leaves `content_blobs` / chunks rows and does not call Telegram delete.
- Startup removes leftover files under the proxy temp root before listen.

## File Structure

| Path | Role |
| --- | --- |
| `packages/backend/src/cards/preview.ts` | `WEBP_QUALITY = 40` |
| `packages/backend/src/db/schema.ts` | `contentBlobs`, `contentBlobChunks`; `originalPath` nullable on five version tables |
| `packages/backend/drizzle/0012_content_blobs.sql` | Create blob tables; make `original_path` nullable |
| `packages/backend/drizzle/meta/_journal.json` | Journal entry `0012` |
| `packages/backend/src/proxy/archive.ts` | `packOriginal`, `splitChunks`, `unpackOriginal` |
| `packages/backend/src/proxy/temp.ts` | `getProxyTempRoot`, `clearProxyTemp`, `withProxyTempDir` |
| `packages/backend/src/proxy/telegram.ts` | `TelegramTransport` type + `createBotApiTransport` |
| `packages/backend/src/proxy/blob-store.ts` | `putContentBlob`, `getContentBlobBytes`, `findContentBlob` |
| `packages/backend/src/proxy/__tests__/*.ts` | Unit tests with fake transport |
| `packages/backend/src/{cards,scenes,clothes,plugins,softmods}/service.ts` | Upload → blob put; download → blob get with disk fallback |
| `packages/backend/src/index.ts` | Clear proxy temp on startup |
| `packages/backend/.env.example` | `TELEGRAM_CHANNEL_ID` |

Do not invent a sixth content kind. Do not delete Telegram messages from service delete paths.

---

### Task 1: Preview WebP quality 40

**Files:**
- Modify: `packages/backend/src/cards/preview.ts`
- Test: `packages/backend/src/cards/__tests__/preview.test.ts`

**Interfaces:**
- Consumes: existing `writeWebpPreview(bytes, destPath)`
- Produces: same function; encodes with `quality: 40`

- [ ] **Step 1: Extend the preview test**

Assert the written file is WebP (existing) and that encoding uses quality 40 by exporting or reading the constant — simplest: export `WEBP_QUALITY` from `preview.ts` and `expect(WEBP_QUALITY).toBe(40)`.

- [ ] **Step 2: Run test — expect FAIL** (`WEBP_QUALITY` is 80 or missing)

Run: `bun test src/cards/__tests__/preview.test.ts` from `packages/backend`

- [ ] **Step 3: Set `WEBP_QUALITY = 40` and export it**

- [ ] **Step 4: Run test — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/cards/preview.ts packages/backend/src/cards/__tests__/preview.test.ts
git commit -m "$(cat <<'EOF'
feat(backend): lower preview WebP quality to 40

Gallery thumbnails are already small; q40 cuts size without a visible hit.
EOF
)"
```

---

### Task 2: Blob schema + nullable `original_path`

**Files:**
- Modify: `packages/backend/src/db/schema.ts`
- Create: `packages/backend/drizzle/0012_content_blobs.sql`
- Modify: `packages/backend/drizzle/meta/_journal.json`
- Test: `packages/backend/src/proxy/__tests__/schema.test.ts`

**Interfaces:**
- Consumes: `migrateDb`, `getDb`
- Produces: tables `content_blobs` (`content_hash` PK text, `original_byte_size` int, `archive_byte_size` int, `chunk_count` int, `created_at` text) and `content_blob_chunks` (`content_hash` text FK → blobs **without** cascade-from-versions, `chunk_index` int, `byte_size` int, `telegram_file_id` text, `telegram_message_id` text, `telegram_chat_id` text; PK `(content_hash, chunk_index)`; FK chunks→blobs `ON DELETE cascade` only). Five version tables: `original_path` nullable. No FK from versions → blobs.

- [ ] **Step 1: Failing migration test**

After `migrateDb` on a temp db: insert a blob + two chunks; insert a `character_card_versions` row with `original_path: null` and a unique `content_hash`; delete that version row; expect blob+chunks still present.

- [ ] **Step 2: Run — expect FAIL** (tables missing / NOT NULL)

Run: `bun test src/proxy/__tests__/schema.test.ts` from `packages/backend`

- [ ] **Step 3: Schema + hand-written `0012_content_blobs.sql` + journal idx 12 (`when`: 1794045000000, tag `0012_content_blobs`)

SQLite: recreate each version table to drop NOT NULL on `original_path` (same pattern as `0011`), or `ALTER` only if already nullable-capable — prefer recreate matching `0011` style for the five `*_versions` tables. Create the two new tables with `CREATE TABLE IF NOT EXISTS`.

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/db/schema.ts packages/backend/drizzle/0012_content_blobs.sql packages/backend/drizzle/meta/_journal.json packages/backend/src/proxy/__tests__/schema.test.ts
git commit -m "$(cat <<'EOF'
feat(backend): add content blob tables for Telegram proxy

Store chunked Telegram refs by content hash; allow null original_path.
EOF
)"
```

---

### Task 3: Archive + proxy temp helpers

**Files:**
- Create: `packages/backend/src/proxy/archive.ts`
- Create: `packages/backend/src/proxy/temp.ts`
- Test: `packages/backend/src/proxy/__tests__/archive.test.ts`
- Test: `packages/backend/src/proxy/__tests__/temp.test.ts`

**Interfaces:**
- Consumes: `fflate` `zipSync` / `unzipSync`; `DATA_DIR` via same resolution pattern as `cards/storage.ts` `getDataDir`
- Produces:
  - `CHUNK_SIZE_BYTES = 19 * 1024 * 1024`
  - `packOriginal(original: Uint8Array): Uint8Array` — zip one entry `"content"` at `level: 9`
  - `splitChunks(archive: Uint8Array, chunkSize = CHUNK_SIZE_BYTES): Uint8Array[]`
  - `unpackOriginal(archive: Uint8Array): Uint8Array` — read entry `"content"`
  - `getProxyTempRoot(dataDir?: string): string` → `join(getDataDir(dataDir), "tmp", "proxy")`
  - `clearProxyTemp(dataDir?: string): Promise<void>` — rm recursive + mkdir
  - `withProxyTempDir<T>(fn: (dir: string) => Promise<T>, dataDir?: string): Promise<T>` — unique subdir, always rm after

- [ ] **Step 1: Failing tests**

`packOriginal` round-trips via `unpackOriginal`. `splitChunks` on length `CHUNK_SIZE_BYTES` → 1 part; `CHUNK_SIZE_BYTES + 1` → 2 parts with correct lengths. `clearProxyTemp` deletes a planted file under the root. `withProxyTempDir` removes its dir even when `fn` throws.

- [ ] **Step 2: Run — expect FAIL**

Run: `bun test src/proxy/__tests__/archive.test.ts src/proxy/__tests__/temp.test.ts` from `packages/backend`

- [ ] **Step 3: Implement `archive.ts` and `temp.ts`**

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/proxy/archive.ts packages/backend/src/proxy/temp.ts packages/backend/src/proxy/__tests__/archive.test.ts packages/backend/src/proxy/__tests__/temp.test.ts
git commit -m "$(cat <<'EOF'
feat(backend): add proxy archive packing and temp helpers

Max-compression zip, 19MiB chunks, and scoped proxy temp cleanup.
EOF
)"
```

---

### Task 4: Telegram transport + blob store

**Files:**
- Create: `packages/backend/src/proxy/telegram.ts`
- Create: `packages/backend/src/proxy/blob-store.ts`
- Create: `packages/backend/src/proxy/errors.ts`
- Test: `packages/backend/src/proxy/__tests__/blob-store.test.ts`
- Modify: `packages/backend/.env.example` — add `TELEGRAM_CHANNEL_ID=`

**Interfaces:**
- Consumes: Task 2 tables, Task 3 helpers, `getDb`, `sha256Hex` only for callers (store trusts the hash argument)
- Produces:
  - `type TelegramTransport = { sendDocument(chatId: string, bytes: Uint8Array, filename: string): Promise<{ fileId: string; messageId: string }>; downloadFile(fileId: string): Promise<Uint8Array> }`
  - `createBotApiTransport(token: string): TelegramTransport` — `sendDocument` / `getFile` + file download via `https://api.telegram.org`
  - `putContentBlob(input: { contentHash: string; original: Uint8Array; dbPath?: string; dataDir?: string; transport: TelegramTransport; chatId: string }): Promise<void>` — no-op if blob exists; else pack→split→upload all chunks→insert blob+chunks in one transaction after all uploads succeed; on failure leave no blob row
  - `getContentBlobBytes(contentHash: string, options: { dbPath?: string; dataDir?: string; transport: TelegramTransport }): Promise<Uint8Array | null>` — null if no blob; else download chunks in order into `withProxyTempDir`, concat, unpack, return originals (temp cleaned by helper)
  - `findContentBlob(contentHash: string, dbPath?: string): { chunkCount: number } | null`
  - Env readers used by services: `getTelegramBotToken()`, `getTelegramChannelId()` from `Bun.env` / `process.env` (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHANNEL_ID`); throw a small `ProxyConfigError` if missing when putting/getting against live transport — tests always pass a fake transport

- [ ] **Step 1: Failing blob-store tests with an in-memory fake transport**

Fake maps `fileId` → bytes and assigns incremental `messageId`. Cases: put then get round-trips original; put of same hash is idempotent (transport send count unchanged on second put); archive requiring 2 chunks stores `chunk_count === 2` and get still round-trips; if `sendDocument` throws on chunk 2, `findContentBlob` is null.

- [ ] **Step 2: Run — expect FAIL**

Run: `bun test src/proxy/__tests__/blob-store.test.ts` from `packages/backend`

- [ ] **Step 3: Implement transport + blob-store + errors; update `.env.example`**

Filename for Telegram documents: `{contentHash}.{chunkIndex}.zip.part`. Chat id string is whatever `TELEGRAM_CHANNEL_ID` provides.

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/proxy packages/backend/.env.example
git commit -m "$(cat <<'EOF'
feat(backend): Telegram blob store for content proxy

Upload zipped chunks via Bot API and reassemble originals on get.
EOF
)"
```

---

### Task 5: Wire content services (upload + download)

**Files:**
- Modify: `packages/backend/src/plugins/service.ts`
- Modify: `packages/backend/src/softmods/service.ts`
- Modify: `packages/backend/src/cards/service.ts`
- Modify: `packages/backend/src/scenes/service.ts`
- Modify: `packages/backend/src/clothes/service.ts`
- Modify tests that assert `existsSync(originalPath)` for **new** uploads — they should assert blob existence / download bytes instead (keep legacy disk assertions only where the test plants a file)
- Prefer extending existing service tests rather than new HTTP suites unless a route breaks

**Interfaces:**
- Consumes: `putContentBlob`, `getContentBlobBytes`, `createBotApiTransport`, env helpers from Task 4
- Produces: create/add-version paths call `putContentBlob` after hash checks (and after preview write for image kinds); insert version with `originalPath: null`; do not `placeStagedZip` / `writeOriginalPng` as the durable store. `getPluginVersionBytes` / `getSoftmodVersionBytes` / card-scene-clothes original image getters: try `getContentBlobBytes(hash)`; if null and `originalPath` file exists, read disk (legacy); else null.

Optional `PluginServiceOptions` (and siblings) may accept `transport?: TelegramTransport` and `telegramChatId?: string` for tests; production uses bot transport + env chat id.

- [ ] **Step 1: Failing service tests (start with plugins, then mirror)**

With fake transport in options: create plugin → no file at the old path pattern (or `originalPath` null) → `getPluginVersionBytes` returns the uploaded bytes. Second test: plant only a disk file on a row with null blob → getter still returns bytes. Third: delete plugin/game content → blob row remains (`findContentBlob`).

Repeat the same three ideas for softmods; for cards/scenes/clothes assert preview still written under `previewPath` and original comes from blob get.

- [ ] **Step 2: Run the targeted failing tests**

Run: `bun test src/plugins/__tests__/service.test.ts` from `packages/backend` (then the other kind suites as you touch them)

- [ ] **Step 3: Wire each service**

Keep staging only if still useful for crash safety before Telegram upload; after successful `putContentBlob`, discard staged bytes and never rename into `original.zip`. Image kinds: `writeWebpPreview` then `putContentBlob`. Map Telegram/config errors to existing Bad* domain errors or a 503-friendly path — builder choice, but do not leak tokens.

- [ ] **Step 4: Run full backend tests affected**

Run: `bun test src/plugins src/softmods src/cards src/scenes src/clothes src/proxy src/games/__tests__/delete-cascade.test.ts` from `packages/backend`

Expected: PASS. Update `delete-cascade` only if it required non-null `originalPath` without files — disk file survival assertions stay valid for planted paths.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/plugins packages/backend/src/softmods packages/backend/src/cards packages/backend/src/scenes packages/backend/src/clothes
git commit -m "$(cat <<'EOF'
feat(backend): store content originals via Telegram proxy

Uploads go to the blob store; downloads reassemble with disk fallback.
EOF
)"
```

---

### Task 6: Startup temp wipe

**Files:**
- Modify: `packages/backend/src/index.ts`
- Test: `packages/backend/src/proxy/__tests__/temp.test.ts` (already covers `clearProxyTemp`; add a thin export test or call from an `index` smoke if one exists — prefer invoking `clearProxyTemp` from `index.ts` before `app.listen` and rely on Task 3 unit test)

**Interfaces:**
- Consumes: `clearProxyTemp()`
- Produces: process start clears proxy temp then listens

- [ ] **Step 1: Call `await clearProxyTemp()` before `app.listen` in `index.ts`**

- [ ] **Step 2: Run `bun test src/proxy/__tests__/temp.test.ts` — expect PASS**

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/index.ts
git commit -m "$(cat <<'EOF'
feat(backend): clear proxy temp directory on startup

Drops leftover assemble dirs from interrupted downloads.
EOF
)"
```

---

## Self-review notes (author)

- Spec coverage: upload zip+chunk+TG, hash+refs, download temp assemble, startup wipe, preview q40, delete DB-only, all kinds, 19 MiB, disk fallback — each mapped to a task.
- Review Focus lines pinned in Tasks 3–5 and cascade/blob schema tests.
- `original_path` null + no FK versions→blobs matches “content survives delete”.
- Lazy migrate of legacy disk files is “on read fallback” only; no batch migrator in this plan (spec builder call).
