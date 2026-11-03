import { Elysia, t } from "elysia";
import {
  type CharacterCardDetail,
  CardServiceError,
  DuplicateCardHashError,
  DuplicateCardSemverError,
  addVersion,
  createCard,
  deleteCard,
  findByHash,
  getCard as getCharacterCard,
  getVersionImage as getCharacterVersionImage,
  listCharacters,
  patchCard,
} from "../cards/service";
import { setCardVote } from "../cards/votes";
import { GameServiceError } from "../games/service";
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

export const galleryRoutes = new Elysia({ prefix: "/api/kk" })
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
        hash: t.String(),
      }),
    },
  )
  .get(
    "/cards",
    async ({ query, user }) => {
      const viewerUserId = user?.id ?? null;
      const gameId = query.gameId;
      if (query.type === "character") {
        const cards = await listCharacters({ viewerUserId, gameId });
        return { cards };
      }
      if (query.type === "scene") {
        return { cards: [] };
      }
      const cards = await listCharacters({ viewerUserId, gameId });
      return { cards };
    },
    {
      query: t.Object({
        type: t.Optional(
          t.Union([t.Literal("character"), t.Literal("scene")]),
        ),
        gameId: t.Optional(t.String()),
      }),
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
          authorId: user.id,
          gameId: body.gameId,
          title: body.title,
          slug: body.slug,
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
        id: t.String(),
      }),
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
        id: t.String(),
      }),
      body: t.Object({
        vote: t.Union([t.Literal("like"), t.Literal("dislike"), t.Null()]),
      }),
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
          authorId: user.id,
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
    "/cards/:id",
    async ({ params, body, user, set }) => {
      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }
      try {
        const patched = await patchCard({
          cardId: params.id,
          authorId: user.id,
          title: body.title,
          slug: body.slug,
          notes: body.notes,
        });
        return stripCardPaths(patched);
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
    "/cards/:id",
    async ({ params, user, set }) => {
      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }
      try {
        return await deleteCard({
          cardId: params.id,
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
        id: t.String(),
        versionId: t.String(),
      }),
      query: t.Object({
        original: t.Optional(t.String()),
      }),
    },
  );
