import { Elysia, t } from "elysia";
import {
  type ClothesDetail,
  DuplicateClothesHashError,
  DuplicateClothesSemverError,
  ClothesServiceError,
  addClothesVersion,
  createClothes,
  deleteClothes,
  deleteClothesVersion,
  findClothesByHash,
  getClothes,
  getClothesVersionImage,
  listClothes,
  patchClothes,
} from "../clothes/service";
import { setClothesVote } from "../clothes/votes";
import { GameServiceError } from "../games/service";
import { authDerive } from "./auth";

async function readUpload(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

function stripClothesPaths<
  T extends ClothesDetail & {
    originalPath?: string;
    previewPath?: string;
    clothesId?: string;
    versionId?: string;
    semver?: string;
    contentHash?: string;
  },
>(scene: T) {
  const {
    originalPath: _op,
    previewPath: _pp,
    clothesId: _sid,
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
  if (err instanceof DuplicateClothesHashError) {
    set.status = 409;
    return {
      error: err.message,
      code: err.code,
      clothesId: err.clothesId,
      clothes_id: err.clothes_id,
      versionId: err.versionId,
      semver: err.semver,
      conflict: err.conflict,
    };
  }
  if (err instanceof DuplicateClothesSemverError) {
    set.status = 409;
    return {
      error: err.message,
      code: err.code,
      clothesId: err.clothesId,
      semver: err.semver,
      conflict: err.conflict,
    };
  }
  if (err instanceof ClothesServiceError) {
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

export const clothesRoutes = new Elysia({ prefix: "/api/clothes" })
  .use(authDerive)
  .get(
    "/by-hash/:hash",
    ({ params, set }) => {
      const hit = findClothesByHash(params.hash);
      if (!hit) {
        set.status = 404;
        return { error: "Clothes not found" };
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
      const clothes = await listClothes({
        viewerUserId: user?.id ?? null,
        gameId: query.gameId,
      });
      return { clothes };
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
        const created = await createClothes({
          authorId: user.id,
          gameId: body.gameId,
          title: body.title,
          slug: body.slug,
          semver: body.semver,
          notes: body.notes,
          fileBytes,
        });
        set.status = 201;
        return stripClothesPaths(created);
      } catch (err) {
        return handleServiceError(err, set);
      }
    },
    {
      body: t.Object({
        file: t.File(),
        gameId: t.String(),
        title: t.Optional(t.String()),
        slug: t.Optional(t.String()),
        semver: t.String(),
        notes: t.Optional(t.String()),
      }),
    },
  )
  .get(
    "/:id",
    async ({ params, user, set }) => {
      const detail = await getClothes(params.id, {
        viewerUserId: user?.id ?? null,
      });
      if (!detail) {
        set.status = 404;
        return { error: "Clothes not found" };
      }
      return stripClothesPaths(detail);
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
        return setClothesVote({
          clothesId: params.id,
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
        const added = await addClothesVersion({
          clothesId: params.id,
          authorId: user.id,
          semver: body.semver,
          notes: body.notes,
          fileBytes,
        });
        return stripClothesPaths(added);
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
        semver: t.String(),
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
        const patched = await patchClothes({
          clothesId: params.id,
          authorId: user.id,
          title: body.title,
          slug: body.slug,
          notes: body.notes,
        });
        return stripClothesPaths(patched);
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
        return await deleteClothes({
          clothesId: params.id,
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
        const detail = await deleteClothesVersion({
          clothesId: params.id,
          versionId: params.versionId,
          authorId: user.id,
        });
        return stripClothesPaths(detail);
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
    "/:id/versions/:versionId/image",
    async ({ params, query, set }) => {
      const wantOriginal =
        query.original === "1" || query.original === "true";
      const img = await getClothesVersionImage(params.id, params.versionId, {
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
        original: t.Optional(t.String()),
      }),
    },
  );
