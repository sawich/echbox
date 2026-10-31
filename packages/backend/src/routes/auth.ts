import { eq } from "drizzle-orm";
import { Elysia } from "elysia";
import {
  createDiscordAuthUrl,
  exchangeDiscordCodeForUser,
} from "../auth/discord";
import {
  type User,
  buildBlankSessionCookie,
  createSession,
  getUserFromSessionCookie,
  parseCookies,
  revokeSessionFromCookie,
  serializeCookie,
} from "../auth/session";
import { getDb } from "../db/client";
import { users } from "../db/schema";

const OAUTH_STATE_COOKIE = "discord_oauth_state";
const OAUTH_VERIFIER_COOKIE = "discord_oauth_verifier";
const OAUTH_COOKIE_MAX_AGE = 60 * 10; // 10 minutes

export const authDerive = new Elysia({ name: "auth-derive" }).derive(
  { as: "global" },
  async ({ request }): Promise<{ user: User | null }> => {
    const cookieHeader = request.headers.get("cookie");
    const user = await getUserFromSessionCookie(cookieHeader);
    return { user };
  },
);

export function upsertDiscordUser(profile: {
  discordId: string;
  username: string;
  avatar: string | null;
}): User {
  const db = getDb();
  const existing = db
    .select()
    .from(users)
    .where(eq(users.discordId, profile.discordId))
    .get();

  if (existing) {
    db.update(users)
      .set({
        username: profile.username,
        avatar: profile.avatar,
      })
      .where(eq(users.id, existing.id))
      .run();

    return {
      ...existing,
      username: profile.username,
      avatar: profile.avatar,
    };
  }

  const newUser: User = {
    id: crypto.randomUUID(),
    discordId: profile.discordId,
    username: profile.username,
    avatar: profile.avatar,
    createdAt: new Date().toISOString(),
  };

  db.insert(users).values(newUser).run();
  return newUser;
}

export const authRoutes = new Elysia({ prefix: "/api/auth" })
  .use(authDerive)
  .get("/discord", () => {
    const { url, state, codeVerifier } = createDiscordAuthUrl();
    const headers = new Headers();
    headers.set("Location", url.toString());
    headers.append(
      "Set-Cookie",
      serializeCookie(OAUTH_STATE_COOKIE, state, {
        maxAge: OAUTH_COOKIE_MAX_AGE,
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      }),
    );
    headers.append(
      "Set-Cookie",
      serializeCookie(OAUTH_VERIFIER_COOKIE, codeVerifier, {
        maxAge: OAUTH_COOKIE_MAX_AGE,
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      }),
    );
    return new Response(null, { status: 302, headers });
  })
  .get("/discord/callback", async ({ request, query, set }) => {
    const code = typeof query.code === "string" ? query.code : null;
    const state = typeof query.state === "string" ? query.state : null;
    const cookies = parseCookies(request.headers.get("cookie"));
    const storedState = cookies[OAUTH_STATE_COOKIE] ?? null;
    const codeVerifier = cookies[OAUTH_VERIFIER_COOKIE] ?? null;

    if (!code || !state || !storedState || state !== storedState) {
      set.status = 400;
      return { error: "Invalid OAuth state or missing code" };
    }

    try {
      const profile = await exchangeDiscordCodeForUser(code, codeVerifier);
      const user = upsertDiscordUser(profile);
      const { cookie } = await createSession(user.id);

      const frontendUrl = (
        Bun.env.FRONTEND_URL ??
        process.env.FRONTEND_URL ??
        "http://localhost:3000"
      ).replace(/\/+$/, "");

      const headers = new Headers();
      headers.set("Location", `${frontendUrl}/`);
      headers.append("Set-Cookie", cookie);
      headers.append(
        "Set-Cookie",
        serializeCookie(OAUTH_STATE_COOKIE, "", { maxAge: 0, path: "/" }),
      );
      headers.append(
        "Set-Cookie",
        serializeCookie(OAUTH_VERIFIER_COOKIE, "", { maxAge: 0, path: "/" }),
      );

      return new Response(null, { status: 302, headers });
    } catch {
      set.status = 400;
      return { error: "Discord authentication failed" };
    }
  })
  .post("/logout", async ({ request }) => {
    const cookieHeader = request.headers.get("cookie");
    await revokeSessionFromCookie(cookieHeader);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "set-cookie": buildBlankSessionCookie(),
      },
    });
  })
  .get("/me", ({ user, set }) => {
    if (!user) {
      set.status = 401;
      return { error: "Unauthorized" };
    }
    return user;
  });
