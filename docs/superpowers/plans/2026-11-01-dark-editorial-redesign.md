# Dark Dense Editorial Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Material 3 Dark Neon with a dark dense editorial design system in `@echbox/uikit` and recompose all frontend chrome around image-forward catalog layouts.

**Architecture:** Rewrite uikit tokens/base/Nuxt UI theme and rename visual primitives (`M3*` → `Ed*`, `--m3-*` → `--ed-*`). Frontend pages swap class/token usage and tighten gallery/detail/nav density. No API or behavior changes.

**Tech Stack:** Nuxt 4, `@nuxt/ui` 4, Tailwind 4 `@theme`, Google Fonts via Nuxt fonts, Bun for tests/checks

**Spec:** `docs/superpowers/specs/2026-11-01-dark-editorial-redesign-design.md`

## Global Constraints

- Dark only — no light theme / theme switcher
- Accent = muted vermillion / ink-red (not cyan, not purple)
- Fonts: display `Instrument Serif`, body `Figtree`, mono `IBM Plex Mono` (Google via Nuxt fonts)
- No neon glow rims, no multi-layer shadow stacks, no `rounded-full` pill chrome for nav/actions
- Not broadsheet parody (no hairline newspaper columns fighting the image grid)
- Product behavior unchanged (auth, upload, votes, versions, routes)
- Backend / `@echbox/shared` untouched
- Bun tooling (`bun test`, `bun check` where configured)

## Review Focus

- Leftover `--m3-*` / `m3-neon` / `M3Surface` / `M3Label` in `packages/uikit` or `packages/frontend` after migration → none remain (docs specs/plans excluded)
- Gallery still shows character portrait vs scene landscape aspects via existing `galleryAspect`
- Reduced-motion users: transitions disabled via existing `@media (prefers-reduced-motion: reduce)` in base CSS
- Primary buttons / focus rings remain visible on charcoal (vermillion contrast)
- `/uikit` no longer markets “Dark neon M3”

---

## File Structure

| Path | Responsibility |
| --- | --- |
| `packages/uikit/app/assets/css/tokens.css` | Editorial color/type/radius tokens + Nuxt UI surface maps |
| `packages/uikit/app/assets/css/base.css` | Atmosphere, type scale, elevation, motion helpers (`ed-*`) |
| `packages/uikit/app/assets/css/main.css` | Import order (unchanged structure) |
| `packages/uikit/nuxt.config.ts` | Font families |
| `packages/uikit/app/app.config.ts` | Nuxt UI theme (colors, button/card/input without neon glow) |
| `packages/uikit/app/components/ed/Surface.vue` | Elevation surface (`EdSurface`) |
| `packages/uikit/app/components/ed/Label.vue` | Eyebrow label (`EdLabel`) |
| `packages/uikit/app/components/m3/*` | Delete after migration |
| `packages/uikit/app/assets/css/tokens.contract.test.ts` | Assert required `--ed-*` vars exist in tokens.css |
| `packages/frontend/app/layouts/default.vue` | `ed-atmosphere` shell |
| `packages/frontend/app/components/AppNav.vue` | Masthead nav |
| `packages/frontend/app/components/CardTile.vue` | Dense image+caption tile |
| `packages/frontend/app/components/CardGalleryPage.vue` | Dense gallery header/grid |
| `packages/frontend/app/components/CardVoteControls.vue` | Quiet vote controls (token classes only if needed) |
| `packages/frontend/app/pages/cards/[id].vue` | Editorial detail spread |
| `packages/frontend/app/pages/u/[id].vue` | Profile under new tokens |
| `packages/frontend/app/pages/uikit.vue` | New system playground copy |
| `packages/uikit/app/layouts/default.vue` | Align atmosphere class if present |

Locked token values (Task 1 must use these exact names/values for accent + surfaces):

```css
--ed-primary: #e25a45;
--ed-on-primary: #1a0a08;
--ed-surface: #0c0b0a;
--ed-on-surface: #ece7e1;
--ed-on-surface-variant: #a39e97;
--ed-outline-variant: #2a2724;
--font-display: "Instrument Serif", ui-serif, Georgia, serif;
--font-sans: "Figtree", ui-sans-serif, system-ui, sans-serif;
--font-mono: "IBM Plex Mono", ui-monospace, monospace;
```

Nuxt UI color map keys: `primary: 'vermilion'`, `neutral: 'ink'` (define `@theme` scales `vermilion` + `ink`; secondary may map to a muted `parchment` scale for rare accents — not neon lime/pink).

---

