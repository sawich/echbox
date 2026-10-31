import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";
import {
  EchoBodySchema,
  EchoResponseSchema,
  HealthResponseSchema,
} from "@echbox/shared";
import { galleryRoutes } from "./routes/gallery";
import { kkloaderRoutes } from "./routes/kkloader";

export const app = new Elysia()
  .use(
    cors({
      origin: true,
      credentials: true,
    }),
  )
  .use(kkloaderRoutes)
  .use(galleryRoutes)
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
