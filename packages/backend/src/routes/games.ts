import {
  BadContentPathError,
  parseContentKindsInput,
  type GameContentKind,
} from "@echbox/shared";
import { Elysia, t } from "elysia";
import { isAdmin } from "../auth/admin";
import {
  BadGameError,
  GameServiceError,
  createGame,
  deleteGame,
  getGame,
  listGames,
  patchGame,
} from "../games/service";
import {
  parseIconSize,
  readGameIconWebp,
  writeGameIcons,
} from "../games/icons";
import { authDerive } from "./auth";

async function readUpload(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

/**
 * Parse multipart `contentKinds`. Elysia may leave a JSON string or already
 * parse it into an array. Missing on create → []; on patch → undefined (leave).
 */
function parseContentKindsField(
  raw: unknown,
  mode: "create" | "patch",
): GameContentKind[] | undefined {
  if (raw === undefined || raw === null || raw === "") {
    return mode === "create" ? [] : undefined;
  }
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new BadGameError("Invalid contentKinds JSON", "bad_content_kinds");
    }
  }
  try {
    return parseContentKindsInput(parsed);
  } catch (err) {
    const message =
      err instanceof BadContentPathError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Invalid contentKinds";
    throw new BadGameError(message, "bad_content_kinds");
  }
}

const ContentKindsField = t.Optional(
  t.Union([
    t.String(),
    t.Array(
      t.Object({
        kind: t.String(),
        relPath: t.Optional(t.Union([t.String(), t.Null()])),
      }),
    ),
  ]),
);

function handleServiceError(
  err: unknown,
  set: { status?: number | string },
) {
  if (err instanceof GameServiceError) {
    set.status = err.status;
    return {
      error: err.message,
      code: err.code,
    };
  }
  throw err;
}

export const gameRoutes = new Elysia({
  prefix: "/api/games",
  tags: ["Games"],
})
  .use(authDerive)
  .get(
    "/",
    () => {
      return { games: listGames() };
    },
    {
      detail: {
        summary: "List games",
        description:
          "Public catalog. Use `id` as `gameId` when uploading content.",
      },
    },
  )
  .get(
    "/:id/icons/:size",
    async ({ params, set }) => {
      const size = parseIconSize(params.size);
      if (!size) {
        set.status = 400;
        return { error: "Invalid icon size", code: "bad_icon_size" };
      }
      const game = getGame(params.id);
      if (!game) {
        set.status = 404;
        return { error: "Game not found", code: "game_not_found" };
      }
      const bytes = await readGameIconWebp(params.id, size);
      if (!bytes) {
        set.status = 404;
        return { error: "Icon not found", code: "icon_not_found" };
      }
      return new Response(bytes, {
        headers: {
          "content-type": "image/webp",
          "cache-control": "public, max-age=86400",
        },
      });
    },
    {
      params: t.Object({
        id: t.String({ description: "Game id" }),
        size: t.String({ description: "Icon size, e.g. `128`" }),
      }),
      detail: { summary: "Get game icon" },
    },
  )
  .get(
    "/:id",
    ({ params, set }) => {
      const game = getGame(params.id);
      if (!game) {
        set.status = 404;
        return { error: "Game not found", code: "game_not_found" };
      }
      return game;
    },
    {
      params: t.Object({ id: t.String({ description: "Game id" }) }),
      detail: {
        summary: "Get game",
        description: "Includes `contentKinds` with optional install `relPath`.",
      },
    },
  )
  .post(
    "/",
    async ({ body, user, set }) => {
      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }
      if (!isAdmin(user)) {
        set.status = 403;
        return { error: "Forbidden", code: "admin_required" };
      }
      if (!body.icon) {
        set.status = 400;
        return { error: "Icon is required", code: "icon_required" };
      }

      let iconBytes: Uint8Array;
      try {
        iconBytes = await readUpload(body.icon);
      } catch {
        set.status = 400;
        return { error: "Invalid icon upload", code: "bad_icon" };
      }

      let created;
      try {
        const contentKinds = parseContentKindsField(body.contentKinds, "create");
        created = createGame({
          title: body.title,
          slug: body.slug,
          description: body.description,
          createdByUserId: user.id,
          contentKinds,
        });
      } catch (err) {
        return handleServiceError(err, set);
      }

      try {
        await writeGameIcons(created.id, iconBytes);
      } catch (err) {
        deleteGame(created.id);
        if (err instanceof GameServiceError) {
          return handleServiceError(err, set);
        }
        set.status = 400;
        return {
          error: err instanceof Error ? err.message : "Failed to write icons",
          code: "icon_write_failed",
        };
      }

      set.status = 201;
      return created;
    },
    {
      body: t.Object({
        title: t.String(),
        slug: t.Optional(t.String()),
        description: t.Optional(t.Union([t.String(), t.Null()])),
        contentKinds: ContentKindsField,
        icon: t.File(),
      }),
      detail: { hide: true },
    },
  )
  .patch(
    "/:id",
    async ({ params, body, user, set }) => {
      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }
      if (!isAdmin(user)) {
        set.status = 403;
        return { error: "Forbidden", code: "admin_required" };
      }

      let updated;
      try {
        const contentKinds = parseContentKindsField(body.contentKinds, "patch");
        updated = patchGame({
          id: params.id,
          title: body.title,
          slug: body.slug,
          description: body.description,
          contentKinds,
        });
      } catch (err) {
        return handleServiceError(err, set);
      }

      if (body.icon) {
        try {
          const iconBytes = await readUpload(body.icon);
          await writeGameIcons(updated.id, iconBytes);
        } catch (err) {
          if (err instanceof GameServiceError) {
            return handleServiceError(err, set);
          }
          set.status = 400;
          return {
            error: err instanceof Error ? err.message : "Failed to write icons",
            code: "icon_write_failed",
          };
        }
        updated = getGame(updated.id)!;
      }

      return updated;
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        title: t.Optional(t.String()),
        slug: t.Optional(t.String()),
        description: t.Optional(t.Union([t.String(), t.Null()])),
        contentKinds: ContentKindsField,
        icon: t.Optional(t.File()),
      }),
      detail: { hide: true },
    },
  )
  .delete(
    "/:id",
    ({ params, user, set }) => {
      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }
      if (!isAdmin(user)) {
        set.status = 403;
        return { error: "Forbidden", code: "admin_required" };
      }
      try {
        deleteGame(params.id);
        set.status = 204;
        return null;
      } catch (err) {
        return handleServiceError(err, set);
      }
    },
    {
      params: t.Object({ id: t.String() }),
      detail: { hide: true },
    },
  );
