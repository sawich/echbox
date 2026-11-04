import { Elysia, t } from "elysia";
import { KoikatuCharaData, KoikatuSceneData } from "../kkloader";

async function readUpload(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

export const kkloaderRoutes = new Elysia({
  prefix: "/api/kk",
  tags: ["Cards"],
})
  .post(
    "/chara",
    async ({ body }) => {
      const bytes = await readUpload(body.file);
      const chara = await KoikatuCharaData.load(bytes);
      return {
        summary: chara.summary(),
        data: body.full ? chara.toJSON(false) : undefined,
      };
    },
    {
      body: t.Object(
        {
          file: t.File({ description: "Character card PNG" }),
          full: t.Optional(
            t.BooleanString({
              description: "If true, include full parsed data JSON",
            }),
          ),
        },
        { description: "multipart/form-data — parse only, does not upload" },
      ),
      detail: {
        summary: "Parse character card",
        description:
          "Returns `summary.name` and related fields without storing the file.",
      },
    },
  )
  .post(
    "/scene",
    async ({ body }) => {
      const bytes = await readUpload(body.file);
      const scene = await KoikatuSceneData.load(bytes);
      return {
        summary: scene.summary(),
        data: body.full ? scene.toJSON() : undefined,
      };
    },
    {
      body: t.Object(
        {
          file: t.File({ description: "Studio scene PNG" }),
          full: t.Optional(t.BooleanString()),
        },
        { description: "multipart/form-data — parse only" },
      ),
      detail: {
        summary: "Parse studio scene",
        description: "Scenes have no embedded title in the binary summary.",
      },
    },
  );
