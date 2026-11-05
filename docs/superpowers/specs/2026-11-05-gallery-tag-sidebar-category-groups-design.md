# Gallery tag sidebar — group by category

## Intent

In the content gallery “On this page” sidebar, show tags in visual category sections so filters are easier to scan.

## Goals

- Group sidebar tags by `TagCategory` with section headings
- Only render categories that have at least one tag on the current page
- Keep click → append-to-filter behavior unchanged

## Non-goals

- Changes to `/tags`, TagInput chips, or suggest dropdowns
- Collapsible sections
- Changing aggregation or filter semantics

## Approaches

| | Summary | Tradeoff |
| --- | --- | --- |
| 1 | Section headings + drop per-row category label | Clear; slight extra height |
| 2 | Collapsible accordion sections | Extra click for short lists |
| 3 | Dividers only, keep per-row labels | Weaker scanability |

**Chosen: 1** (partner approved).

## Design

- Add `groupPageTagsByCategory(tags: PageTagCount[]): { category, tags }[]` using existing `CATEGORY_ORDER`; skip empty categories
- `GalleryTagSidebar` renders each group’s heading (`capitalize` category) then the tag buttons (name + count only)
- Props / `@select` API unchanged; galleries keep passing `aggregatePageTags` output

## Calls

- Scope: gallery sidebar only
- Always-expanded sections (not collapsible)
