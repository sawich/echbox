import { Elysia, t } from "elysia";
import { KoikatuCharaData, KoikatuSceneData } from "../kkloader";

async function readUpload(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

export const kkloaderRoutes = new Elysia({ prefix: "/api/kk" })
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
      body: t.Object({
        file: t.File(),
        full: t.Optional(t.BooleanString()),
      }),
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
      body: t.Object({
        file: t.File(),
        full: t.Optional(t.BooleanString()),
      }),
    },
  );
