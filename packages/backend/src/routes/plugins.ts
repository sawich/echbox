import { Elysia, t } from "elysia";
import {
  type PluginDetail,
  DuplicatePluginHashError,
  DuplicatePluginSemverError,
  PluginServiceError,
  addPluginVersion,
  createPlugin,
  deletePlugin,
  deletePluginVersion,
  findPluginByHash,
  getPlugin,
  getPluginVersionBytes,
  listPlugins,
  patchPlugin,
} from "../plugins/service";
import { setPluginVote } from "../plugins/votes";
import { GameServiceError } from "../games/service";
import { authDerive } from "./auth";

async function readUpload(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

function stripPluginPaths(detail: PluginDetail) {
  return {
    ...detail,
    versions: detail.versions.map(({ originalPath: _op, ...vRest }) => vRest),
  };
}

function downloadFilename(pluginId: string, versionId: string): string {
  const safeId = pluginId.replace(/[^\w.-]+/g, "_");
  const safeVersion = versionId.replace(/[^\w.-]+/g, "_");
  return `${safeId}-${safeVersion}.zip`;
}

function handleServiceError(
  err: unknown,
  set: { status?: number | string },
) {
  if (
    err instanceof DuplicatePluginHashError ||
    err instanceof DuplicatePluginSemverError
  ) {
    set.status = 409;
    return {
      error: err.message,
      code: err.code,
      pluginId: err.pluginId,
      plugin_id: err.plugin_id,
      versionId: err.versionId,
      semver: err.semver,
      conflict: err.conflict,
    };
  }
  if (err instanceof PluginServiceError) {
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

export const pluginRoutes = new Elysia({ prefix: "/api/plugins" })
  .use(authDerive)
  .get(
    "/by-hash/:hash",
    ({ params, set }) => {
      const hit = findPluginByHash(params.hash);
      if (!hit) {
        set.status = 404;
        return { error: "Plugin not found" };
      }
      return hit;
    },
    {
      params: t.Object({
        hash: t.String(),
      }),
    },
  )
  .get(
    "/",
    async ({ query, user }) => {
      const plugins = await listPlugins({
        viewerUserId: user?.id ?? null,
        gameId: query.gameId,
      });
      return { plugins };
    },
    {
      query: t.Object({
        gameId: t.Optional(t.String()),
      }),
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
        const created = await createPlugin({
          authorId: user.id,
          gameId: body.gameId,
          title: body.title,
          description: body.description,
          semver: body.semver,
          notes: body.notes,
          fileBytes,
        });
        set.status = 201;
        return stripPluginPaths(created);
      } catch (err) {
        return handleServiceError(err, set);
      }
    },
    {
      body: t.Object({
        file: t.File(),
        gameId: t.String(),
        title: t.String(),
        description: t.Optional(t.String()),
        semver: t.String({ minLength: 1 }),
        notes: t.Optional(t.String()),
      }),
    },
  )
  .get(
    "/:id",
    async ({ params, user, set }) => {
      const detail = await getPlugin(params.id, {
        viewerUserId: user?.id ?? null,
      });
      if (!detail) {
        set.status = 404;
        return { error: "Plugin not found" };
      }
      return stripPluginPaths(detail);
    },
    {
      params: t.Object({
        id: t.String(),
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
        const updated = await patchPlugin({
          id: params.id,
          authorId: user.id,
          title: body.title,
          description: body.description,
        });
        return stripPluginPaths(updated);
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
        description: t.Optional(t.String()),
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
        return setPluginVote({
          pluginId: params.id,
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
        const added = await addPluginVersion({
          pluginId: params.id,
          authorId: user.id,
          fileBytes,
          semver: body.semver,
          notes: body.notes,
        });
        return stripPluginPaths(added);
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
        semver: t.String({ minLength: 1 }),
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
        return await deletePlugin({
          pluginId: params.id,
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
  .delete(
    "/:id/versions/:versionId",
    async ({ params, user, set }) => {
      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }
      try {
        const detail = await deletePluginVersion({
          pluginId: params.id,
          versionId: params.versionId,
          authorId: user.id,
        });
        return stripPluginPaths(detail);
      } catch (err) {
        return handleServiceError(err, set);
      }
    },
    {
      params: t.Object({
        id: t.String(),
        versionId: t.String(),
      }),
    },
  )
  .get(
    "/:id/versions/:versionId/download",
    async ({ params, set }) => {
      const file = await getPluginVersionBytes(params.id, params.versionId);
      if (!file) {
        set.status = 404;
        return new Response("Not found", { status: 404 });
      }

      const filename = downloadFilename(params.id, params.versionId);
      return new Response(file.bytes, {
        headers: {
          "content-type": file.contentType,
          "content-disposition": `attachment; filename="${filename}"`,
          "cache-control": "public, max-age=3600",
        },
      });
    },
    {
      params: t.Object({
        id: t.String(),
        versionId: t.String(),
      }),
    },
  );
