import { app } from "./app";
import { clearProxyTemp } from "./proxy/temp";

const PORT = Number(process.env.PORT ?? 3001);

await clearProxyTemp();

app.listen(PORT);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`,
);

export type { App } from "./app";
