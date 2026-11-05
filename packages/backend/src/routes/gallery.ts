import { Elysia, t } from "elysia";
import {
  type CharacterCardDetail,
  CardServiceError,
  DuplicateCardHashError,
  DuplicateCardSemverError,
  addVersion,
  createCard,
  deleteCard,
  deleteVersion,
  findByHash,
  getCard as getCharacterCard,
  getVersionImage as getCharacterVersionImage,
  listCharacters,
  patchCard,
} from "../cards/service";
import { setCardVote } from "../cards/votes";
import {
  listOptsFromQuery,
  taggableListQueryFields,
  tagsFromQuery,
} from "../common/list-query-schema";
import {
  NOTES_OWNER_ONLY,
  metadataEdit,
  readContentTags,
  writeContentTags,
} from "./content-tags";
import { GameServiceError } from "../games/service";
import { bearerAuthSecurity } from "../openapi";
import { authDerive } from "./auth";

async function readUpload(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

function stripCardPaths<
  T extends CharacterCardDetail & {
    originalPath?: string;
    previewPath?: string;
  },
>(card: T) {
  const { originalPath: _op, previewPath: _pp, ...rest } = card;
  return {
    ...rest,
    versions: card.versions.map(
      ({ originalPath: _vop, previewPath: _vpp, ...vRest }) => vRest,
    ),
  };
}

function handleServiceError(
  err: unknown,
  set: { status?: number | string },
) {
  if (err instanceof DuplicateCardHashError) {
    set.status = 409;
    return {
      error: err.message,
      code: err.code,
      cardId: err.cardId,
      card_id: err.card_id,
      versionId: err.versionId,
      semver: err.semver,
      conflict: err.conflict,
    };
  }
  if (err instanceof DuplicateCardSemverError) {
    set.status = 409;
    return {
      error: err.message,
      code: err.code,
      cardId: err.cardId,
      semver: err.semver,
      conflict: err.conflict,
    };
  }
  if (err instanceof CardServiceError) {
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

export const galleryRoutes = new Elysia({
  prefix: "/api/kk",
  tags: ["Cards"],
})
  .use(authDerive)
  .get(
    "/cards/by-hash/:hash",
    ({ params, set }) => {
      const hit = findByHash(params.hash);
      if (!hit) {
        set.status = 404;
        return { error: "Card not found" };
      }
      return hit;
    },
    {
      params: t.Object({
        hash: t.String({ description: "SHA-256 hex of the original PNG bytes" }),
      }),
      detail: {
        summary: "Find card by content hash",
      },
    },
  )
  .get(
    "/cards",
    async ({ query, user }) => {
      const viewerUserId = user?.id ?? null;
      const listOpts = {
        viewerUserId,
        ...listOptsFromQuery(query),
      };
      if (query.type === "scene") {
        return { cards: [], total: 0, page: listOpts.page, limit: listOpts.limit };
      }
      const result = await listCharacters({
        ...listOpts,
        tags: tagsFromQuery(query.tags),
      });
      return {
        cards: result.items,
        total: result.total,
        page: result.page,
        limit: result.limit,
      };
    },
    {
      query: t.Object({
        type: t.Optional(
          t.Union([t.Literal("character"), t.Literal("scene")], {
            description: "Filter by card type (use `character`)",
          }),
        ),
        gameId: t.Optional(
          t.String({ description: "Limit to cards for this game id" }),
        ),
        ...taggableListQueryFields,
      }),
      detail: {
        summary: "List character cards",
      },
    },
  )
  .post(
    "/cards",
    async ({ body, user, set }) => {
      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }
      try {
        const fileBytes = await readUpload(body.file);
        const created = await createCard({
          uploaderId: user.id,
          gameId: body.gameId,
          description: body.description,
          semver: body.semver,
          notes: body.notes,
          fileBytes,
        });
        set.status = 201;
        return stripCardPaths(created);
      } catch (err) {
        return handleServiceError(err, set);
      }
    },
    {
      body: t.Object(
        {
          file: t.File({ description: "Character card PNG (multipart)" }),
          gameId: t.String({ description: "Target game id from GET /api/games" }),
          description: t.Optional(t.String({ description: "Card description" })),
          semver: t.String({
            description: "Initial version semver, e.g. `1.0.0`",
          }),
          notes: t.Optional(t.String({ description: "Version notes" })),
        },
        { description: "multipart/form-data upload" },
      ),
      detail: {
        summary: "Upload character card",
        description:
          "Creates a new card and first version. Auth: Bearer API key or session cookie.",
        security: [...bearerAuthSecurity],
      },
    },
  )
  .get(
    "/cards/:id",
    async ({ params, user, set }) => {
      const chara = await getCharacterCard(params.id, {
        viewerUserId: user?.id ?? null,
      });
      if (chara) {
        return stripCardPaths(chara);
      }
      set.status = 404;
      return { error: "Card not found" };
    },
    {
      params: t.Object({
        id: t.String({ description: "Card id" }),
      }),
      detail: {
        summary: "Get character card",
      },
    },
  )
  .put(
    "/cards/:id/vote",
    ({ params, body, user, set }) => {
      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }
      try {
        return setCardVote({
          cardId: params.id,
          userId: user.id,
          vote: body.vote,
        });
      } catch (err) {
        return handleServiceError(err, set);
      }
    },
    {
      params: t.Object({
        id: t.String({ description: "Card id" }),
      }),
      body: t.Object({
        vote: t.Union([t.Literal("like"), t.Literal("dislike"), t.Null()], {
          description: "`like`, `dislike`, or `null` to clear",
        }),
      }),
      detail: {
        summary: "Vote on character card",
        security: [...bearerAuthSecurity],
      },
    },
  )
  .post(
    "/cards/:id/versions",
    async ({ params, body, user, set }) => {
      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }
      try {
        const fileBytes = await readUpload(body.file);
        const added = await addVersion({
          cardId: params.id,
          uploaderId: user.id,
          semver: body.semver,
          notes: body.notes,
          fileBytes,
        });
        return stripCardPaths(added);
      } catch (err) {
        return handleServiceError(err, set);
      }
    },
    {
      params: t.Object({
        id: t.String({ description: "Card id (must be author)" }),
      }),
      body: t.Object(
        {
          file: t.File({ description: "New version PNG" }),
          semver: t.String({ description: "New version semver" }),
          notes: t.Optional(t.String()),
        },
        { description: "multipart/form-data" },
      ),
      detail: {
        summary: "Add card version",
        security: [...bearerAuthSecurity],
      },
    },
  )
  .patch(
    "/cards/:id",
    async ({ params, body, user, set }) => {
      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }
      try {
        const edit = await metadataEdit(
          user,
          async () => (await getCharacterCard(params.id))?.uploaderId,
          body.notes,
          set,
        );
        if (!edit) return { error: NOTES_OWNER_ONLY };
        const patched = await patchCard({
          cardId: params.id,
          uploaderId: edit.uploaderId,
          description: body.description,
          notes: edit.notes,
        });
        return stripCardPaths(patched);
      } catch (err) {
        return handleServiceError(err, set);
      }
    },
    {
      params: t.Object({
        id: t.String({ description: "Card id" }),
      }),
      body: t.Object({
        description: t.Optional(t.String()),
        notes: t.Optional(t.String()),
      }),
      detail: {
        summary: "Update character card metadata",
        security: [...bearerAuthSecurity],
      },
    },
  )
  .delete(
    "/cards/:id",
    async ({ params, user, set }) => {
      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }
      try {
        return await deleteCard({
          cardId: params.id,
          uploaderId: user.id,
        });
      } catch (err) {
        return handleServiceError(err, set);
      }
    },
    {
      params: t.Object({
        id: t.String({ description: "Card id" }),
      }),
      detail: {
        summary: "Delete character card",
        security: [...bearerAuthSecurity],
      },
    },
  )
  .delete(
    "/cards/:id/versions/:versionId",
    async ({ params, user, set }) => {
      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }
      try {
        const detail = await deleteVersion({
          cardId: params.id,
          versionId: params.versionId,
          uploaderId: user.id,
        });
        return stripCardPaths(detail);
      } catch (err) {
        return handleServiceError(err, set);
      }
    },
    {
      params: t.Object({
        id: t.String({ description: "Card id" }),
        versionId: t.String({ description: "Version id" }),
      }),
      detail: {
        summary: "Delete card version",
        security: [...bearerAuthSecurity],
      },
    },
  )
  .get(
    "/cards/:id/tags",
    async ({ params, set }) => readContentTags("cards", params.id, set),
    {
      params: t.Object({ id: t.String({ description: "Card id" }) }),
      detail: { summary: "List tags on a character card" },
    },
  )
  .put(
    "/cards/:id/tags",
    async ({ params, body, user, set }) =>
      writeContentTags({
        kind: "cards",
        contentId: params.id,
        names: body.tags,
        user,
        set,
      }),
    {
      params: t.Object({ id: t.String({ description: "Card id" }) }),
      body: t.Object({ tags: t.Array(t.String()) }),
      detail: {
        summary: "Replace tags on a character card",
        security: [...bearerAuthSecurity],
      },
    },
  )
  .get(
    "/cards/:id/versions/:versionId/image",
    async ({ params, query, set }) => {
      const wantOriginal =
        query.original === "1" || query.original === "true";
      const charaImg = await getCharacterVersionImage(params.id, params.versionId, {
        original: wantOriginal,
      });
      if (charaImg) {
        return new Response(charaImg.bytes, {
          headers: {
            "content-type": charaImg.contentType,
            "cache-control": "public, max-age=3600",
          },
        });
      }

      set.status = 404;
      return new Response("Not found", { status: 404 });
    },
    {
      params: t.Object({
        id: t.String({ description: "Card id" }),
        versionId: t.String({ description: "Version id" }),
      }),
      query: t.Object({
        original: t.Optional(
          t.String({
            description:
              "Pass `1` or `true` for the original PNG; default is WebP preview",
          }),
        ),
      }),
      detail: {
        summary: "Download card image",
      },
    },
  );
