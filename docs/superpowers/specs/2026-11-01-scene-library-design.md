# Scene library (upload + votes)

## Intent

Scenes today are **read-only fixtures** on `/scenes`. Characters already have Discord-auth upload, versions, hash dedupe, WebP previews, and like/dislike. Users need the **same library behavior for Studio scene PNGs**, without merging scenes into the character tables.

## Goals

- Separate DB stack: `scenes` / `scene_versions` / `scene_votes` (Approach A)
- Public browse + vote counts on `/scenes`; auth upload / new version / patch / delete (author-only)
- Like/dislike votes identical UX to character cards
- Parse uploads with `KoikatuSceneData`; preview from scene image → WebP (max edge 512, q≈80)
- SHA-256 of entire original PNG; unique among scene versions → 409 with existing id/version
- Create vs version contract like characters (no auto-version on create collision)
- One-shot **import** of current seed fixtures into DB under system user **`echbox`**; then remove fixture-backed scene gallery from list/detail paths
- User profiles include the user’s scenes; profile stats sum likes/uploads across cards + plugins + softmods + **scenes**
- Detail route: `/scenes/:id` (or keep shared detail component under a scene-specific path — builder picks; **not** fixture `gallery.getCard`)

## Non-goals

- Merging scenes into `character_cards` / unified `type` column
- Changing character card behavior
- Soft-delete; admin moderation queue
- Importing character fixtures (already DB)

## Anti-goals

- Leaving seed fixture scenes as a parallel public catalog after import
- Allowing scene votes to write into `card_votes` / character FKs
- Accepting character cards on the scene upload endpoint (wrong kkloader path)

## Constraints

- Bun + Elysia + Drizzle/SQLite + Nuxt; reuse `sha256Hex`, `writeWebpPreview`, Discord session auth
- Scene aspect remains landscape (`320/180`) in gallery tiles
- Editorial UI kit; upload CTA on `/scenes` when logged in (mirror characters)
- System user `echbox`: stable `id`, unique synthetic `discord_id` (e.g. `system:echbox`), username `echbox`, no real OAuth

## Approaches

| | Summary | Tradeoff |
| --- | --- | --- |
| A | Separate scene tables + `/api/scenes` mirroring characters | Clear; some duplication with cards |
| B | Shared card engine + kinds | Less copy; large character refactor now |
| C | Scene tables under `/api/kk` beside characters | Couples fixture-era router to new DB |

**Chosen: A** (partner selected).

## Data model

**scenes:** `id` (text pk, UUID), `author_id` → users, `slug`, `title`, `latest_version`, `created_at`, `updated_at`

**scene_versions:** `id`, `scene_id`, `version` (unique per scene), `notes`, `content_hash` (**unique**), `original_path`, `preview_path`, `summary_json`, `created_at`

**scene_votes:** like `card_votes` with `scene_id`

## File layout

- `packages/backend/data/scenes/{sceneId}/v{n}/original.png`
- `packages/backend/data/scenes/{sceneId}/v{n}/preview.webp`

## Upload pipeline

1. Auth multipart PNG  
2. Hash; duplicate → 409  
3. `KoikatuSceneData.load(bytes)` → 400 if not a scene  
4. Preview from `scene.image` (fallback policy = builder; prefer primary scene image)  
5. Write original + WebP; insert version; bump `latest_version`

Path containment / staging patterns from softmod hardening: prefer write-then-commit safely (builder may reuse staging+txn style used for mods, or match current character card order if characters remain as-is — **prefer matching hardened staging if cheap**, else mirror characters for this slice).

## API

Prefix: `/api/scenes` (register `by-hash` before `:id`).

Public: list, get, image, by-hash  
Auth: create, versions, PATCH title/slug, vote, DELETE  

Stop serving scenes from `gallery.listCards("scene")` / seed once import exists. Character routes under `/api/kk/cards` unchanged (character-only).

## Import

- CLI or migrate hook: ensure user `echbox`, for each seed scene fixture call create pipeline (or insert rows + copy files) **idempotent** (skip if content_hash already present)
- Preserve titles/slugs from `seed.json` where possible
- After successful import path is documented, fixture scene list is unused in production API

## Frontend

- `/scenes` gallery from `/api/scenes` with upload + votes (enable upload for `type` scene / dedicated page component)
- Detail with versions, votes, author actions
- Profile: scenes section + stats include scenes
- Nav unchanged (Scenes already exists)

## What’s left to the builder

- Exact detail URL (`/scenes/:id` vs reuse `/cards/:id` with scene API) — prefer `/scenes/:id`
- Whether to delete or keep `gallery/seed.json` scene entries after import (keep fixtures for tests)
- Idempotent import script location (`bun run` script under backend)
- Whether character upload path gains any shared helper extraction (YAGNI unless duplication hurts)

## My calls (override if wrong)

1. System author username `echbox`, `discord_id = system:echbox`, fixed UUID documented in import script  
2. Detail at `/scenes/:id`  
3. Votes table separate (`scene_votes`)  
4. Hard delete; public previews; originals via same image query pattern as characters  
5. Profile stats: single totals summing all content kinds including scenes  
6. Seed fixture files remain on disk for kkloader/tests; public gallery no longer reads them for list  
