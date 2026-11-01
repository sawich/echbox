import { Elysia, t } from "elysia";
import {
  type SceneDetail,
  DuplicateSceneHashError,
  SceneServiceError,
  addSceneVersion,
  createScene,
  deleteScene,
  findSceneByHash,
  getScene,
  getSceneVersionImage,
  listScenes,
  patchScene,
} from "../scenes/service";
import { setSceneVote } from "../scenes/votes";
import { authDerive } from "./auth";

async function readUpload(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

function stripScenePaths<
  T extends SceneDetail & {
    originalPath?: string;
    previewPath?: string;
    sceneId?: string;
    version?: number;
    contentHash?: string;
  },
>(scene: T) {
  const {
    originalPath: _op,
    previewPath: _pp,
    sceneId: _sid,
    version: _ver,
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
      version: err.version,
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
  throw err;
}

export const sceneRoutes = new Elysia({ prefix: "/api/scenes" })
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
        hash: t.String(),
      }),
    },
  )
  .get("/", async ({ user }) => {
    const scenes = await listScenes({
      viewerUserId: user?.id ?? null,
    });
    return { scenes };
  })
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
          title: body.title,
          slug: body.slug,
          notes: body.notes,
          fileBytes,
        });
        set.status = 201;
        return stripScenePaths(created);
      } catch (err) {
        return handleServiceError(err, set);
      }
    },
    {
      body: t.Object({
        file: t.File(),
        title: t.Optional(t.String()),
        slug: t.Optional(t.String()),
        notes: t.Optional(t.String()),
      }),
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
        id: t.String(),
      }),
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
      body: t.Object({
        file: t.File(),
        notes: t.Optional(t.String()),
      }),
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
    },
  )
  .get(
    "/:id/versions/:version/image",
    async ({ params, query, set }) => {
      const version = Number(params.version);
      if (!Number.isInteger(version) || version < 1) {
        set.status = 404;
        return new Response("Not found", { status: 404 });
      }
      const wantOriginal =
        query.original === "1" || query.original === "true";
      const img = await getSceneVersionImage(params.id, version, {
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
        version: t.String(),
      }),
      query: t.Object({
        original: t.Optional(t.String()),
      }),
    },
  );
