import type { TagCategory } from "@echbox/shared";
import { Elysia, t } from "elysia";
import { isAdmin } from "../auth/admin";
import { parsePagination } from "../common/pagination";
import { tagsFromQuery } from "../common/list-query-schema";
import { bearerAuthSecurity } from "../openapi";
import {
  addAlias,
  createTag,
  deleteTag,
  getTag,
  listTags,
  setTagVote,
  suggestTags,
  updateTag,
} from "../tags/service";
import { authDerive } from "./auth";
import { handleTagError } from "./content-tags";

const tagCategory = t.Union([
  t.Literal("author"),
  t.Literal("license"),
  t.Literal("character"),
  t.Literal("franchise"),
  t.Literal("general"),
]);

const tagResponse = t.Object({
  id: t.String(),
  name: t.String(),
  category: tagCategory,
  aliases: t.Array(t.String()),
  likes: t.Number(),
  dislikes: t.Number(),
  myVote: t.Union([t.Literal("like"), t.Literal("dislike"), t.Null()]),
  usageCount: t.Number(),
});

const tagSuggestResponse = t.Object({
  id: t.String(),
  name: t.String(),
  category: tagCategory,
  matchedAlias: t.Union([t.String(), t.Null()]),
});

function actorOf(user: { id: string; discordId: string }) {
  return { userId: user.id, isAdmin: isAdmin(user) };
}

export const tagRoutes = new Elysia({
  prefix: "/api/tags",
  tags: ["Tags"],
})
  .use(authDerive)
  .get(
    "/suggest",
    ({ query }) => ({
      tags: suggestTags({
        q: query.q ?? "",
        limit: query.limit,
        excludeNames: tagsFromQuery(query.exclude),
      }),
    }),
    {
      query: t.Object({
        q: t.Optional(t.String({ description: "Prefix matched against name and alias" })),
        limit: t.Optional(t.Numeric({ minimum: 1, maximum: 50 })),
        exclude: t.Optional(t.Union([t.String(), t.Array(t.String())])),
      }),
      response: t.Object({ tags: t.Array(tagSuggestResponse) }),
      detail: { summary: "Suggest tags by prefix" },
    },
  )
  .get(
    "/",
    ({ query, user }) => {
      const { page, limit } = parsePagination(query);
      const result = listTags({
        page,
        limit,
        q: query.q,
        sort: query.sort,
        viewerUserId: user?.id ?? null,
      });
      return {
        tags: result.items,
        total: result.total,
        page: result.page,
        limit: result.limit,
      };
    },
    {
      query: t.Object({
        page: t.Optional(t.Numeric({ minimum: 1 })),
        limit: t.Optional(t.Numeric({ minimum: 1, maximum: 100 })),
        q: t.Optional(t.String()),
        sort: t.Optional(
          t.Union([t.Literal("recent"), t.Literal("top"), t.Literal("name")]),
        ),
      }),
      detail: { summary: "Browse tags" },
    },
  )
  .post(
    "/",
    ({ body, user, set }) => {
      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }
      try {
        const created = createTag({
          name: body.name,
          category: body.category as TagCategory,
          actor: actorOf(user),
        });
        set.status = 201;
        return created;
      } catch (err) {
        return handleTagError(err, set);
      }
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1 }),
        category: tagCategory,
      }),
      detail: {
        summary: "Create a tag",
        description:
          "Any logged-in user can create a tag in any category. Names must be unique.",
        security: [...bearerAuthSecurity],
      },
    },
  )
  .get(
    "/:id",
    ({ params, user, set }) => {
      try {
        return getTag(params.id, { viewerUserId: user?.id ?? null });
      } catch (err) {
        return handleTagError(err, set);
      }
    },
    {
      params: t.Object({ id: t.String() }),
      detail: { summary: "Get a tag by id or name" },
    },
  )
  .post(
    "/:id/aliases",
    ({ params, body, user, set }) => {
      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }
      try {
        const created = addAlias({
          tagId: params.id,
          alias: body.alias,
          actor: actorOf(user),
        });
        set.status = 201;
        return created;
      } catch (err) {
        return handleTagError(err, set);
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({ alias: t.String({ minLength: 1 }) }),
      detail: {
        summary: "Add a tag alias",
        security: [...bearerAuthSecurity],
      },
    },
  )
  .patch(
    "/:id",
    ({ params, body, user, set }) => {
      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }
      try {
        return updateTag({
          tagId: params.id,
          name: body.name,
          category: body.category as TagCategory | undefined,
          aliases: body.aliases,
          actor: actorOf(user),
        });
      } catch (err) {
        return handleTagError(err, set);
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        name: t.Optional(t.String({ minLength: 1 })),
        category: t.Optional(tagCategory),
        aliases: t.Optional(t.Array(t.String({ minLength: 1 }))),
      }),
      detail: {
        summary: "Update tag name, category, and/or aliases",
        security: [...bearerAuthSecurity],
      },
    },
  )
  .delete(
    "/:id",
    ({ params, user, set }) => {
      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }
      try {
        deleteTag({ tagId: params.id, actor: actorOf(user) });
        return { ok: true as const };
      } catch (err) {
        return handleTagError(err, set);
      }
    },
    {
      params: t.Object({ id: t.String() }),
      detail: {
        summary: "Delete a tag",
        security: [...bearerAuthSecurity],
      },
    },
  )
  .put(
    "/:id/vote",
    ({ params, body, user, set }) => {
      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }
      try {
        return setTagVote({
          tagId: params.id,
          userId: user.id,
          vote: body.vote,
        });
      } catch (err) {
        return handleTagError(err, set);
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        vote: t.Union([t.Literal("like"), t.Literal("dislike"), t.Null()]),
      }),
      detail: {
        summary: "Vote on a tag",
        security: [...bearerAuthSecurity],
      },
    },
  );
