import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";
import {
  EchoBodySchema,
  EchoResponseSchema,
  HealthResponseSchema,
} from "@echbox/shared";
import { openapiPlugin } from "./openapi";
import { apiKeyRoutes } from "./routes/api-keys";
import { authRoutes } from "./routes/auth";
import { galleryRoutes } from "./routes/gallery";
import { gameRoutes } from "./routes/games";
import { kkloaderRoutes } from "./routes/kkloader";
import { pluginRoutes } from "./routes/plugins";
import { clothesRoutes } from "./routes/clothes";
import { sceneRoutes } from "./routes/scenes";
import { softmodRoutes } from "./routes/softmods";
import { tagRoutes } from "./routes/tags";
import { userRoutes } from "./routes/users";

export const app = new Elysia()
  .use(
    cors({
      origin: true,
      credentials: true,
    }),
  )
  .use(openapiPlugin)
  .use(authRoutes)
  .use(apiKeyRoutes)
  .use(userRoutes)
  .use(gameRoutes)
  .use(kkloaderRoutes)
  .use(galleryRoutes)
  .use(sceneRoutes)
  .use(clothesRoutes)
  .use(softmodRoutes)
  .use(pluginRoutes)
  .use(tagRoutes)
  .get("/", () => "Hello Elysia", {
    detail: { hide: true },
  })
  .get(
    "/health",
    () =>
      ({
        status: "ok" as const,
        timestamp: new Date().toISOString(),
      }),
    {
      response: HealthResponseSchema,
      detail: {
        summary: "Health check",
        tags: ["System"],
      },
    },
  )
  .post(
    "/echo",
    ({ body }) => ({
      echo: body.message,
    }),
    {
      body: EchoBodySchema,
      response: EchoResponseSchema,
      detail: { hide: true },
    },
  );

export type App = typeof app;
