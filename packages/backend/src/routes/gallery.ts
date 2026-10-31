import { Elysia, t } from "elysia";
import { createGalleryService } from "../gallery/service";

const gallery = createGalleryService();

export const galleryRoutes = new Elysia({ prefix: "/api/kk" })
  .get(
    "/cards",
    async ({ query }) => {
      const cards = await gallery.listCards(query.type);
      return { cards };
    },
    {
      query: t.Object({
        type: t.Optional(
          t.Union([t.Literal("character"), t.Literal("scene")]),
        ),
      }),
    },
  )
  .get(
    "/cards/:id",
    async ({ params, set }) => {
      const card = await gallery.getCard(params.id);
      if (!card) {
        set.status = 404;
        return { error: "Card not found" };
      }
      return card;
    },
    {
      params: t.Object({
        id: t.String(),
      }),
    },
  )
  .get(
    "/cards/:id/versions/:version/image",
    async ({ params, set }) => {
      const version = Number(params.version);
      if (!Number.isInteger(version) || version < 1) {
        set.status = 404;
        return new Response("Not found", { status: 404 });
      }
      const bytes = await gallery.getVersionImage(params.id, version);
      if (!bytes) {
        set.status = 404;
        return new Response("Not found", { status: 404 });
      }
      return new Response(bytes, {
        headers: {
          "content-type": "image/png",
          "cache-control": "public, max-age=3600",
        },
      });
    },
    {
      params: t.Object({
        id: t.String(),
        version: t.String(),
      }),
    },
  );
