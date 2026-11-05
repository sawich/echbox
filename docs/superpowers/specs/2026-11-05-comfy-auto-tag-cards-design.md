# ComfyUI backfill tags for existing cards

## Intent

Bring the card gallery to a pre-production look so filters and the tag sidebar can be evaluated with real volume. Run the local ComfyUI Booru Tagger workflow once against current cards and write the results into `content_tags`.

## Goals

- Tag existing character cards from each card’s latest `preview.webp`
- Create missing names as **general** tags, then attach via `setContentTags`
- Skip cards that already have tags (idempotent re-runs)
- CLI with `--dry-run`, `--limit N`, optional `--force` (retag)

## Non-goals

- Auto-tag on upload / product UI
- Scenes, clothes, softmods
- Mapping booru tags into `character` / `franchise` / `author` / `license`
- Permanent Comfy worker or queue in the backend

## Anti-goals

- Replacing hand-curated tags on an already-tagged card (unless `--force`)
- Calling HTTP tag routes (script uses tag services in-process)

## Constraints

- Bun; reuse `ensureGeneralTag` + `setContentTags` + `ensureEchboxUser`
- ComfyUI at `http://127.0.0.1:8188` (override via `--comfy-url`)
- Workflow template: repo root `comfyui-workflow.json` (LoadImage → Load Booru Tagger `wd-eva02-large-tagger-v3` → Booru Tagger)
- Actor: `ensureEchboxUser` with `isAdmin: true` so any card’s tags can be set
- Thresholds / sort / replace_underscore as already set in the workflow JSON

## Approaches

| | Summary | Tradeoff |
| --- | --- | --- |
| A | Offline Bun CLI in backend package | Fast one-shot; no API surface |
| B | Admin HTTP + in-process queue | Reusable; overkill for pre-prod |
| C | Export CSV then import | Manual QC; slower to a live gallery |

**Chosen: A** (partner selected).

## How

1. List all cards + latest version `previewPath` from SQLite
2. For each untagged card (or all with `--force`): upload preview to Comfy → queue prompt with image name patched into node `2` → wait for history → parse tag string from Booru Tagger / PreviewAny outputs
3. Split on commas; trim; drop empties; keep underscore form (workflow already `replace_underscore: true`)
4. `ensureGeneralTag` each name, then `setContentTags({ kind: "cards", … })`
5. Log progress: tagged / skipped / failed; exit non-zero if any failed

## Builder calls

- Exact history/output field for the tag string (probe one card first if needed)
- Concurrency stays **1** unless a later change proves Comfy handles parallel uploads safely
