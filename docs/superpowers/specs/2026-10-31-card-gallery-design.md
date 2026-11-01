# Card gallery (seed + versioning shape)

## Intent

Browse Koikatsu character and scene cards on the frontend. Cards come from backend fixture seed data (including `ownCloud/Other` copies), parsed by kkloader. The data shape anticipates future user CRUD and versioned updates without implementing real persistence yet.

## Goals

- Gallery as the main app page (`/`)
- Separate UI kit playground page (`/uikit`) — move current demo off home
- Backend list/detail/image endpoints over fixtures + a versioned seed manifest
- Each logical card has one or more versions; gallery shows the latest by default
- Shared types for card DTOs in `@echbox/shared`
- Seed includes at least one card with multiple versions so the version UI is exercisable

## Non-goals

- Real database, auth, upload, or write CRUD
- Full card detail editor
- Coordinate/clothes cards as a first-class gallery type (fixtures stay for tests only)
- Production asset CDN / large binary storage design

## Anti-goals

- Hardcoding gallery rows only on the frontend with no API
- Overwriting a card in place with no version identity (would fight the future update model)

## Constraints

- Bun + Elysia backend; Nuxt frontend + `@echbox/uikit` (M3)
- Fixtures under `packages/backend/fixtures/` (PNG gitignored; already documented)
- Eden treaty client already typed from `backend/app`
- Tauri/SSG: frontend is SPA (`ssr: false`); gallery loads data from `apiUrl` at runtime

## Approaches

| | Summary | Tradeoff |
| --- | --- | --- |
| A | Frontend-only static JSON + public PNGs | Fast; bypasses kkloader and future API |
| **B (chosen)** | Backend serves fixtures via gallery API + seed versions | Closer to real CRUD; needs fixture files present |
| C | Generated static snapshot from fixtures | Stable UI without live parse; stale vs loader |

Chose **B**.

## Model (seed)

- **Card**: stable `id`, `type` (`character` | `scene`), `slug`, display title (from latest or seed override), `latestVersion`, `versions[]`
- **Version**: `version` (monotonic int starting at 1), `createdAt`, `fixture` path relative to `fixtures/`, optional `notes`, `summary` from kkloader at read time
- Gallery list item: card identity + latest version summary + image URL
- Multi-version demo: e.g. map two fixture character PNGs as v1/v2 of one card (seed call); remaining fixtures are single-version cards

## API (read-only)

- `GET /api/kk/cards` — list cards (latest version fields + image URL)
- `GET /api/kk/cards/:id` — card + all versions (summaries)
- `GET /api/kk/cards/:id/versions/:version/image` — PNG bytes for that version’s card image (parsed face/preview from kkloader when available, else raw fixture file)

Optional query: `?type=character|scene` on list.

No POST/PATCH/DELETE in this slice.

## Frontend

- `/` — gallery: filter by type, responsive card grid (M3 surfaces), version badge when `latestVersion > 1` or version count &gt; 1
- Card click → lightweight detail (drawer or `/cards/:id`): preview, summary, version list (switch preview by version)
- `/uikit` — existing M3 demo content moved as-is
- Minimal nav between Gallery and UI kit

## What’s left to the builder

- Exact seed manifest layout and which fixtures share an id for multi-version demo
- Grid density / empty and loading states
- Whether list embeds summary JSON or only links to detail (prefer embed latest summary on list to avoid N+1)
- Caching of parsed summaries in-process for seed (fine for fixtures)

## My calls (override if wrong)

1. Coordinates omitted from gallery for now  
2. Version numbers are integers, not semver  
3. Image endpoint serves kkloader-extracted card image when present  
4. No auth on seed API  
