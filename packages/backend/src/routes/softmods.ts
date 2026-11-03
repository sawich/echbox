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
  findSoftmodByHash,
  getSoftmod,
  getSoftmodVersionBytes,
  listSoftmods,
} from "../softmods/service";
import { setSoftmodVote } from "../softmods/votes";
import { GameServiceError } from "../games/service";
import { authDerive } from "./auth";

async function readUpload(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

function stripSoftmodPaths(detail: SoftmodDetail) {
  return {
    ...detail,
    versions: detail.versions.map(({ originalPath: _op, ...vRest }) => vRest),
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

export const softmodRoutes = new Elysia({ prefix: "/api/softmods" })
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
        hash: t.String(),
      }),
    },
  )
  .get(
    "/",
    async ({ query, user }) => {
      const softmods = await listSoftmods({
        viewerUserId: user?.id ?? null,
        gameId: query.gameId,
      });
      return { softmods };
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
        const created = await createSoftmod({
          authorId: user.id,
          gameId: body.gameId,
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
      body: t.Object({
        file: t.File(),
        gameId: t.String(),
        semver: t.String({ minLength: 1 }),
        notes: t.Optional(t.String()),
      }),
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
          authorId: user.id,
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
        return await deleteSoftmod({
          softmodId: params.id,
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
    },
  );
