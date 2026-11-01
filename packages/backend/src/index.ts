import { app } from "./app";

const PORT = Number(process.env.PORT ?? 3001);

app.listen(PORT);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`,
);

export type { App } from "./app";
