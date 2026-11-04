import { Elysia, t } from "elysia";
import {
  ApiKeyError,
  createApiKey,
  listApiKeys,
  revokeApiKey,
} from "../api-keys/service";
import { cookieAuthSecurity } from "../openapi";
import { authDerive } from "./auth";

export const apiKeyRoutes = new Elysia({
  prefix: "/api/me/api-keys",
  tags: ["API Keys"],
})
  .use(authDerive)
  .get(
    "/",
    ({ user, authSource, set }) => {
      if (!user || authSource !== "session") {
        set.status = 401;
        return { error: "Unauthorized" };
      }
      return { keys: listApiKeys({ userId: user.id }) };
    },
    {
      detail: {
        summary: "List API keys",
        description:
          "Returns metadata for the current user’s keys (secrets are never listed). Requires Discord session cookie — Bearer API keys cannot manage keys.",
        security: [...cookieAuthSecurity],
      },
    },
  )
  .post(
    "/",
    ({ body, user, authSource, set }) => {
      if (!user || authSource !== "session") {
        set.status = 401;
        return { error: "Unauthorized" };
      }
      try {
        const created = createApiKey({ userId: user.id, name: body.name });
        set.status = 201;
        return created;
      } catch (err) {
        if (err instanceof ApiKeyError) {
          set.status = err.status;
          return { error: err.message };
        }
        throw err;
      }
    },
    {
      body: t.Object(
        {
          name: t.String({
            minLength: 1,
            maxLength: 80,
            description: "Label for this key (e.g. app or script name)",
          }),
        },
        { description: "Create a new personal API key" },
      ),
      detail: {
        summary: "Create API key",
        description:
          "Returns the full `key` once. Store it securely; it cannot be retrieved again.",
        security: [...cookieAuthSecurity],
      },
    },
  )
  .delete(
    "/:id",
    ({ params, user, authSource, set }) => {
      if (!user || authSource !== "session") {
        set.status = 401;
        return { error: "Unauthorized" };
      }
      try {
        revokeApiKey({ userId: user.id, keyId: params.id });
        return { ok: true as const };
      } catch (err) {
        if (err instanceof ApiKeyError) {
          set.status = err.status;
          return { error: err.message };
        }
        throw err;
      }
    },
    {
      params: t.Object({
        id: t.String({ description: "API key id" }),
      }),
      detail: {
        summary: "Revoke API key",
        security: [...cookieAuthSecurity],
      },
    },
  );
