import { Elysia, t } from "elysia";
import { isAdmin } from "../auth/admin";
import {
  GameServiceError,
  createGame,
  deleteGame,
  getGame,
  listGames,
  patchGame,
} from "../games/service";
import { authDerive } from "./auth";

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

export const gameRoutes = new Elysia({ prefix: "/api/games" })
  .use(authDerive)
  .get("/", () => {
    return { games: listGames() };
  })
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
      params: t.Object({ id: t.String() }),
    },
  )
  .post(
    "/",
    ({ body, user, set }) => {
      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }
      if (!isAdmin(user)) {
        set.status = 403;
        return { error: "Forbidden", code: "admin_required" };
      }
      try {
        const created = createGame({
          title: body.title,
          slug: body.slug,
          description: body.description,
          createdByUserId: user.id,
        });
        set.status = 201;
        return created;
      } catch (err) {
        return handleServiceError(err, set);
      }
    },
    {
      body: t.Object({
        title: t.String(),
        slug: t.Optional(t.String()),
        description: t.Optional(t.Union([t.String(), t.Null()])),
      }),
    },
  )
  .patch(
    "/:id",
    ({ params, body, user, set }) => {
      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }
      if (!isAdmin(user)) {
        set.status = 403;
        return { error: "Forbidden", code: "admin_required" };
      }
      try {
        return patchGame({
          id: params.id,
          title: body.title,
          slug: body.slug,
          description: body.description,
        });
      } catch (err) {
        return handleServiceError(err, set);
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        title: t.Optional(t.String()),
        slug: t.Optional(t.String()),
        description: t.Optional(t.Union([t.String(), t.Null()])),
      }),
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
    },
  );
