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

export const pluginRoutes = new Elysia({
  prefix: "/api/plugins",
  tags: ["Plugins"],
})
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
        hash: t.String({ description: "SHA-256 hex of the zip bytes" }),
      }),
      detail: { summary: "Find plugin by content hash" },
    },
  )
  .get(
    "/",
    async ({ query, user }) => {
      const result = await listPlugins({
        viewerUserId: user?.id ?? null,
        ...listOptsFromQuery(query),
      });
      return {
        plugins: result.items,
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
      detail: { summary: "List plugins" },
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
      body: t.Object(
        {
          file: t.File({ description: "Plugin zip" }),
          gameId: t.String({ description: "Target game id" }),
          title: t.String({ description: "Required display title" }),
          description: t.Optional(t.String()),
          semver: t.String({ minLength: 1, description: "Initial semver" }),
          notes: t.Optional(t.String()),
        },
        { description: "multipart/form-data" },
      ),
      detail: {
        summary: "Upload plugin",
        security: [...bearerAuthSecurity],
      },
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
        id: t.String({ description: "Plugin id" }),
      }),
      detail: { summary: "Get plugin" },
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
      detail: {
        summary: "Update plugin metadata",
        security: [...bearerAuthSecurity],
      },
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
      detail: {
        summary: "Vote on plugin",
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
      body: t.Object(
        {
          file: t.File({ description: "Plugin zip" }),
          semver: t.String({ minLength: 1 }),
          notes: t.Optional(t.String()),
        },
        { description: "multipart/form-data" },
      ),
      detail: {
        summary: "Add plugin version",
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
      detail: {
        summary: "Delete plugin",
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
      detail: {
        summary: "Delete plugin version",
        security: [...bearerAuthSecurity],
      },
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
      detail: { summary: "Download plugin zip" },
    },
  );
