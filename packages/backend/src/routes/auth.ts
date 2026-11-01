import { eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import {
  createDiscordAuthUrl,
  exchangeDiscordCodeForUser,
} from "../auth/discord";
import {
  consumeAuthClaim,
  createAuthClaim,
  saveOAuthPending,
  takeOAuthPending,
} from "../auth/oauth-store";
import {
  type User,
  buildBlankSessionCookie,
  createSession,
  getUserFromSessionCookie,
  parseCookies,
  revokeSessionFromCookie,
  serializeCookie,
  serializeSessionCookie,
} from "../auth/session";
import { getDb } from "../db/client";
import { users } from "../db/schema";

const OAUTH_STATE_COOKIE = "discord_oauth_state";
const OAUTH_VERIFIER_COOKIE = "discord_oauth_verifier";
const OAUTH_COOKIE_MAX_AGE = 60 * 10; // 10 minutes

function desktopAuthScheme(): string {
  return (
    Bun.env.DESKTOP_AUTH_SCHEME ??
    process.env.DESKTOP_AUTH_SCHEME ??
    "echbox"
  );
}

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
  .get("/discord", ({ query }) => {
    const desktop = query.desktop === "1" || query.desktop === "true";

    const { url, state, codeVerifier } = createDiscordAuthUrl();

    if (desktop) {
      saveOAuthPending({
        state,
        codeVerifier,
        desktop: true,
        expiresAt: new Date(
          Date.now() + OAUTH_COOKIE_MAX_AGE * 1000,
        ).toISOString(),
      });
      return Response.json({ url: url.toString() });
    }

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
    const cookieVerifier = cookies[OAUTH_VERIFIER_COOKIE] ?? null;

    if (!code || !state) {
      set.status = 400;
      return { error: "Invalid OAuth state or missing code" };
    }

    let codeVerifier: string | null = null;
    let desktop = false;

    if (storedState && state === storedState) {
      codeVerifier = cookieVerifier;
      desktop = false;
    } else {
      const pending = takeOAuthPending(state);
      if (!pending) {
        set.status = 400;
        return { error: "Invalid OAuth state or missing code" };
      }
      codeVerifier = pending.codeVerifier;
      desktop = pending.desktop;
    }

    try {
      const profile = await exchangeDiscordCodeForUser(code, codeVerifier);
      const user = upsertDiscordUser(profile);
      const { id: sessionId, cookie } = await createSession(user.id);

      const headers = new Headers();
      headers.append(
        "Set-Cookie",
        serializeCookie(OAUTH_STATE_COOKIE, "", { maxAge: 0, path: "/" }),
      );
      headers.append(
        "Set-Cookie",
        serializeCookie(OAUTH_VERIFIER_COOKIE, "", { maxAge: 0, path: "/" }),
      );

      if (desktop) {
        const token = createAuthClaim(sessionId);
        const scheme = desktopAuthScheme();
        headers.set(
          "Location",
          `${scheme}://auth/callback?token=${encodeURIComponent(token)}`,
        );
        return new Response(null, { status: 302, headers });
      }

      const frontendUrl = (
        Bun.env.FRONTEND_URL ??
        process.env.FRONTEND_URL ??
        "http://localhost:3000"
      ).replace(/\/+$/, "");

      headers.set("Location", `${frontendUrl}/`);
      headers.append("Set-Cookie", cookie);
      return new Response(null, { status: 302, headers });
    } catch {
      set.status = 400;
      return { error: "Discord authentication failed" };
    }
  })
  .post(
    "/claim",
    ({ body, set }) => {
      const sessionId = consumeAuthClaim(body.token);
      if (!sessionId) {
        set.status = 400;
        return { error: "Invalid or expired claim token" };
      }

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "set-cookie": serializeSessionCookie(sessionId),
        },
      });
    },
    {
      body: t.Object({
        token: t.String(),
      }),
    },
  )
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
