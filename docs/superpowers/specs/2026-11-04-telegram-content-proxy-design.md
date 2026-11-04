# Telegram content proxy

## Intent

Stop keeping catalog content originals on the app disk as the source of truth. The backend becomes a proxy: it packs uploads, stores them in a Telegram channel (chunked when large), and on download/install reassembles through a temp directory. Catalog deletes (including game delete) clear only the database; Telegram posts stay.

## Goals

- All content originals go through the proxy: character cards, scenes, clothes, plugins, softmods
- Before Telegram upload: pack into a zip at maximum compression
- Persist content hash (of the **original** bytes, as today) plus Telegram post/chunk references
- Files over the Bot API download limit are split into chunks; several links/refs are stored
- On download/install: fetch chunks into temp, assemble, return the **original** file to the client, then delete the temp files
- On backend startup: wipe the proxy temp directory
- Previews stay local (`preview.webp`); encode at WebP quality **40** (max edge 512, unchanged)
- Game/content row deletes do not delete Telegram content

## Non-goals

- Deleting or editing posts in the Telegram channel from the app
- Moving game icons (`public/games/.../icons`) into Telegram
- MTProto / user-client Telegram (Bot API only in this design)
- Changing local library install layout under `~/.echbox`
- A public CDN or signed URL layer in front of downloads
- Admin UI to browse or reconcile Telegram posts

## Anti-goals

- Leaving originals permanently on disk after a successful proxy upload
- Serving the outer zip to clients that today receive PNG / zip / zipmod
- Failing game delete because Telegram cleanup failed (cleanup is out of scope)
- Requiring a second upload of the same bytes when `content_hash` already has a blob

## Constraints

- Telegram Bot API: upload document ≈ 50 MB; `getFile` download ≈ 20 MB → chunk payload size must stay under the download limit (builder default: **19 MiB** per chunk)
- `TELEGRAM_BOT_TOKEN` already exists in env; channel/chat id is required (`TELEGRAM_CHANNEL_ID`)
- Version rows already have unique `content_hash`; duplicate uploads already reject
- Game delete is already DB-cascade only for content files (aligned with this design)
- Stack: Bun, Elysia, Drizzle/SQLite, `fflate` already present for zip checks

## Approaches

| | Approach | Tradeoff |
|---|---|---|
| **A (chosen)** | Content-addressed blob store keyed by `content_hash`; chunks → Telegram; versions keep hash + local preview paths | One storage path, natural dedupe, deletes stay row-only |
| B | Chunk link JSON on each `*_versions` row | Faster to bolt on; no dedupe; five parallel schemas |
| C | Write disk first, then background upload to Telegram | Soft migration; two sources of truth and race windows |

Chosen **A** in conversation.

## Behavior

### Upload (all content types)

1. Receive original bytes; compute `content_hash` (sha256 hex) as today.
2. If a blob for that hash already exists, reuse it (same duplicate rules as today when a version already owns the hash).
3. Generate local preview when the type has one (cards, scenes, clothes) via existing pipeline with **WebP quality 40**.
4. Zip the original at max compression (`fflate` level 9) with a single entry (stable name; builder picks extension from type).
5. Split the archive into ordered chunks ≤ 19 MiB.
6. Send each chunk as a document to the configured channel; record per chunk: index, size, `file_id`, `message_id`, chat id.
7. Persist blob + chunks; version row stores `content_hash` and preview path (when applicable). Do **not** keep the original on durable disk after success.
8. Staging/temp used during pack/upload is removed on success or failure.

### Download / install

Existing download endpoints keep their URLs and response shape (attachment + original content-type). Internally:

1. Resolve version → `content_hash` → blob chunks (ordered).
2. Download each chunk via Bot API into a unique temp directory under the proxy temp root.
3. Concatenate → unzip → stream/return original bytes.
4. Delete that temp directory (best-effort; startup sweep is the backstop).

### Startup

Clear the proxy temp root (create empty if missing) before serving traffic.

### Delete

- Game delete / content delete / version delete: database only (cascades as already designed).
- Telegram messages and blob rows: **not** removed when catalog rows go away.  
  **Builder call:** orphan blob rows (hash with no version referencing them) may remain; no GC in this pass. Optionally keep blob rows forever keyed by hash even after version cascade — prefer **keeping** `content_blobs` without FK cascade from versions so Telegram refs survive catalog deletes and re-uploads of the same hash can reuse them. Version tables stop depending on `original_path` for proxy-backed objects.

### Existing on-disk originals

**Builder call (phased read):** New uploads are proxy-only. If a version still has a usable local `original_path`, download may serve that file until a one-shot or lazy migrate moves it into the blob store. No requirement to migrate everything before ship; no dual-write of new uploads to disk.

### Config

- `TELEGRAM_BOT_TOKEN` — bot token
- `TELEGRAM_CHANNEL_ID` — destination chat/channel id (numeric or `@username`)
- Proxy temp root — under `DATA_DIR` (e.g. `DATA_DIR/tmp/proxy`), not system `/tmp` alone, so startup cleanup is scoped

### Schema (shape)

- `content_blobs`: `content_hash` PK, original size, archive size, chunk count, created_at
- `content_blob_chunks`: `(content_hash, chunk_index)` PK, `telegram_file_id`, `telegram_message_id`, `telegram_chat_id`, `byte_size`
- Version tables: keep `content_hash`; `original_path` becomes nullable or unused for new rows; `preview_path` unchanged where it exists

Exact column nullability and migration steps are left to the builder; behavior above is the contract.

### Post links

Store enough to rebuild a post reference (`chat_id` + `message_id`) and to download (`file_id`). Public `t.me` URL formatting is derived when needed; download path uses `file_id`.

## What’s left to the builder

- Exact Drizzle migration(s) and whether `original_path` is dropped, nullable, or left as legacy
- Zip entry naming and content-type mapping per content kind on download
- Telegram client wrapper (fetch-based Bot API), retries, and error mapping to HTTP statuses
- Lazy vs batch migrate for existing disk files
- Concurrency limits when assembling multi-chunk downloads
- Tests: fake Telegram transport; chunk boundary; startup temp wipe; preview quality 40; delete does not call Telegram delete
