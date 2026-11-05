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
import {
  listOptsFromQuery,
  taggableListQueryFields,
  tagsFromQuery,
} from "../common/list-query-schema";
import { GameServiceError } from "../games/service";
import { bearerAuthSecurity } from "../openapi";
import { authDerive } from "./auth";
import {
  NOTES_OWNER_ONLY,
  metadataEdit,
  readContentTags,
  writeContentTags,
} from "./content-tags";

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

export const clothesRoutes = new Elysia({
  prefix: "/api/clothes",
  tags: ["Clothes"],
})
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
        hash: t.String({ description: "SHA-256 hex of the original PNG bytes" }),
      }),
      detail: { summary: "Find clothes by content hash" },
    },
  )
  .get(
    "/",
    async ({ query, user }) => {
      const result = await listClothes({
        viewerUserId: user?.id ?? null,
        ...listOptsFromQuery(query),
        tags: tagsFromQuery(query.tags),
      });
      return {
        clothes: result.items,
        total: result.total,
        page: result.page,
        limit: result.limit,
      };
    },
    {
      query: t.Object({
        gameId: t.Optional(
          t.String({ description: "Limit to this game id" }),
        ),
        ...taggableListQueryFields,
      }),
      detail: { summary: "List clothes" },
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
          uploaderId: user.id,
          gameId: body.gameId,
          description: body.description,
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
      body: t.Object(
        {
          file: t.File({ description: "Coordinate / clothes PNG" }),
          gameId: t.String({ description: "Target game id" }),
          description: t.Optional(t.String()),
          semver: t.String({ description: "Initial semver, e.g. `1.0.0`" }),
          notes: t.Optional(t.String()),
        },
        { description: "multipart/form-data" },
      ),
      detail: {
        summary: "Upload clothes",
        security: [...bearerAuthSecurity],
      },
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
        id: t.String({ description: "Clothes id" }),
      }),
      detail: { summary: "Get clothes" },
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
      detail: {
        summary: "Vote on clothes",
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
        const added = await addClothesVersion({
          clothesId: params.id,
          uploaderId: user.id,
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
      body: t.Object(
        {
          file: t.File(),
          semver: t.String(),
          notes: t.Optional(t.String()),
        },
        { description: "multipart/form-data" },
      ),
      detail: {
        summary: "Add clothes version",
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
        const edit = await metadataEdit(
          user,
          async () => (await getClothes(params.id))?.uploaderId,
          body.notes,
          set,
        );
        if (!edit) return { error: NOTES_OWNER_ONLY };
        const patched = await patchClothes({
          clothesId: params.id,
          uploaderId: edit.uploaderId,
          description: body.description,
          notes: edit.notes,
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
        description: t.Optional(t.String()),
        notes: t.Optional(t.String()),
      }),
      detail: {
        summary: "Update clothes metadata",
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
        return await deleteClothes({
          clothesId: params.id,
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
        summary: "Delete clothes",
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
        const detail = await deleteClothesVersion({
          clothesId: params.id,
          versionId: params.versionId,
          uploaderId: user.id,
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
      detail: {
        summary: "Delete clothes version",
        security: [...bearerAuthSecurity],
      },
    },
  )
  .get(
    "/:id/tags",
    async ({ params, set }) => readContentTags("clothes", params.id, set),
    {
      params: t.Object({ id: t.String() }),
      detail: { summary: "List tags on a clothes item" },
    },
  )
  .put(
    "/:id/tags",
    async ({ params, body, user, set }) =>
      writeContentTags({
        kind: "clothes",
        contentId: params.id,
        names: body.tags,
        user,
        set,
      }),
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({ tags: t.Array(t.String()) }),
      detail: {
        summary: "Replace tags on a clothes item",
        security: [...bearerAuthSecurity],
      },
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
        original: t.Optional(
          t.String({
            description: "`1` / `true` for original PNG; default WebP preview",
          }),
        ),
      }),
      detail: { summary: "Download clothes image" },
    },
  );
