# Plugins & Softmods download library

## Intent

echbox today is a Koikatsu **character/scene card** library. Users also need a place to **browse and download** BepInEx-style **plugins** (zip) and Sideloader **softmods** (`.zipmod`), with logged-in users able to **upload** and **version** them the same way they do cards. Two separate nav destinations mirror Characters / Scenes.

## Goals

- Public browse + download on `/plugins` and `/softmods`
- Auth upload / new version / edit metadata / delete (author only), Discord session as today
- Softmods: accept `.zipmod`, parse Sideloader `manifest.xml`, **GUID from manifest is the record id** (never invent a softmod GUID)
- Plugins: accept `.zip`, author fills title/description/(optional notes) manually; **server generates GUID** as record id
- Versioning per record like cards (`latest_version`, version rows, author-only new version)
- Voting like cards (like / dislike per user per item)
- Content-hash dedupe of original file bytes (SHA-256), global unique → 409 with existing id/version
- Softmod create/version contract **like cards**: `POST` create only for new GUID; if GUID exists → 409 with existing id (new version only via `POST …/:id/versions`)
- User profiles (`/u/:id`) list the user’s plugins and softmods (and include them in upload / likes-received stats as cards do for characters)
- Softmod UI shows **both** identities: **Uploader** (echbox user) and **Author** (`mod_author` from manifest)
- Nav: Characters | Scenes | Plugins | Softmods (| UI kit as today)
- **No archive size cap in v1** (no artificial MB/GB limit; rely on host/process defaults until a real need appears)

## Non-goals

- Sideloader dependency resolution / install into a game directory
- Auto-update clients, KKManager sync, or remote mod-repo protocol compatibility beyond storing GUID + files
- Search, tags, categories, or game filters beyond what’s in stored metadata for display
- Plugin assembly / DLL introspection (no PE parsing for name/version)
- Merging plugins and softmods into one table or one page
- Changing the character/scene card model
- Enforcing upload size quotas in v1

## Anti-goals

- Generating a second “echbox GUID” for softmods that diverges from Sideloader `manifest` GUID
- Treating plugins as image-card tiles (no fake character-card chrome)
- Allowing a second catalog entry with the same softmod GUID under another author
- Public write without Discord auth

## Constraints

- Bun + Elysia backend, Drizzle/SQLite, Nuxt frontend — same stack as cards
- Reuse auth (`user` from session cookie) and vote UX patterns from cards
- Softmod identity = Sideloader GUID string from `manifest.xml`
- Separate DB tables and API surfaces for plugins vs softmods (Approach A)
- Editorial dark UI kit; list pages are download catalogs, not PNG galleries

## Approaches

| | Summary | Tradeoff |
| --- | --- | --- |
| A | Two independent stacks (tables, routes, pages) | Clear; more duplicated version/vote plumbing |
| B | Unified `mods` + `kind` | Less copy; blurs the “two products” split |
| C | Stretch card tables to hold zips | Wrong file/id/preview model |

**Chosen: A** (partner selected).

## Data model (Drizzle)

### Softmods

**softmods:** `id` (text pk = Sideloader GUID), `author_id` → users, `title`, `mod_author` (from manifest, nullable override later), `description` (from manifest), `website` (nullable), `latest_version` (int), `created_at`, `updated_at`

**softmod_versions:** `id` (text pk, internal), `softmod_id` → softmods, `version` (int, unique per softmod), `package_version` (text from manifest), `notes` (nullable), `content_hash` (unique globally among softmod versions), `original_path`, `summary_json`, `created_at`

**softmod_votes:** same shape as `card_votes` but `softmod_id`

### Plugins

**plugins:** `id` (text pk = generated GUID), `author_id` → users, `title`, `description` (nullable), `latest_version` (int), `created_at`, `updated_at`

**plugin_versions:** `id`, `plugin_id`, `version` (int), `notes` (nullable), `content_hash` (unique among plugin versions), `original_path`, `summary_json`, `created_at`

**plugin_votes:** like card votes with `plugin_id`

Indexes: `(softmod_id|plugin_id, version)`, `author_id`, unique `content_hash` per version table, unique softmod `id` is the GUID.

## File layout

