# Character CRUD + Discord OAuth + SQLite

## Intent

Authenticated users sign in with Discord, upload Koikatsu **character** cards, and manage their own cards (CRUD). Each PNG upload that updates a card creates a **new version**. Previews are generated with `Bun.Image` as optimized WebP. Persistence is SQLite via Drizzle on `bun:sqlite`.

## Why now

The gallery already shows versioned character/scene seeds read-only. User-owned character content and real auth are the next product step; scenes stay seed/read-only in this slice.

## Goals

- Discord OAuth login/register (create user on first login)
- Session via HTTP-only cookie after OAuth
- SQLite (`bun:sqlite`) + **Drizzle** schema/migrations
- Character card CRUD: create (upload), read (list/detail), update (metadata + optional new PNG → new version), delete (author only)
- On each stored PNG version: keep original bytes on disk; extract card image via kkloader; write WebP preview with `Bun.Image`
- **Content hashing:** SHA-256 over the **entire uploaded original file** (not the WebP preview). Store on each version; enforce global uniqueness so the same file cannot be added again (create or new version). Lookup by hash for clients.
- Gallery `/` lists **DB characters** (user content); seed fixture gallery for characters is replaced or gated off for this slice
- `/scenes` unchanged (fixtures)

## Non-goals

- Scene upload/CRUD
- Coordinate/clothes cards
- Admin roles / moderation queue
- Email/password auth
- Full Tauri deep-link OAuth (web SPA + localhost Discord redirect first; Tauri follow-up)
- CDN / S3

## Anti-goals

- Any logged-in user mutating another’s cards
- Overwriting a PNG in place without a new version number
- Storing large PNG blobs only inside SQLite (metadata in DB, files on disk)
- Deduping by preview/WebP or perceptual image hash — only full-file hash of the original upload

## Constraints

- Bun + Elysia backend; Nuxt frontend; Eden client
- `bun:sqlite` only (no better-sqlite3)
- Discord app: `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_REDIRECT_URI`, plus `SESSION_SECRET` / cookie settings in `.env` (Bun loads `.env`)
- Author-only mutate; public read of published character cards (same as current public gallery)
- Upload must parse as Koikatsu character via existing `KoikatuCharaData.load` or reject

## Approaches

| | Summary | Tradeoff |
| --- | --- | --- |
| A | Hand-rolled SQL + OAuth | Max control; more boilerplate |
| **B (chosen)** | Drizzle + Arctic Discord + session cookies | Faster schema/migrations; small auth stack on Bun |
| C | Dual seed + DB galleries | Avoids migration of seed; two list sources |

Chose **B**.

## Auth

- Library: **Arctic** `Discord` provider; scopes `identify` (avatar/username enough)
- Flow: `GET /api/auth/discord` → redirect; `GET /api/auth/discord/callback` → upsert user by `discord_id`, create session, set cookie, redirect to frontend
- `POST /api/auth/logout` clears session
- `GET /api/auth/me` returns current user or 401
- Sessions table: id, user_id, expires_at; cookie name e.g. `echbox_session`, `httpOnly`, `sameSite=lax`, `secure` in production
- Elysia plugin/derive attaches `user` from cookie for protected routes

## Data model (Drizzle)

**users:** `id` (text pk), `discord_id` (unique), `username`, `avatar` (nullable url/hash), `created_at`

**sessions:** `id` (text pk), `user_id` → users, `expires_at`

**character_cards:** `id` (text pk), `author_id` → users, `slug`, `title`, `latest_version` (int), `created_at`, `updated_at`

**character_card_versions:** `id` (text pk), `card_id` → character_cards, `version` (int, unique per card), `notes` (nullable), `content_hash` (text, **unique globally** — SHA-256 hex of full original file bytes), `original_path`, `preview_path`, `summary_json` (text), `created_at`

Indexes: `(card_id, version)`, `author_id`, `discord_id`, unique `content_hash`.

## File layout

- `packages/backend/data/sqlite.db` (gitignored)
- `packages/backend/data/cards/{cardId}/v{n}/original.png`
- `packages/backend/data/cards/{cardId}/v{n}/preview.webp`

## Image + hash pipeline (per version)

1. Accept multipart upload (character PNG)  
2. `content_hash = sha256(fileBytes)` (entire file)  
3. If `content_hash` already exists → **409 Conflict** with existing `card_id` / `version` (do not write files)  
4. `KoikatuCharaData.load(bytes)` — fail 400 if not a character card  
5. Prefer `kc.image ?? kc.faceImage` as preview source bytes  
6. `Bun.Image.from(...)` → resize (max edge e.g. 512, keep aspect) → encode WebP (quality ~80) → write `preview.webp`  
7. Write `original.png` (raw upload unchanged)  
8. Persist version row including `content_hash`; bump `latest_version`

## API (characters)

Public:

- `GET /api/kk/cards?type=character` — list from DB (latest version summary + preview URL)
- `GET /api/kk/cards/:id` — detail + versions
- `GET /api/kk/cards/:id/versions/:version/image` — serve **preview.webp** (or query `?original=1` for PNG, author-only optional later)
- `GET /api/kk/cards/by-hash/:hash` — lookup by SHA-256 hex of original file; 404 if none; returns card id + version that owns the hash (for pre-upload / duplicate checks)

Auth required:

- `POST /api/kk/cards` — create card + v1 (file required)
- `POST /api/kk/cards/:id/versions` — new version (file required); author only
- `PATCH /api/kk/cards/:id` — title/slug/notes on card (no new version); author only  
- `DELETE /api/kk/cards/:id` — delete card, versions, files; author only

Scene fixture routes stay as today under gallery service for `type=scene` only. Character list path switches to DB.

## Frontend

- Login button → Discord; show avatar/username when `me` ok; logout  
- `/` character gallery from DB; upload CTA when logged in  
- Detail: version switcher uses preview URLs; author sees Edit / New version / Delete  
- `/scenes` unchanged  

## What’s left to the builder

- Exact Drizzle column types / id generation (ULID vs UUID)  
- WebP quality and max dimension knobs  
- Whether seed characters are one-time imported into DB or dropped from `/`  
- Cookie domain for local Nuxt↔API ports  

## My calls (override if wrong)

1. Metadata (title) editable via PATCH without new version; PNG always new version  
2. Soft-delete not required — hard delete  
3. Previews public; originals not exposed on public image URL by default  
4. Arctic + hand-rolled sessions table (not full Lucia v2 stack)  
5. Character seed fixtures leave `/` once DB gallery works (empty until users upload, unless import script added)  
6. Duplicate original file is rejected globally (even if the same author re-uploads the identical bytes as a “new version”)  
7. Hash algorithm: SHA-256, lowercase hex, 64 chars  
