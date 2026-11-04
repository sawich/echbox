import { Elysia, t } from "elysia";
import { getUserProfile } from "../users/service";
import { authDerive } from "./auth";

export const userRoutes = new Elysia({
  prefix: "/api/users",
  detail: { hide: true },
})
  .use(authDerive)
  .get(
    "/:id",
    async ({ params, user, set }) => {
      const profile = await getUserProfile(params.id, {
        viewerUserId: user?.id ?? null,
      });
      if (!profile) {
        set.status = 404;
        return { error: "User not found" };
      }
      return profile;
    },
    {
      params: t.Object({
        id: t.String(),
      }),
    },
  );
