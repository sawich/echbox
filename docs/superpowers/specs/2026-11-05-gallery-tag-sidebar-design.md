# Gallery tag sidebar, tag create/edit modal, vote flicker fix

## Intent

On taggable gallery pages, show a right-hand sidebar of tags present on the **current page** of results; clicking a tag adds it to the active filter. Creating and fully editing tags (name, category, aliases) happens in a modal with uniqueness checks—not by typing a new name into the chip field. Fix `/tags` vote refresh flicker.

## Goals

- Right sidebar on cards / scenes / clothes / softmod catalogs listing unique tags from items on the current page (with per-page counts), grouped or ordered by category then name
- Click → append tag to current filter set (no-op if already selected); triggers the existing AND filter apply path
- List API for taggable kinds includes compact `tags: { name, category }[]` (or equivalent) on each item — **Approach A**
- Create/edit tag UI: modal with name, category (any of the five), aliases; reject duplicates against existing names/aliases
- Chip/suggest inputs **do not** create tags; unknown Enter opens create modal (or prompts to create) rather than minting `general` on attach
- `setContentTags` / attach path only resolves **existing** tags (no auto-create)
- `POST /api/tags` and full PATCH (name, category, aliases): any **logged-in** user; delete remains **admin**
- `/tags` page: two-column layout — left: tag list (vote, edit modal, admin delete); right: **alias creation** panel (pick/search target tag + new alias string, uniqueness check); create/edit modal still available for full tag edit; vote updates optimistic / without full-page skeleton flicker

## Non-goals

- Sidebar for plugins
- Negative tags / exclude from sidebar
- Changing AND filter semantics
- Tag wiki bodies

## Anti-goals

- Auto-creating tags from chip Enter or `setContentTags`
- Remounting the whole `/tags` list on every vote

## Constraints

- Existing stack and tag tables; reuse `normalizeTagName`, suggest API, CatalogToolbar tag mode
- Sidebar must not unmount TagInput on filter pending (keep prior gallery toolbar fix)
- Permission change from earlier design: restricted categories creatable/editable by any logged-in user (not admin-only)

## Approaches

| | Summary | Tradeoff |
| --- | --- | --- |
| A | Embed tags on list items; client aggregates sidebar | One request; slightly larger payload |
| B | Separate summary endpoint by ids | Extra round-trip |
| C | N+1 get-tags per item | Too chatty |

**Chosen: A.**

## Design

### Backend

- Batch-load tags for listed content ids; attach to list DTOs (shared Zod)
- Relax `createTag` / rename+category+aliases update: any authenticated user; uniqueness check on name and each alias (409 if taken by another tag)
- PATCH tag: update name (normalize), category, replace alias set; existence/uniqueness errors → 400/409
- `setContentTags`: resolve names/aliases only; missing → 400, do not insert

### Frontend

- `GalleryTagSidebar`: props `tags` aggregate + `selected` + `@select`
- Gallery layout: `grid` main + sticky right aside (hide/collapse on small screens as reasonable)
- Shared `TagFormModal` for create and edit (used from content tag editor and `/tags`)
- ContentTagEditor / TagInput: suggest existing only; “Create tag…” opens modal; on success attach/select new name
- `/tags`: two columns on desktop — main tag list + sticky right column for **Add alias** (target tag + alias name → `POST …/aliases`); Edit → modal for name/category/full alias set; vote: patch local `myVote`/counts then soft refresh without clearing `data` / without pending skeleton

## Calls

- Delete stays admin-only
- Aliases: quick-add column on `/tags` **and** full alias list in the edit modal
- Who can add aliases: same as create/edit — any **logged-in** user (not admin-only)
- Sidebar counts = how many items on **this page** carry the tag