### Task 1: Editorial tokens, fonts, base, Nuxt UI theme

**Files:**
- Modify: `packages/uikit/app/assets/css/tokens.css`
- Modify: `packages/uikit/app/assets/css/base.css`
- Modify: `packages/uikit/nuxt.config.ts`
- Modify: `packages/uikit/app/app.config.ts`
- Create: `packages/uikit/app/assets/css/tokens.contract.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: CSS custom properties `--ed-*` (roles mirroring old M3 roles: primary/on-primary/containers, surface ladder, outline, error); type utilities `.ed-display-lg`, `.ed-headline-md`, `.ed-title-md`, `.ed-body-md`, `.ed-label-md`; `.ed-atmosphere`; `.ed-elev-0`…`ed-elev-4`; Nuxt UI `--ui-*` mapped to `--ed-*`; fonts registered in `nuxt.config.ts`

- [ ] **Step 1: Write the failing contract test**

```ts
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const css = readFileSync(join(import.meta.dir, 'tokens.css'), 'utf8')

describe('editorial tokens', () => {
  for (const token of [
    '--ed-primary: #e25a45',
    '--ed-surface: #0c0b0a',
    '--ed-on-surface: #ece7e1',
    '--font-display: "Instrument Serif"',
    '--font-sans: "Figtree"',
  ]) {
    test(`defines ${token}`, () => {
      expect(css.includes(token)).toBe(true)
    })
  }

  test('does not keep neon primary seed', () => {
    expect(css.includes('--color-neon-400')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/uikit/app/assets/css/tokens.contract.test.ts`  
Expected: FAIL (missing `--ed-*` / still has neon)

- [ ] **Step 3: Rewrite tokens, base, fonts, app.config**

Replace neon/lime/pink/night `@theme` scales with `vermilion` + `ink` (+ optional `parchment`). Map all semantic roles to `--ed-*`. Rewrite `base.css` atmosphere as soft ink wash / grain (no cyan/pink/lime orbs, no neon-rim utilities). Remove `.m3-*` type/elev/atmosphere classes (or leave temporary aliases only if a later task still needs them — prefer delete and migrate in Task 2–3). Update `app.config.ts` button shadows to single subtle border/contrast, no glow. Register Instrument Serif / Figtree / IBM Plex Mono in `nuxt.config.ts`.

- [ ] **Step 4: Run contract test to verify it passes**

Run: `bun test packages/uikit/app/assets/css/tokens.contract.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/uikit/app/assets/css packages/uikit/nuxt.config.ts packages/uikit/app/app.config.ts
git commit -m "feat(uikit): replace neon M3 tokens with dark editorial system"
```

---

### Task 2: `EdSurface` / `EdLabel` + remove M3 components

**Files:**
- Create: `packages/uikit/app/components/ed/Surface.vue`
- Create: `packages/uikit/app/components/ed/Label.vue`
- Delete: `packages/uikit/app/components/m3/Surface.vue`
- Delete: `packages/uikit/app/components/m3/Label.vue`
- Modify: `packages/uikit/app/layouts/default.vue` (if it references `m3-atmosphere`)

**Interfaces:**
- Consumes: `.ed-elev-*` from Task 1
- Produces:
  - `EdSurface` props: `{ elev?: 0|1|2|3|4; as?: string }` (default `elev: 1`, `as: 'div'`) — **no `neon` prop**
  - `EdLabel` — slot wrapper with `.ed-label-md` + `--ed-on-surface-variant`

- [ ] **Step 1: Add components; delete m3; point layout at `ed-atmosphere`**

`EdSurface` applies `rounded-[var(--radius-md)]` (modest) + `ed-elev-${elev}` only.

- [ ] **Step 2: Verify no m3 component files remain**

Run: `test ! -e packages/uikit/app/components/m3/Surface.vue && test ! -e packages/uikit/app/components/m3/Label.vue`  
Expected: exit 0

- [ ] **Step 3: Commit**

```bash
git add packages/uikit/app/components packages/uikit/app/layouts
git commit -m "feat(uikit): rename M3 surfaces to Ed editorial primitives"
```

---

### Task 3: Shell + masthead + gallery density

**Files:**
- Modify: `packages/frontend/app/layouts/default.vue`
- Modify: `packages/frontend/app/components/AppNav.vue`
- Modify: `packages/frontend/app/components/CardTile.vue`
- Modify: `packages/frontend/app/components/CardGalleryPage.vue`
- Modify: `packages/frontend/app/components/CardVoteControls.vue` (only if token classes present)

**Interfaces:**
- Consumes: `EdSurface`, `EdLabel`, `--ed-*`, `.ed-*` from Tasks 1–2
- Produces: masthead nav (wordmark dominant; text links or ghost buttons without soft pill clusters); gallery grid gaps `gap-2`/`gap-3`; character grid denser (`grid-cols-2 sm:grid-cols-3 lg:grid-cols-5` or `lg:grid-cols-4` — pick denser than current); tiles image-first with caption meta, hover = border/opacity/translate without glow

- [ ] **Step 1: Migrate layout/nav/gallery/tile off `M3*` / `--m3-*` / `.m3-*`**

Exact replacements: `M3Surface`→`EdSurface`, `M3Label`→`EdLabel`, `m3-atmosphere`→`ed-atmosphere`, all `var(--m3-…)`→`var(--ed-…)`, type classes `m3-*`→`ed-*`. Remove neon hover shadow from `CardTile`. Tighten header padding (`py-6`–`py-8` not `py-10` hero air).

- [ ] **Step 2: Grep frontend components for leftovers**

Run: `rg -n 'M3Surface|M3Label|--m3-|m3-|neon-glow' packages/frontend/app/components packages/frontend/app/layouts`  
Expected: no matches

- [ ] **Step 3: Commit**

```bash
git add packages/frontend/app/layouts packages/frontend/app/components
git commit -m "feat(frontend): dense editorial masthead and gallery"
```

---

### Task 4: Card detail, profile, UI kit playground

**Files:**
- Modify: `packages/frontend/app/pages/cards/[id].vue`
- Modify: `packages/frontend/app/pages/u/[id].vue`
- Modify: `packages/frontend/app/pages/uikit.vue`

**Interfaces:**
- Consumes: Task 1–3 primitives
- Produces: detail page editorial spread (preview + meta); profile on `--ed-*`; `/uikit` demo titled for ink editorial (copy must not say “Dark neon” or “M3”)

- [ ] **Step 1: Migrate the three pages; rewrite uikit playground header/copy**

Playground title direction: “Ink catalog” / “Editorial tokens” (or equivalent); toast demo may stay but drop “Neon pulse” wording.

- [ ] **Step 2: Full leftover sweep**

Run: `rg -n 'M3Surface|M3Label|--m3-|m3-neon|Dark neon|color-neon' packages/uikit/app packages/frontend/app`  
Expected: no matches

- [ ] **Step 3: Run existing tests + contract test**

Run: `bun test packages/uikit/app/assets/css/tokens.contract.test.ts && bun test packages/frontend/app/utils/gallery.test.ts && bun test`  
Expected: PASS (root `bun test` = backend suite; still green)

- [ ] **Step 4: Commit**

```bash
git add packages/frontend/app/pages
git commit -m "feat(frontend): editorial card detail, profile, and uikit demo"
```

---

### Task 5: Motion polish + visual smoke

**Files:**
- Modify: `packages/uikit/app/assets/css/base.css` (if motion utilities needed)
- Modify: `packages/frontend/app/components/CardTile.vue` and/or `AppNav.vue` and/or `layouts/default.vue`

**Interfaces:**
- Consumes: `--ease-emphasized` (keep or rename to `--ed-ease-emphasized` in Task 1 — if renamed, use the new name here)
- Produces: exactly 2–3 intentional motions, e.g. (1) tile hover translate/border, (2) nav border/backdrop settle, (3) page main fade/slide-in on layout — all gated by existing reduced-motion media query

- [ ] **Step 1: Implement the 2–3 motions without glow**

- [ ] **Step 2: Confirm reduced-motion rule still present**

Run: `rg -n 'prefers-reduced-motion' packages/uikit/app/assets/css/base.css`  
Expected: at least one match

- [ ] **Step 3: Manual smoke in running app**

With `bun dev:frontend` or existing Tauri/backend: open `/`, `/scenes`, one `/cards/:id`, `/uikit` — verify charcoal+vermillion, dense grid, no neon glow, brand “echbox” clear in masthead.

- [ ] **Step 4: Commit**

```bash
git add packages/uikit/app/assets/css/base.css packages/frontend/app
git commit -m "feat(frontend): restrained editorial motion"
```

---

## Self-review notes

- Spec goals (uikit rewrite, all surfaces, dense editorial, motion, behavior preserved) map to Tasks 1–5
- Spec anti-goals enforced via token values, app.config (no glow), grep sweeps, uikit copy rewrite
- Rename decision locked to `Ed*` / `--ed-*` per spec “my calls”
