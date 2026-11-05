# Gallery tag sidebar category groups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Group “On this page” gallery sidebar tags under category section headings.

**Architecture:** Pure util `groupPageTagsByCategory` over already-aggregated `PageTagCount[]`; `GalleryTagSidebar` renders groups. No API or gallery page changes.

**Tech Stack:** Vue 3 SFC, Bun test, existing `@echbox/shared` `TagCategory`

**Spec:** `docs/superpowers/specs/2026-11-05-gallery-tag-sidebar-category-groups-design.md`

## Global Constraints

- Gallery sidebar only — do not change `/tags`, TagInput, or suggest UIs
- Keep `@select` / selected / disabled behavior
- Category order: author → license → character → franchise → general

## Review Focus

- Empty categories omitted
- Tags within a category stay name-sorted (aggregate already sorts)
- Selected tags still disabled / highlighted
- No regression to aggregation counts

## File Structure

| File | Responsibility |
| --- | --- |
| `packages/frontend/app/utils/page-tags.ts` | Export `groupPageTagsByCategory` |
| `packages/frontend/app/utils/page-tags.test.ts` | Unit tests for grouping |
| `packages/frontend/app/components/GalleryTagSidebar.vue` | Render grouped sections |

## Task 1: `groupPageTagsByCategory` util

**Files:**
- Modify: `packages/frontend/app/utils/page-tags.ts`
- Modify: `packages/frontend/app/utils/page-tags.test.ts`

- [x] Write failing test: mixed categories → groups in CATEGORY_ORDER, empty categories omitted, tags keep relative order within group
- [x] Run `bun test packages/frontend/app/utils/page-tags.test.ts` — expect fail
- [x] Implement `groupPageTagsByCategory`
- [x] Run tests — expect pass

## Task 2: Sidebar UI sections

**Files:**
- Modify: `packages/frontend/app/components/GalleryTagSidebar.vue`

- [x] Compute groups from `props.tags` via `groupPageTagsByCategory`
- [x] Render section heading per group; list tags without inline category label
- [x] Preserve click / selected / aria behavior
