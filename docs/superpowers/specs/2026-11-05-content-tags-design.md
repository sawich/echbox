# Content tags, nameless galleries, softmod previews

## Intent

Catalog discovery should work like Danbooru: users filter by **tags**, not by human titles. Character cards, scenes, clothes, and softmods become image/description-led entries identified by id; the Discord user who uploaded them is the **uploader**. Original creative credit lives in **Author** tags. Plugins stay a title-based download catalog and are **out of the tag system**.

## Goals

- Shared tag vocabulary with categories **Author**, **License**, **Character**, **Franchise**, **General**
- Tag names: lowercase, no spaces (underscores); aliases resolve to a canonical tag
- Hybrid creation: uploaders/admins may create **General** tags when attaching; only admins create/manage **Author / License / Character / Franchise**, aliases, category changes, and tag deletion
- Tag like/dislike votes; a dedicated tags page so users rate tags and admins can **delete** low-rated ones
- Attach/detach tags on content: **uploader of that item** or **admin**
- Catalog filter: selected tags are an **AND** intersection (Danbooru-style); search input becomes tag chips with autocomplete; debounce before applying filters; Enter on empty input applies immediately
- Remove **titles** (and user-facing names) entirely from cards, scenes, clothes, softmods
- Rename content `authorId` → **uploaderId** (API + DB) for all content kinds including plugins; UI copy says Uploader
- Softmods: drop `title` and `modAuthor`; keep/edit **description**; add up to **3** preview images (max **1280×720**, convert to **webp quality 40**)
- Cards, scenes, clothes: add top-level **description**; keep version **notes**
- Plugins: **no tags**; keep **title** + title search as today

## Non-goals

- Tag implications / inherited tags / pools / wiki bodies (beyond name, category, aliases, votes)
- Negative/exclude tags (`-tag`) in v1
- Free-text title/slug search on tagged content kinds
- Community tagging by arbitrary logged-in users
- Separate “moderator” role (admins via `ADMIN_DISCORD_IDS` are moderators)
- Tagging plugins or games
- Changing vote UX on content items themselves

## Anti-goals

- Reintroducing display titles on gallery tiles or detail headers for tagged kinds
- Treating the uploader user as an Author tag automatically
- Auto-creating Author/License/Character/Franchise tags from package metadata without an admin
- Leaving softmod `modAuthor` / content `title` as parallel identity beside tags

## Constraints

- Bun + Elysia + Drizzle/SQLite + Nuxt — existing stack
- Reuse content vote patterns for tag votes (like/dislike, one vote per user per tag)
- Reuse/extend `writeWebpPreview` patterns (`WEBP_QUALITY = 40`); softmod previews use max edge fitting inside **1280×720** (not the card 512 cap)
- `ContentKind` already includes `cards | clothes | scenes | plugins | softmods`; taggable kinds = all except `plugins`
- Polymorphic taggings validated in service layer (no cross-table FK), same honesty as content blobs
- Existing catalog debounce (~250ms) is the default timing unless UX clearly needs otherwise

## Approaches

| | Summary | Tradeoff |
| --- | --- | --- |
| A | Shared `tags` + `tag_aliases` + `tag_votes` + polymorphic `content_tags(kind, content_id)` | One ratings page and one filter path; integrity enforced in services |
| B | Shared tags + per-kind join tables (`card_tags`, …) | Strict FKs; duplicated list/filter plumbing ×4 |
| C | Tag id arrays / JSON on each entity | Breaks aliases, ratings page, and admin delete cascade |

**Chosen: A** (partner selected).

## Tag model

### `tags`

- `id` (text pk)
- `name` (text, unique, canonical: `[a-z0-9_]+`, lowercase, underscores)
- `category` (`author` | `license` | `character` | `franchise` | `general`)
- `created_by_user_id` (nullable → users)
- `created_at`, `updated_at`

### `tag_aliases`

- `id`, `alias` (unique, same name rules), `tag_id` → tags (cascade delete), `created_at`
- Resolve search/attach by alias → canonical tag

### `tag_votes`

- Same shape as content votes: unique `(tag_id, user_id)`, `vote` `like` | `dislike`
- Net score for sorting the tags page and for admins scanning junk

### `content_tags`

- `id`
- `tag_id` → tags (cascade delete)
- `content_kind` (`cards` | `clothes` | `scenes` | `softmods`)
- `content_id` (text)
- `created_by_user_id` → users
- `created_at`
- Unique `(content_kind, content_id, tag_id)`
- Index `(tag_id)`, `(content_kind, content_id)`

Deleting a tag deletes aliases, votes, and all content attachments.

## Permissions (builder implements against `isAdmin`)

