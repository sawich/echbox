import type { ApiClient } from "~/utils/api";
import { createApi } from "~/utils/api";

let client: ApiClient | undefined;

export function useApi() {
  if (!client) {
    const config = useRuntimeConfig();
    client = createApi(config.public.apiUrl);
  }

  return client;
}
