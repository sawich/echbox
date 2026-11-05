import { Elysia, t } from "elysia";
import {
  type SoftmodDetail,
  DuplicateSoftmodHashError,
  DuplicateSoftmodSemverError,
  SoftmodGuidConflictError,
  SoftmodServiceError,
  addSoftmodVersion,
  createSoftmod,
  deleteSoftmod,
  deleteSoftmodVersion,
  findSoftmodByHash,
  getSoftmod,
  getSoftmodVersionBytes,
  listSoftmods,
  patchSoftmod,
} from "../softmods/service";
import { setSoftmodVote } from "../softmods/votes";
import { isAdmin } from "../auth/admin";
import {
  listOptsFromQuery,
  taggableListQueryFields,
  tagsFromQuery,
} from "../common/list-query-schema";
import { GameServiceError } from "../games/service";
import { bearerAuthSecurity } from "../openapi";
import {
  addSoftmodPreview,
  deleteSoftmodPreview,
  reorderSoftmodPreviews,
  softmodPreviewPath,
} from "../softmods/previews";
import { authDerive } from "./auth";
import { editUploaderId, readContentTags, writeContentTags } from "./content-tags";

async function readUpload(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

function stripSoftmodPaths(detail: SoftmodDetail) {
  return {
    ...detail,
    versions: detail.versions.map(({ originalPath: _op, ...vRest }) => vRest),
  };
}

async function previewActor(
  softmodId: string,
  user: { id: string; discordId: string },
  set: { status?: number | string },
) {
  const detail = await getSoftmod(softmodId);
  if (!detail) {
    set.status = 404;
    return null;
  }
  return {
    uploaderId: detail.uploaderId,
    actor: { userId: user.id, isAdmin: isAdmin(user) },
  };
}

function downloadFilename(softmodId: string, versionId: string): string {
  const safeId = softmodId.replace(/[^\w.-]+/g, "_");
  const safeVersion = versionId.replace(/[^\w.-]+/g, "_");
  return `${safeId}-${safeVersion}.zipmod`;
}

function handleServiceError(
  err: unknown,
  set: { status?: number | string },
) {
  if (
    err instanceof DuplicateSoftmodHashError ||
    err instanceof DuplicateSoftmodSemverError
  ) {
    set.status = 409;
    return {
      error: err.message,
      code: err.code,
      softmodId: err.softmodId,
      softmod_id: err.softmod_id,
      versionId: err.versionId,
      semver: err.semver,
      conflict: err.conflict,
    };
  }
  if (err instanceof SoftmodGuidConflictError) {
    set.status = 409;
    return {
      error: err.message,
      code: err.code,
      softmodId: err.softmodId,
      softmod_id: err.softmod_id,
    };
  }
  if (err instanceof SoftmodServiceError) {
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

export const softmodRoutes = new Elysia({
  prefix: "/api/softmods",
  tags: ["Softmods"],
})
  .use(authDerive)
  .get(
    "/by-hash/:hash",
    ({ params, set }) => {
      const hit = findSoftmodByHash(params.hash);
      if (!hit) {
        set.status = 404;
        return { error: "Softmod not found" };
      }
      return hit;
    },
    {
      params: t.Object({
        hash: t.String({ description: "SHA-256 hex of the zipmod bytes" }),
      }),
      detail: { summary: "Find softmod by content hash" },
    },
  )
  .get(
    "/",
    async ({ query, user }) => {
      const result = await listSoftmods({
        viewerUserId: user?.id ?? null,
        ...listOptsFromQuery(query),
        tags: tagsFromQuery(query.tags),
      });
      return {
        softmods: result.items,
        total: result.total,
        page: result.page,
        limit: result.limit,
      };
    },
    {
      query: t.Object({
        gameId: t.Optional(t.String({ description: "Limit to this game id" })),
        ...taggableListQueryFields,
      }),
      detail: { summary: "List softmods" },
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
        const created = await createSoftmod({
          uploaderId: user.id,
          gameId: body.gameId,
          description: body.description,
          semver: body.semver,
          fileBytes,
          notes: body.notes,
        });
        set.status = 201;
        return stripSoftmodPaths(created);
      } catch (err) {
        return handleServiceError(err, set);
      }
    },
    {
      body: t.Object(
        {
          file: t.File({ description: "Softmod .zipmod file" }),
          gameId: t.String({ description: "Target game id" }),
          description: t.Optional(t.String()),
          semver: t.String({
            minLength: 1,
            description: "Initial semver",
          }),
          notes: t.Optional(t.String()),
        },
        { description: "multipart/form-data" },
      ),
      detail: {
        summary: "Upload softmod",
        security: [...bearerAuthSecurity],
      },
    },
  )
  .get(
    "/:id",
    async ({ params, user, set }) => {
      const detail = await getSoftmod(params.id, {
        viewerUserId: user?.id ?? null,
      });
      if (!detail) {
        set.status = 404;
        return { error: "Softmod not found" };
      }
      return stripSoftmodPaths(detail);
    },
    {
      params: t.Object({
        id: t.String({ description: "Softmod id" }),
      }),
      detail: { summary: "Get softmod" },
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
        const patched = await patchSoftmod({
          softmodId: params.id,
          uploaderId: await editUploaderId(
            user,
            async () => (await getSoftmod(params.id))?.uploaderId,
          ),
          description: body.description,
        });
        return stripSoftmodPaths(patched);
      } catch (err) {
        return handleServiceError(err, set);
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        description: t.Optional(t.String()),
      }),
      detail: {
        summary: "Update softmod description",
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
        return setSoftmodVote({
          softmodId: params.id,
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
        summary: "Vote on softmod",
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
        const added = await addSoftmodVersion({
          softmodId: params.id,
          uploaderId: user.id,
          semver: body.semver,
          fileBytes,
          notes: body.notes,
        });
        return stripSoftmodPaths(added);
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
          file: t.File({ description: "Softmod .zipmod" }),
          semver: t.String({ minLength: 1 }),
          notes: t.Optional(t.String()),
        },
        { description: "multipart/form-data" },
      ),
      detail: {
        summary: "Add softmod version",
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
        return await deleteSoftmod({
          softmodId: params.id,
          uploaderId: user.id,
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
        summary: "Delete softmod",
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
        const detail = await deleteSoftmodVersion({
          softmodId: params.id,
          versionId: params.versionId,
          uploaderId: user.id,
        });
        return stripSoftmodPaths(detail);
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
        summary: "Delete softmod version",
        security: [...bearerAuthSecurity],
      },
    },
  )
  .post(
    "/:id/previews",
    async ({ params, body, user, set }) => {
      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }
      const target = await previewActor(params.id, user, set);
      if (!target) return { error: "Softmod not found" };
      try {
        const created = await addSoftmodPreview({
          softmodId: params.id,
          bytes: await readUpload(body.file),
          actor: target.actor,
          uploaderId: target.uploaderId,
        });
        set.status = 201;
        return created;
      } catch (err) {
        return handleServiceError(err, set);
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object(
        { file: t.File({ description: "Preview image" }) },
        { description: "multipart/form-data" },
      ),
      detail: {
        summary: "Add a softmod preview image",
        security: [...bearerAuthSecurity],
      },
    },
  )
  .put(
    "/:id/previews",
    async ({ params, body, user, set }) => {
      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }
      const target = await previewActor(params.id, user, set);
      if (!target) return { error: "Softmod not found" };
      try {
        const previews = await reorderSoftmodPreviews({
          softmodId: params.id,
          orderedIds: body.orderedIds,
          actor: target.actor,
          uploaderId: target.uploaderId,
        });
        return { previews };
      } catch (err) {
        return handleServiceError(err, set);
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({ orderedIds: t.Array(t.String()) }),
      detail: {
        summary: "Reorder softmod previews",
        security: [...bearerAuthSecurity],
      },
    },
  )
  .delete(
    "/:id/previews/:previewId",
    async ({ params, user, set }) => {
      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }
      const target = await previewActor(params.id, user, set);
      if (!target) return { error: "Softmod not found" };
      try {
        await deleteSoftmodPreview({
          softmodId: params.id,
          previewId: params.previewId,
          actor: target.actor,
          uploaderId: target.uploaderId,
        });
        return { ok: true as const };
      } catch (err) {
        return handleServiceError(err, set);
      }
    },
    {
      params: t.Object({
        id: t.String(),
        previewId: t.String(),
      }),
      detail: {
        summary: "Delete a softmod preview",
        security: [...bearerAuthSecurity],
      },
    },
  )
  .get(
    "/:id/previews/:previewId",
    async ({ params, set }) => {
      let path: string;
      try {
        path = softmodPreviewPath(params.id, params.previewId);
      } catch (err) {
        return handleServiceError(err, set);
      }
      const file = Bun.file(path);
      if (!(await file.exists())) {
        set.status = 404;
        return new Response("Not found", { status: 404 });
      }
      return new Response(await file.bytes(), {
        headers: {
          "content-type": "image/webp",
          "cache-control": "public, max-age=3600",
        },
      });
    },
    {
      params: t.Object({
        id: t.String(),
        previewId: t.String(),
      }),
      detail: { summary: "Download a softmod preview image" },
    },
  )
  .get(
    "/:id/tags",
    async ({ params, set }) => readContentTags("softmods", params.id, set),
    {
      params: t.Object({ id: t.String() }),
      detail: { summary: "List tags on a softmod" },
    },
  )
  .put(
    "/:id/tags",
    async ({ params, body, user, set }) =>
      writeContentTags({
        kind: "softmods",
        contentId: params.id,
        names: body.tags,
        user,
        set,
      }),
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({ tags: t.Array(t.String()) }),
      detail: {
        summary: "Replace tags on a softmod",
        security: [...bearerAuthSecurity],
      },
    },
  )
  .get(
    "/:id/versions/:versionId/download",
    async ({ params, set }) => {
      const file = await getSoftmodVersionBytes(params.id, params.versionId);
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
      detail: { summary: "Download softmod zipmod" },
    },
  );
