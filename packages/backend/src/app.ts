import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";
import {
  EchoBodySchema,
  EchoResponseSchema,
  HealthResponseSchema,
} from "@echbox/shared";
import { authRoutes } from "./routes/auth";
import { galleryRoutes } from "./routes/gallery";
import { kkloaderRoutes } from "./routes/kkloader";
import { pluginRoutes } from "./routes/plugins";
import { sceneRoutes } from "./routes/scenes";
import { softmodRoutes } from "./routes/softmods";
import { userRoutes } from "./routes/users";

export const app = new Elysia()
  .use(
    cors({
      origin: true,
      credentials: true,
    }),
  )
  .use(authRoutes)
  .use(userRoutes)
  .use(kkloaderRoutes)
  .use(galleryRoutes)
  .use(sceneRoutes)
  .use(softmodRoutes)
  .use(pluginRoutes)
  .get("/", () => "Hello Elysia")
  .get(
    "/health",
    () =>
      ({
        status: "ok" as const,
        timestamp: new Date().toISOString(),
      }),
    {
      response: HealthResponseSchema,
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
    },
  );

export type App = typeof app;
