import { openapi } from "@elysiajs/openapi";

/** Bearer API key (`ebx_…`) issued in Settings. Cookie session also works for the same routes. */
export const bearerAuthSecurity = [{ bearerAuth: [] }] as const;

/** Discord session cookie — required for managing API keys. */
export const cookieAuthSecurity = [{ cookieAuth: [] }] as const;

export const openapiPlugin = openapi({
  path: "/openapi",
  documentation: {
    info: {
      title: "echbox API",
      version: "1.0.0",
      description: [
        "Public HTTP API for listing and uploading Koikatsu content.",
        "",
        "## Authentication",
        "Mutations (upload / patch / delete / vote) accept either:",
        "- `Authorization: Bearer <api_key>` — create keys in the web UI under **Settings** (`ebx_<id>_<secret>`)",
        "- Discord session cookie (`echbox_session`) — same as the desktop / web app",
        "",
        "List and get endpoints are public (no auth required).",
        "",
        "## Titles",
        "- **Cards** — empty `title` → name from the PNG card data",
        "- **Clothes** — empty `title` → `coordinateName` from the file",
        "- **Scenes** — empty `title` → upload filename stem (no embedded name)",
        "- **Softmods** — title from zipmod manifest",
        "- **Plugins** — `title` is required",
      ].join("\n"),
    },
    tags: [
      {
        name: "Cards",
        description: "Character cards (`POST/GET /api/kk/cards`, …)",
      },
      {
        name: "Clothes",
        description: "Coordinate / outfit cards (`/api/clothes`)",
      },
      {
        name: "Scenes",
        description: "Studio scenes (`/api/scenes`)",
      },
      {
        name: "Plugins",
        description: "Plugin zip packages (`/api/plugins`)",
      },
      {
        name: "Softmods",
        description: "Softmod zipmods (`/api/softmods`)",
      },
      {
        name: "Games",
        description: "Catalog games (needed as `gameId` on uploads)",
      },
      {
        name: "API Keys",
        description: "Create and revoke personal API keys (session cookie only)",
      },
      {
        name: "System",
        description: "Health and misc",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "API key",
          description:
            "API key from Settings. Example: `Authorization: Bearer ebx_<id>_<secret>`",
        },
        cookieAuth: {
          type: "apiKey",
          in: "cookie",
          name: "echbox_session",
          description: "Discord OAuth session cookie (web / desktop app)",
        },
      },
    },
  },
});
