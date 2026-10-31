import { treaty } from "@elysiajs/eden";
import type { App } from "backend/app";

export type ApiClient = ReturnType<typeof createApi>;

export function createApi(baseUrl: string) {
  return treaty<App>(baseUrl, {
    fetch: {
      credentials: "include",
    },
  });
}
