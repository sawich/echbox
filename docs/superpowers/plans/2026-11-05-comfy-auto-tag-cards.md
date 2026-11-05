# ComfyUI card auto-tag backfill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One-shot Bun CLI that tags existing character cards via local ComfyUI Booru Tagger and writes `general` tags into `content_tags`.

**Architecture:** Pure helpers (parse tags, patch workflow, extract history text) unit-tested without Comfy; a thin Comfy HTTP client; a CLI that lists cards from SQLite, skips already-tagged ones, calls Comfy, then `ensureGeneralTag` + `setContentTags` with the echbox system user as admin actor.

**Tech Stack:** Bun, existing Drizzle tag/card services, ComfyUI HTTP API (`/upload/image`, `/prompt`, `/history/{id}`), workflow `comfyui-workflow.json`

**Spec:** `docs/superpowers/specs/2026-11-05-comfy-auto-tag-cards-design.md`

## Global Constraints

- Cards only; latest version `preview.webp` only.
- Missing tags → `ensureGeneralTag` then `setContentTags` (no HTTP); actor `{ userId: ensureEchboxUser().id, isAdmin: true }`.
- Default skip cards with any existing `content_tags`; `--force` replaces.
- Comfy base URL default `http://127.0.0.1:8188`; workflow from repo `comfyui-workflow.json`.
- Concurrency 1; `--dry-run` prints planned tags without DB writes or with Comfy still run (prefer: still call Comfy, skip DB write).
- Flags: `--dry-run`, `--limit N`, `--force`, `--comfy-url`, `--workflow`, `--user-id` (optional override of system user id for `created_by`).

## Review Focus

- Empty / missing preview file → card counted failed, others continue.
- Comfy history without usable text → failed, no partial `setContentTags`.
- Re-run without `--force` → already-tagged cards skipped (0 Comfy calls for them).
- Tag string `"1girl, blue_hair, long_hair,"` → three canonical names, no empty.
- `setContentTags` unknown name never happens because every name was `ensureGeneralTag`'d first.

## File Structure

| Path | Role |
| --- | --- |
| `packages/backend/src/cards/auto-tag.ts` | Pure helpers + Comfy client + `autoTagCards` orchestration |
| `packages/backend/src/cards/__tests__/auto-tag.test.ts` | Unit tests for parse / prompt / history extract / skip logic (mock Comfy) |
| `packages/backend/src/cards/auto-tag-cli.ts` | CLI entry (argv + env), mirrors `scenes/import-seed-cli.ts` |
| `packages/backend/package.json` | Script `cards:auto-tag` |
| `comfyui-workflow.json` | Unchanged template read by CLI |

---

### Task 1: Pure helpers — parse tags, patch workflow, extract history

**Files:**
- Create: `packages/backend/src/cards/auto-tag.ts`
- Create: `packages/backend/src/cards/__tests__/auto-tag.test.ts`

**Interfaces:**
- Produces:
  - `parseBooruTagString(raw: string): string[]` — split on `,`, trim, drop empties, lowercase already expected; do not invent underscores (workflow has `replace_underscore: true`)
  - `buildTaggerWorkflow(template: Record<string, unknown>, imageName: string): Record<string, unknown>` — deep-clone; set node `"2".inputs.image` to `imageName`
  - `extractTagStringFromHistory(entry: { outputs?: Record<string, { text?: string[]; ui?: { text?: string[] } }> }): string | null` — prefer Booru Tagger node `"8"` text; else first PreviewAny among `"13"|"14"|"15"|"16"` with non-empty text; join array elements with `, ` if needed

- [ ] **Step 1: Write failing tests**

```ts
test("parseBooruTagString splits and drops empties", () => {
  expect(parseBooruTagString("1girl, blue_hair, long_hair,")).toEqual([
    "1girl",
    "blue_hair",
    "long_hair",
  ]);
});

test("buildTaggerWorkflow sets LoadImage filename", () => {
  const wf = buildTaggerWorkflow(
    { "2": { inputs: { image: "old.jpg" }, class_type: "LoadImage" } },
    "card.webp",
  );
  expect((wf["2"] as { inputs: { image: string } }).inputs.image).toBe("card.webp");
});

test("extractTagStringFromHistory reads node 8 text", () => {
  expect(
    extractTagStringFromHistory({
      outputs: { "8": { text: ["1girl, blue_hair"] } },
    }),
  ).toBe("1girl, blue_hair");
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `bun test src/cards/__tests__/auto-tag.test.ts` from `packages/backend`

- [ ] **Step 3: Implement the three functions in `auto-tag.ts`**

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/cards/auto-tag.ts packages/backend/src/cards/__tests__/auto-tag.test.ts
git commit -m "$(cat <<'EOF'
feat(cards): add Comfy tagger parse/workflow helpers

Pure helpers for booru tag strings and history extraction before the CLI.
EOF
)"
```

