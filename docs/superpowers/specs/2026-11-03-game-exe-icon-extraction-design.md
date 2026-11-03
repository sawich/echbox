# Game EXE icon extraction (Approach B)

**Date:** 2026-11-03  
**Status:** approved (implemented)

## Intent

Admins create catalog games with a required EXE icon. Extraction happens in Tauri (Rust); the server only receives the largest PNG and produces list-ready WebP sizes.

## Goals

- Required EXE drop/pick in Add game modal (desktop only)
- Tauri command returns largest embedded icon as PNG bytes
- Multipart `POST /api/games` with title (+ optional slug/description) + required `icon` image
- Persist `source.png` and `32.webp` / `64.webp` / `128.webp` / `256.webp` under `{DATA_DIR}/public/games/{uuid}/icons/`
- Store list shows icons; API exposes `iconUrls` on game records

## Non-goals

- Browser/JS PE parsing
- Uploading the EXE itself
- Replacing icons via PATCH (create-only)
- Changing local `~/.echbox` install layout

## Approaches

1. JS client extract — rejected  
2. **Tauri Rust extract + multipart create — chosen**  
3. Two-step create/upload — rejected (orphan risk)

## Builder calls

- Disk path under `DATA_DIR/public/games/...` (not Nuxt `public/`)
- Serve via `GET /api/games/:id/icons/:size`
- Crates: `pelite` + `ico` + `png`; dialog via `tauri-plugin-dialog`
