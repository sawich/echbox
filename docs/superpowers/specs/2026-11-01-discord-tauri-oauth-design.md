# Discord OAuth via system browser (Tauri only)

**Date:** 2026-11-01  
**Status:** approved

## Intent

Login with Discord must open the OS default browser, complete OAuth there, then return focus and session into the Tauri app. There is no separate web product; the Nuxt UI only runs inside Tauri.

## Goals

- Open Discord authorize URL in the system browser from the Tauri app
- After Discord approval, bring the user back into the app
- Establish the existing `echbox_session` cookie inside the Tauri webview so `/api/auth/me` and CRUD keep working unchanged
- Keep Discord’s registered redirect URI on the backend (`…/api/auth/discord/callback`)

## Non-goals

- Browser / hosted web login UX
- Changing Discord scopes beyond `identify`
- Reworking session storage (still HTTP-only cookie sessions)
- Mobile deep-link edge cases beyond what Tauri deep-link gives us for free

## Anti-goals

- Leaving the session cookie only in the system browser (app stays logged out)
- Putting long-lived session secrets in the deep-link URL without a one-time claim step
- Embedding Discord login inside the Tauri webview

## Constraints

- Stack: Tauri 2 + Nuxt (SSR off) + Elysia backend + Arctic Discord + cookie sessions
- Frontend talks to API with `credentials: 'include'`
- OAuth state/PKCE must still be validated on callback
- Deep link scheme must be registered with the OS via Tauri

## Approaches considered

1. **Deep link `echbox://` + one-time claim token** (chosen)  
   System browser → Discord → backend callback → `echbox://auth/callback?token=…` → app claims session → Set-Cookie in webview.  
   Tradeoff: needs deep-link + opener plugins; clean handoff and keeps current backend redirect URI.

2. **Loopback `127.0.0.1` callback**  
   Discord (or backend) hits a local port owned by the app.  
   Tradeoff: fights the existing backend OAuth; port conflicts; Discord URI churn.

3. **Polling after browser login**  
   Browser shows “return to app”; app polls by `state`.  
   Tradeoff: weaker UX, more timing/cleanup surface.

**Choice:** (1), per product decision 2026-11-01.

## Flow

1. User clicks Login in the app.
2. App `GET /api/auth/discord?desktop=1` (or equivalent). Backend returns JSON `{ url }` (not a browser redirect), stores `state` + PKCE verifier **server-side** (short TTL), and marks the login as desktop.
3. App opens `url` with the system opener (`tauri-plugin-opener`).
4. User finishes Discord in the system browser.
5. Discord hits `GET /api/auth/discord/callback` with `code` + `state`.
6. Backend validates state against server store, exchanges code, upserts user, creates session, creates a **one-time claim token** bound to that session (short TTL, single use), clears OAuth pending state.
7. For desktop logins, redirect `Location: echbox://auth/callback?token=<claim>` (success HTML fallback optional: “You can close this tab”).
8. Tauri deep-link plugin delivers the URL to the frontend.
9. Frontend `POST /api/auth/claim` with `{ token }` and `credentials: 'include'`. Backend validates/consumes token, responds with `Set-Cookie: echbox_session=…`.
10. Frontend refreshes `/api/auth/me`, focuses the main window.

Cookie-based OAuth start (`GET /api/auth/discord` → 302 + state cookies) may remain for tests/dev convenience, but the **product path is desktop JSON + server-side state + claim**.

## Tauri surface

- Register custom protocol `echbox` (deep link)
- Plugins: `tauri-plugin-deep-link`, `tauri-plugin-opener`
- Capabilities: open URLs; receive deep-link events
- On deep link while running: handle in-process; cold start: read startup URL if provided by the plugin

## Backend surface

- Server-side pending OAuth map/table: `state` → `{ codeVerifier, desktop, expiresAt }`
- One-time claims: `token` → `{ sessionId, expiresAt, used }` (memory or SQLite; builder picks durable-enough default — SQLite preferred if process restarts mid-login matter in prod)
- `POST /api/auth/claim` — body `{ token }`, sets session cookie, 400/401 on invalid/expired/used
- Desktop callback redirect target: `echbox://auth/callback?token=…` (scheme configurable via env if useful; default `echbox`)

## Frontend surface

- `useAuth().login()` detects Tauri, calls desktop start endpoint, opens system browser; never navigates the webview to Discord
- Deep-link listener claims token then `refresh()`
- Logout unchanged

## Builder latitude

- Exact route shape (`?desktop=1` vs `/api/auth/discord/desktop`)
- In-memory vs SQLite for pending OAuth + claims (prefer SQLite if cheap)
- Whether callback also returns a tiny “success, return to echbox” HTML body when redirecting to the custom scheme
- Env names for scheme / claim TTL

## Out of scope for this change

- Shipping Discord Developer Portal screenshots/docs beyond noting redirect URI stays on the backend
- Changing CORS beyond what claim + credentials already need