- `packages/backend/data/softmods/{guid}/v{n}/original.zipmod`
- `packages/backend/data/plugins/{guid}/v{n}/original.zip`

No required preview image pipeline in v1 (list is metadata + download).

## Softmod upload pipeline

1. Auth multipart; file must be `.zipmod` (zip container)
2. `content_hash = sha256(bytes)`; if exists → 409 with existing softmod id + version
3. Open as zip; require `manifest.xml` (case-sensitive path as Sideloader expects — builder picks exact matching rules, prefer common Sideloader layout)
4. Parse GUID, name, version, author, description, website (and any other useful fields into `summary_json`)
5. If GUID already exists → **409** with existing softmod id (do **not** auto-append a version on create; mirror cards / `by-hash` flow). Client uses `POST …/:id/versions` for updates; that route is **author-only** (403 otherwise)
6. New softmod row uses GUID as `id`, title/description/`mod_author` from manifest; write `original.zipmod`; insert v1; set `latest_version`

## Plugin upload pipeline

1. Auth multipart; file must be `.zip` (not empty; builder may optionally require at least one entry)
2. Hash dedupe as above (plugin version table)
3. Require form fields: `title` (required), `description` (optional), `notes` (optional)
4. Generate GUID for new plugin `id` (UUID v4 or equivalent); new versions attach to existing id (author only)
5. Write `original.zip`; persist version; bump `latest_version`

## API

Prefix suggestion: `/api/mods/plugins` and `/api/mods/softmods` (or `/api/plugins` + `/api/softmods` — builder picks one consistent pair).

Public:

- `GET ...` list (latest summary + vote counts + download URL for latest)
- `GET .../:id` detail + versions
- `GET .../:id/versions/:version/download` — stream original file (`Content-Disposition` attachment)
- `GET .../by-hash/:hash` — duplicate lookup (mirror cards)

Auth:

- `POST ...` create + v1
- `POST .../:id/versions` new version (author)
- `PATCH .../:id` metadata (plugins: title/description; softmods: optional display overrides if any — default: title/description stay manifest-synced on new version, PATCH may allow notes-only or light overrides — **builder call**: prefer PATCH title/description for plugins; for softmods allow PATCH description override only or none in v1)
- `PUT/PATCH .../:id/vote` like cards
- `DELETE .../:id` author hard-delete + files + votes

## Frontend

- Nav links: Plugins, Softmods
- List pages: dense editorial **rows or compact tiles** (name, **Uploader** + softmod **Author**, package/echbox version, vote controls, download) — not character aspect grids
- Detail: metadata with both Uploader and Author, version list, download latest / per version, uploader Edit / New version / Delete
- Upload UI when logged in (file picker + fields for plugins; file-only for softmods; on softmod GUID/hash conflict surface existing id like card duplicate UX)
- Profile `/u/:id`: sections (or equivalent) for the user’s plugins and softmods alongside cards; likes-received / counts include these kinds

## What’s left to the builder

- Exact API path prefix and Zod schemas in `@echbox/shared`
- GUID generation format for plugins
- Manifest XML parser details / path casing / missing-field errors
- Whether softmod PATCH can override manifest-derived title/description in v1
- List layout density (row vs tile) within editorial kit
- Whether to show `package_version` prominently vs echbox integer version
- Migration strategy alongside existing card tables
- How profile aggregates likes across cards + plugins + softmods (one total vs per-kind)

## My calls (override if wrong)

1. Softmod primary key **is** the Sideloader GUID string; no separate surrogate id for the softmod row
2. Plugin version rows and softmod version rows keep **echbox integer** `version` like cards; softmod also stores manifest `package_version` text
3. Same author-only rules and hard delete as cards; create vs new-version split identical to cards (no auto-version on create)
4. Votes are separate tables (not reused `card_votes`) so FKs stay clean under Approach A
5. No preview/webp pipeline in v1
6. Duplicate **file bytes** rejected globally within that kind’s version table; duplicate **softmod GUID** on create → 409
7. Download is public (no auth) for original archives
8. No application-level archive size limit in v1
9. Softmod list/detail labels: **Uploader** = echbox `author_id` user; **Author** = manifest `mod_author` (may be empty string → show em dash / “Unknown”)
10. Plugins show Uploader only (no separate mod-author field unless added later)
