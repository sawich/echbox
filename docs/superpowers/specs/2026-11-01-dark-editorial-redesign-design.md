# Dark dense editorial redesign

## Intent

Replace the Material 3 “Dark Neon” look with a **dark, dense editorial** visual language. echbox is a Koikatsu character/scene card library; the redesign should feel like a serious ink-on-paper catalog of images, not a neon gaming UI. Cards (the product images) stay the hero; chrome gets quieter and denser.

## Goals

- Full redesign of `@echbox/uikit` tokens, base CSS, Nuxt UI theme overrides, fonts, and atmosphere
- Retheme all frontend surfaces that consume the kit: nav, gallery, card detail, profile, UI kit playground
- Dense editorial layout: tighter grids, stronger type hierarchy, image-forward tiles with caption-like metadata
- Keep existing product behavior (auth, upload, votes, versions, routes) — visual/structure only
- Ship intentional motion (2–3 places): e.g. nav reveal / tile hover / page enter — restrained, not glow spam

## Non-goals

- New product features, API changes, or data-model work
- Light theme or theme switcher
- Marketing/landing page rewrite (app remains library-first)
- Replacing Nuxt UI itself
- Pixel-perfect print replica or real CMS/magazine CMS features

## Anti-goals

- Keeping cyan / lime / hot-pink neon accents or neon glow rims as the brand signal
- Broadsheet newspaper parody (hairline column rules, zero radius everywhere, dense text columns that fight the image grid)
- Generic “AI dark mode”: purple accents, multi-layer shadows, pill chip clusters, emoji ornament
- Cream / terracotta / default serif-on-warm-paper editorial cliché (wrong mood and wrong value for dark ink)
- Decorative card chrome wrapping non-interactive content; surfaces exist for elevation/structure, tiles exist because they are the browse affordance

## Constraints

- Bun + Nuxt frontend; design lives in `packages/uikit`, consumed via `extends: ['@echbox/uikit']`
- SPA / Tauri (`ssr: false`); no SSR-only CSS tricks
- Existing components: `M3Surface`, `M3Label`, `m3-*` utility classes are widely used — either rename cleanly with a migration pass, or keep names as legacy aliases while visuals change (builder chooses; prefer clear rename if touch cost is already high)
- Character tiles stay portrait-oriented; scene tiles stay landscape (aspect helpers in `gallery.ts` remain)
- User frontend design rules: expressive fonts (not Inter/Roboto/Arial/system); atmospheric background (not flat); avoid glow/pill/multi-shadow defaults; brand “echbox” remains a clear masthead signal in the nav

## Approaches

| | Summary | Tradeoff |
| --- | --- | --- |
| A | Full uikit system swap + page recompose | Maximum visual change; larger single pass |
| B | Browser mock spike first, then uikit | Safer mood check; delayed production code |
| C | Page-only restyle on old neon tokens | Fast; cannot feel radical |

**Chosen: A** (partner selected).

## Visual direction (decided)

- **Mood:** dark dense editorial — ink catalog, not neon club
- **Base:** near-black / charcoal surfaces with cool or neutral undertone (not blue-neon night, not purple)
- **Accent:** one restrained accent for links, focus, primary actions — steel/ink red or muted vermillion (builder picks exact hex; not cyan, not purple)
- **Type:** distinctive display + readable body from Google Fonts via Nuxt fonts; display carries masthead and page titles; body for captions/meta. Avoid Inter/Roboto/Arial/system stacks
- **Shape:** modest radii (editorial, not bubbly); avoid `rounded-full` pills for chrome
- **Atmosphere:** subtle paper grain / soft vignette / ink wash — edge-to-edge, not a boxed hero panel. No neon multi-orb glow field
- **Density:** tighter gallery gaps; metadata as captions under images; less empty hero padding; masthead nav instead of soft “app chrome” pills where possible
- **Tiles:** image-dominant; type/version as quiet marks; hover = slight lift or opacity/border shift, not glow bloom
- **Detail page:** editorial spread — large preview + stacked meta/actions; versions as a compact list or strip, not candy badges

## Surfaces to update

1. `packages/uikit` — `tokens.css`, `base.css`, `app.config.ts`, fonts in `nuxt.config.ts`, `M3Surface` / `M3Label` (or replacements), default layout if any
2. Frontend — `AppNav`, `CardGalleryPage`, `CardTile`, `CardVoteControls`, `layouts/default`, `pages/uikit`, `pages/cards/[id]`, `pages/u/[id]`
3. Copy on `/uikit` playground rewritten to demonstrate the new system (drop “Dark neon M3” messaging)

## What’s left to the builder

- Exact font pairing and accent hex within the decided direction
- Whether to rename `m3-*` / `M3*` APIs or keep identifiers and only change visuals
- Exact gallery column counts / gap scale per breakpoint
- Which 2–3 motions to implement
- Fine layout of card detail and profile under the new rhythm

## My calls (override if wrong)

1. Accent = muted vermillion / ink-red (warm on charcoal), not cool blue
2. Prefer renaming visual primitives away from “M3/neon” when rewriting touched files so the kit matches the product language
3. No light mode in this slice
4. Functional badges (type, version) stay; decorative badge clusters go
5. Backend and shared packages untouched