| Action | Who |
| --- | --- |
| Attach/detach existing tags on an item | Item uploader or admin |
| Create **general** tag (on attach if missing) | Item uploader or admin |
| Create/update category for **author/license/character/franchise**, manage aliases | Admin only |
| Change a tag’s category | Admin only |
| Vote on a tag | Any logged-in user |
| Delete a tag | Admin only |

## Search & catalog UI

- Replace free-text `q` filtering on tagged catalogs with tag chips driven by a suggest API (prefix match on name/alias, exclude already-selected, prefer higher-use or higher-score tags — exact ranking left to builder)
- Typing may use spaces; committing a chip (Enter or picking a suggestion) normalizes to underscore form and resolves alias → canonical
- Chips sit beside/near the input and drive the list filter
- Debounce applying the tag filter while the user is still typing an unfinished token; **Enter on empty input** flushes/applies immediately
- List APIs for tagged kinds accept repeated/canonical tag names or ids (builder picks encoding); result = items that have **all** selected tags
- Sort: drop **title** sort for tagged kinds; keep `recent` / `top`
- Plugins: unchanged `CatalogToolbar` title `q` search; no tag UI

## Content model changes

### Shared (cards, scenes, clothes, softmods)

- Remove `title` from DB/API/UI (upload forms, tiles, detail headers, profile lists, install task labels use id/short fallback — builder chooses non-title label e.g. id prefix or primary tag)
- Add `description` text (nullable or empty-string; softmods already have it — keep as the editable description; manifest may still seed initial description on create)
- Rename `author_id` → `uploader_id` everywhere for these tables and for **plugins** (API field `uploaderId`; nested `uploader: { id, username }` stays)
- Remove user-facing **slug** from cards/scenes/clothes (column dropped or no longer collected/shown — builder may keep a private opaque slug only if something internal still requires it; product must not show or search it)
- Gallery tiles (`MediaTile` and softmod presentation): no name/title overlay; votes/semver/kind chrome may remain
- Softmod list moves toward preview-led tiles once images exist (not title rows)

### Softmods specifically

- Drop `title`, drop `modAuthor`
- Manifest `name` / `author` are not stored as titles; do **not** auto-create restricted-category tags from them. Builder may show manifest author as a one-time upload hint to help the uploader search existing Author tags
- `description`: editable by uploader/admin (PATCH), not locked to manifest forever
- Previews: up to 3 images per softmod (not per version); upload/replace/reorder/delete by uploader/admin; store webp derivatives; reject/resize to fit within 1280×720; quality 40
- List/detail responses expose preview URLs (ordered)

### Cards / scenes / clothes

- `description` on the parent row; editable by uploader/admin
- Version `notes` unchanged

### Plugins

- Keep `title`, `description`, title search, `ModRow` naming
- Rename uploader column only; **no** tags, **no** previews requirement in this design

## APIs (shape left flexible; behaviors required)

- Tag suggest / list / get
- Admin: create restricted tags, aliases, category patch, delete tag
- Auth: set tag vote; tags browse page data including scores + `myVote`
- Content: get/set tag list on an item (uploader/admin)
- List endpoints for taggable kinds: filter by tag AND set; stop using title/slug `q`
- Softmod preview upload/delete endpoints; softmod metadata PATCH for description (+ tags)

## Frontend surfaces

- Shared tag input (chips + suggest + debounce rules) on taggable catalog toolbars
- Tag editor on create/edit/detail for uploaders/admins
- `/tags` (or equivalent) page: browse/search tags, see scores, like/dislike; admin delete control
- Strip titles from tiles and detail chrome for taggable kinds; show description
- Softmod upload/detail: description field + up to 3 preview slots
- Plugins catalog unchanged aside from uploader naming if copy mentions “author”

## Migration notes

- Existing rows: `title`/`slug`/`mod_author` data discarded or one-time exported — product does not keep them; descriptions default empty except softmods that already have description
- `author_id` columns renamed to `uploader_id`
- No automatic tag backfill from old titles

## Left to the builder

- Exact HTTP paths, query encoding for multi-tag filter, suggest ranking
- Whether slug columns are dropped in the same migration or deprecated first
- Softmod preview file layout under `data/`
- Precise empty-state / install-task labeling without titles
- Debounce milliseconds if different from current 250ms
- Optional manifest-author hint UI on softmod upload

## Calls made (not re-opened with partner)

- Moderators = existing `isAdmin` / `ADMIN_DISCORD_IDS`
- Approach A polymorphic `content_tags`
- Plugins excluded from tags
- Tag delete = hard delete with cascades
- Tag votes = like/dislike
- Restricted categories admin-only to create; General creatable on attach by uploader/admin
- Uploader rename includes plugins’ `author_id` for consistency
- No `-tag` exclusions in v1
- Softmod previews are per softmod (gallery), not per version
