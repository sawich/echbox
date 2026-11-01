# Split character / scene galleries

## Intent

Characters (252×352) and scenes (320×180) get **separate gallery routes** with grids sized to each aspect ratio. One mixed grid with a type filter is removed.

## Goals

- `/` (or `/characters`) — character gallery only; tile aspect `252/352`
- `/scenes` — scene gallery only; tile aspect `320/180`
- Nav: Characters | Scenes | UI kit (drop single “Gallery”)
- Detail stays `/cards/:id` (works for both types)
- List API still `GET /api/kk/cards?type=character|scene` — no backend model change required

## Non-goals

- New card types, CRUD, or seed changes
- Changing PNG dimensions in fixtures

## Approaches

| | | Tradeoff |
| --- | --- | --- |
| **A (chosen)** | Separate routes + aspect-specific grids | Clear nav; each page one composition |
| B | Two sections on one page | One URL; competing proportions on scroll |

## My calls

1. Characters live at `/` (home = characters); scenes at `/scenes`
2. Shared `CardTile` takes an `aspect` prop (or `type`-derived class)
3. Remove All / Characters / Scenes filter chips from the list page
