import { Elysia, t } from "elysia";
import {
  type SceneDetail,
  DuplicateSceneHashError,
  DuplicateSceneSemverError,
  SceneServiceError,
  addSceneVersion,
  createScene,
  deleteScene,
  deleteSceneVersion,
  findSceneByHash,
  getScene,
  getSceneVersionImage,
  listScenes,
  patchScene,
} from "../scenes/service";
import { setSceneVote } from "../scenes/votes";
import {
  catalogListQueryFields,
  listOptsFromQuery,
} from "../common/list-query-schema";
import { GameServiceError } from "../games/service";
import { bearerAuthSecurity } from "../openapi";
import { authDerive } from "./auth";

async function readUpload(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

function stripScenePaths<
  T extends SceneDetail & {
    originalPath?: string;
    previewPath?: string;
    sceneId?: string;
    versionId?: string;
    semver?: string;
    contentHash?: string;
  },
>(scene: T) {
  const {
    originalPath: _op,
    previewPath: _pp,
    sceneId: _sid,
    versionId: _vid,
    semver: _sv,
    contentHash: _ch,
    ...rest
  } = scene;
  return {
    ...rest,
    versions: scene.versions.map(
      ({ originalPath: _vop, previewPath: _vpp, contentHash: _vch, ...vRest }) =>
        vRest,
    ),
  };
}

function handleServiceError(
  err: unknown,
  set: { status?: number | string },
) {
  if (err instanceof DuplicateSceneHashError) {
    set.status = 409;
    return {
      error: err.message,
      code: err.code,
      sceneId: err.sceneId,
      scene_id: err.scene_id,
      versionId: err.versionId,
      semver: err.semver,
      conflict: err.conflict,
    };
  }
  if (err instanceof DuplicateSceneSemverError) {
    set.status = 409;
    return {
      error: err.message,
      code: err.code,
      sceneId: err.sceneId,
      semver: err.semver,
      conflict: err.conflict,
    };
  }
  if (err instanceof SceneServiceError) {
    set.status = err.status;
    return {
      error: err.message,
      code: err.code,
    };
  }
  if (err instanceof GameServiceError) {
    set.status = err.status;
    return {
      error: err.message,
      code: err.code,
    };
  }
  throw err;
}

export const sceneRoutes = new Elysia({
  prefix: "/api/scenes",
  tags: ["Scenes"],
})
  .use(authDerive)
  .get(
    "/by-hash/:hash",
    ({ params, set }) => {
      const hit = findSceneByHash(params.hash);
      if (!hit) {
        set.status = 404;
        return { error: "Scene not found" };
      }
      return hit;
    },
    {
      params: t.Object({
        hash: t.String({ description: "SHA-256 hex of the original PNG bytes" }),
      }),
      detail: { summary: "Find scene by content hash" },
    },
  )
  .get(
    "/",
    async ({ query, user }) => {
      const result = await listScenes({
        viewerUserId: user?.id ?? null,
        ...listOptsFromQuery(query),
      });
      return {
        scenes: result.items,
        total: result.total,
        page: result.page,
        limit: result.limit,
      };
    },
    {
      query: t.Object({
        gameId: t.Optional(t.String({ description: "Limit to this game id" })),
        ...catalogListQueryFields,
      }),
      detail: { summary: "List scenes" },
    },
  )
  .post(
    "/",
    async ({ body, user, set }) => {
      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }
      try {
        const fileBytes = await readUpload(body.file);
        const created = await createScene({
          authorId: user.id,
          gameId: body.gameId,
          title: body.title,
          slug: body.slug,
          semver: body.semver,
          notes: body.notes,
          fileBytes,
          originalFilename: body.file.name,
        });
        set.status = 201;
        return stripScenePaths(created);
      } catch (err) {
        return handleServiceError(err, set);
      }
    },
    {
      body: t.Object(
        {
          file: t.File({ description: "Studio scene PNG" }),
          gameId: t.String({ description: "Target game id" }),
          title: t.Optional(
            t.String({
              description:
                "If empty, uses upload filename stem (scenes have no embedded title)",
            }),
          ),
          slug: t.Optional(t.String()),
          semver: t.String({ description: "Initial semver, e.g. `1.0.0`" }),
          notes: t.Optional(t.String()),
        },
        { description: "multipart/form-data" },
      ),
      detail: {
        summary: "Upload scene",
        security: [...bearerAuthSecurity],
      },
    },
  )
  .get(
    "/:id",
    async ({ params, user, set }) => {
      const detail = await getScene(params.id, {
        viewerUserId: user?.id ?? null,
      });
      if (!detail) {
        set.status = 404;
        return { error: "Scene not found" };
      }
      return stripScenePaths(detail);
    },
    {
      params: t.Object({
        id: t.String({ description: "Scene id" }),
      }),
      detail: { summary: "Get scene" },
    },
  )
  .put(
    "/:id/vote",
    ({ params, body, user, set }) => {
      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }
      try {
        return setSceneVote({
          sceneId: params.id,
          userId: user.id,
          vote: body.vote,
        });
      } catch (err) {
        return handleServiceError(err, set);
      }
    },
    {
      params: t.Object({
        id: t.String(),
      }),
      body: t.Object({
        vote: t.Union([t.Literal("like"), t.Literal("dislike"), t.Null()]),
      }),
      detail: {
        summary: "Vote on scene",
        security: [...bearerAuthSecurity],
      },
    },
  )
  .post(
    "/:id/versions",
    async ({ params, body, user, set }) => {
      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }
      try {
        const fileBytes = await readUpload(body.file);
        const added = await addSceneVersion({
          sceneId: params.id,
          authorId: user.id,
          semver: body.semver,
          notes: body.notes,
          fileBytes,
        });
        return stripScenePaths(added);
      } catch (err) {
        return handleServiceError(err, set);
      }
    },
    {
      params: t.Object({
        id: t.String(),
      }),
      body: t.Object(
        {
          file: t.File(),
          semver: t.String(),
          notes: t.Optional(t.String()),
        },
        { description: "multipart/form-data" },
      ),
      detail: {
        summary: "Add scene version",
        security: [...bearerAuthSecurity],
      },
    },
  )
  .patch(
    "/:id",
    async ({ params, body, user, set }) => {
      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }
      try {
        const patched = await patchScene({
          sceneId: params.id,
          authorId: user.id,
          title: body.title,
          slug: body.slug,
          notes: body.notes,
        });
        return stripScenePaths(patched);
      } catch (err) {
        return handleServiceError(err, set);
      }
    },
    {
      params: t.Object({
        id: t.String(),
      }),
      body: t.Object({
        title: t.Optional(t.String()),
        slug: t.Optional(t.String()),
        notes: t.Optional(t.String()),
      }),
      detail: {
        summary: "Update scene metadata",
        security: [...bearerAuthSecurity],
      },
    },
  )
  .delete(
    "/:id",
    async ({ params, user, set }) => {
      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }
      try {
        return await deleteScene({
          sceneId: params.id,
          authorId: user.id,
        });
      } catch (err) {
        return handleServiceError(err, set);
      }
    },
    {
      params: t.Object({
        id: t.String(),
      }),
      detail: {
        summary: "Delete scene",
        security: [...bearerAuthSecurity],
      },
    },
  )
  .delete(
    "/:id/versions/:versionId",
    async ({ params, user, set }) => {
      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }
      try {
        const detail = await deleteSceneVersion({
          sceneId: params.id,
          versionId: params.versionId,
          authorId: user.id,
        });
        return stripScenePaths(detail);
      } catch (err) {
        return handleServiceError(err, set);
      }
    },
    {
      params: t.Object({
        id: t.String(),
        versionId: t.String(),
      }),
      detail: {
        summary: "Delete scene version",
        security: [...bearerAuthSecurity],
      },
    },
  )
  .get(
    "/:id/versions/:versionId/image",
    async ({ params, query, set }) => {
      const wantOriginal =
        query.original === "1" || query.original === "true";
      const img = await getSceneVersionImage(params.id, params.versionId, {
        original: wantOriginal,
      });
      if (!img) {
        set.status = 404;
        return new Response("Not found", { status: 404 });
      }
      return new Response(img.bytes, {
        headers: {
          "content-type": img.contentType,
          "cache-control": "public, max-age=3600",
        },
      });
    },
    {
      params: t.Object({
        id: t.String(),
        versionId: t.String(),
      }),
      query: t.Object({
        original: t.Optional(
          t.String({
            description: "`1` / `true` for original PNG; default WebP preview",
          }),
        ),
      }),
      detail: { summary: "Download scene image" },
    },
  );