---

### Task 2: Comfy client + orchestration (skip tagged, ensure + set)

**Files:**
- Modify: `packages/backend/src/cards/auto-tag.ts`
- Modify: `packages/backend/src/cards/__tests__/auto-tag.test.ts`

**Interfaces:**
- Consumes: Task 1 helpers; `ensureEchboxUser`; `getContentTags` / `ensureGeneralTag` / `setContentTags`; `getDb` + `characterCards` / `characterCardVersions` (or `listCharacters({ unbounded: true })` if it already returns `previewPath`)
- Produces:
  - `type ComfyClient = { uploadImage(path: string): Promise<string>; runWorkflow(workflow: Record<string, unknown>): Promise<HistoryEntry> }`
  - `createComfyClient(baseUrl: string): ComfyClient` — `POST /upload/image` (multipart `image`), `POST /prompt` `{ prompt }`, poll `GET /history/{prompt_id}` until outputs present (timeout ~120s)
  - `type AutoTagResult = { tagged: number; skipped: number; failed: number; failures: { cardId: string; error: string }[] }`
  - `autoTagCards(options: { dbPath?: string; dataDir?: string; comfy: ComfyClient; workflow: Record<string, unknown>; dryRun?: boolean; limit?: number; force?: boolean; userId?: string }): Promise<AutoTagResult>`
    - Load cards with latest `previewPath`
    - Skip if `!force` and `getContentTags({ kind: "cards", contentId }).length > 0`
    - On missing preview file → fail that card
    - Upload → `buildTaggerWorkflow` → `runWorkflow` → `extractTagStringFromHistory` → `parseBooruTagString`
    - Empty tag list → fail (do not clear tags)
    - If `dryRun`, count as tagged without DB writes
    - Else for each name `ensureGeneralTag(name, actor)`; then `setContentTags({ kind: "cards", contentId, names, actor, uploaderId: card.uploaderId })` with `actor = { userId, isAdmin: true }`

- [ ] **Step 1: Failing tests with fake `ComfyClient`**

```ts
test("autoTagCards skips already-tagged cards without calling Comfy", async () => { /* seed card+tags; comfy.uploadImage throws if called; expect skipped: 1 */ });
test("autoTagCards ensure+set on untagged card", async () => { /* fake comfy returns history with tags; expect getContentTags matches */ });
test("autoTagCards dryRun does not write content_tags", async () => { /* … */ });
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement client + `autoTagCards`**

If `listCharacters` does not expose `previewPath` on list items, query versions via Drizzle in this module (do not widen the public list DTO solely for the CLI).

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/cards/auto-tag.ts packages/backend/src/cards/__tests__/auto-tag.test.ts
git commit -m "$(cat <<'EOF'
feat(cards): orchestrate Comfy auto-tag backfill

Skip tagged cards, ensure general tags, and set content tags via services.
EOF
)"
```

---

### Task 3: CLI entry + package script

**Files:**
- Create: `packages/backend/src/cards/auto-tag-cli.ts`
- Modify: `packages/backend/package.json` — add `"cards:auto-tag": "bun run src/cards/auto-tag-cli.ts"`

**Interfaces:**
- Consumes: `autoTagCards`, `createComfyClient`, `migrateDb` (if `DATABASE_PATH` set), workflow JSON from `--workflow` or `../../../comfyui-workflow.json` relative to package
- Argv: `--dry-run`, `--limit <n>`, `--force`, `--comfy-url <url>`, `--workflow <path>`, `--user-id <id>`
- Exit code `1` if `failed > 0`
- Log one summary line like seed CLI: `Auto-tag cards: N tagged, M skipped, K failed`

- [ ] **Step 1: Implement CLI** (smoke: `bun run src/cards/auto-tag-cli.ts --help` or `--limit 0` exits 0 with zeros if that is easier than a help flag — prefer printing usage on unknown flag)

- [ ] **Step 2: Manual smoke against live Comfy (when available)**

Run from `packages/backend`:

```bash
bun run cards:auto-tag -- --dry-run --limit 1
```

Expected: one Comfy run, summary `1 tagged` (dry), `0` content_tags rows added for that card.

Then without dry-run for the same card if partner wants a real write.

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/cards/auto-tag-cli.ts packages/backend/package.json
git commit -m "$(cat <<'EOF'
chore(cards): add cards:auto-tag CLI entry

Wire the Comfy backfill behind a package script for pre-prod gallery fill.
EOF
)"
```

---

## Self-review

- Spec coverage: cards-only backfill, ensure+set, skip/force, dry-run, CLI flags, system admin actor → Tasks 1–3.
- History field shape may differ by Comfy/custom node → Task 1 extract tries node `8` then PreviewAny; Task 3 smoke adjusts extract if live output differs (update test fixture to match).
- Proportion: helpers + orchestration + CLI only; no product UI.
