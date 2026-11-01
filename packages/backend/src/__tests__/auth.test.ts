import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { app } from "../app";
import { takeOAuthPending } from "../auth/oauth-store";
import {
  SESSION_COOKIE_NAME,
  createSession,
  getUserFromSessionCookie,
} from "../auth/session";
import { getDb } from "../db/client";
import { migrateDb } from "../db/migrate";
import { sessions, users } from "../db/schema";

describe("auth & sessions", () => {
  let dir: string;
  let dbPath: string;
  const origDbPath = process.env.DATABASE_PATH;
  const origClientId = process.env.DISCORD_CLIENT_ID;
  const origClientSecret = process.env.DISCORD_CLIENT_SECRET;
  const origRedirectUri = process.env.DISCORD_REDIRECT_URI;
  const origFrontendUrl = process.env.FRONTEND_URL;
  const origSessionSecret = process.env.SESSION_SECRET;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "echbox-auth-"));
    dbPath = join(dir, "test.db");
    process.env.DATABASE_PATH = dbPath;
    Bun.env.DATABASE_PATH = dbPath;
    process.env.DISCORD_CLIENT_ID = "test-client-id";
    Bun.env.DISCORD_CLIENT_ID = "test-client-id";
    process.env.DISCORD_CLIENT_SECRET = "test-client-secret";
    Bun.env.DISCORD_CLIENT_SECRET = "test-client-secret";
    process.env.DISCORD_REDIRECT_URI =
      "http://localhost:3001/api/auth/discord/callback";
    Bun.env.DISCORD_REDIRECT_URI =
      "http://localhost:3001/api/auth/discord/callback";
    process.env.FRONTEND_URL = "http://localhost:3000";
    Bun.env.FRONTEND_URL = "http://localhost:3000";
    process.env.SESSION_SECRET = "test-session-secret";
    Bun.env.SESSION_SECRET = "test-session-secret";

    migrateDb(dbPath);
  });

  afterEach(() => {
    if (origDbPath === undefined) {
      delete process.env.DATABASE_PATH;
      delete Bun.env.DATABASE_PATH;
    } else {
      process.env.DATABASE_PATH = origDbPath;
      Bun.env.DATABASE_PATH = origDbPath;
    }
    if (origClientId === undefined) {
      delete process.env.DISCORD_CLIENT_ID;
      delete Bun.env.DISCORD_CLIENT_ID;
    } else {
      process.env.DISCORD_CLIENT_ID = origClientId;
      Bun.env.DISCORD_CLIENT_ID = origClientId;
    }
    if (origClientSecret === undefined) {
      delete process.env.DISCORD_CLIENT_SECRET;
      delete Bun.env.DISCORD_CLIENT_SECRET;
    } else {
      process.env.DISCORD_CLIENT_SECRET = origClientSecret;
      Bun.env.DISCORD_CLIENT_SECRET = origClientSecret;
    }
    if (origRedirectUri === undefined) {
      delete process.env.DISCORD_REDIRECT_URI;
      delete Bun.env.DISCORD_REDIRECT_URI;
    } else {
      process.env.DISCORD_REDIRECT_URI = origRedirectUri;
      Bun.env.DISCORD_REDIRECT_URI = origRedirectUri;
    }
    if (origFrontendUrl === undefined) {
      delete process.env.FRONTEND_URL;
      delete Bun.env.FRONTEND_URL;
    } else {
      process.env.FRONTEND_URL = origFrontendUrl;
      Bun.env.FRONTEND_URL = origFrontendUrl;
    }
    if (origSessionSecret === undefined) {
      delete process.env.SESSION_SECRET;
      delete Bun.env.SESSION_SECRET;
    } else {
      process.env.SESSION_SECRET = origSessionSecret;
      Bun.env.SESSION_SECRET = origSessionSecret;
    }

    rmSync(dir, { recursive: true, force: true });
  });

  test("PRAGMA foreign_keys = ON is enforced in getDb", () => {
    const db = getDb(dbPath);
    expect(() =>
      db
        .insert(sessions)
        .values({
          id: crypto.randomUUID(),
          userId: "non-existent-user",
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        })
        .run(),
    ).toThrow();
  });

  test("session round-trip: createSession and getUserFromSessionCookie", async () => {
    const db = getDb(dbPath);
    const userId = crypto.randomUUID();
    db.insert(users)
      .values({
        id: userId,
        discordId: "discord-123",
        username: "koyuki",
        avatar: "https://cdn.discordapp.com/avatars/123/abc.png",
        createdAt: new Date().toISOString(),
      })
      .run();

    const { id, cookie } = await createSession(userId);
    expect(id.length).toBeGreaterThan(0);
    expect(cookie).toContain(`${SESSION_COOKIE_NAME}=${id}`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toMatch(/SameSite=Lax/i);

    const cookiePair = cookie.split(";")[0]!;
    const user = await getUserFromSessionCookie(cookiePair);
    expect(user).not.toBeNull();
    expect(user?.id).toBe(userId);
    expect(user?.discordId).toBe("discord-123");
    expect(user?.username).toBe("koyuki");

    // Unsigned cookie must be rejected when SESSION_SECRET is set
    const unsigned = await getUserFromSessionCookie(`${SESSION_COOKIE_NAME}=${id}`);
    expect(unsigned).toBeNull();

    const none = await getUserFromSessionCookie(null);
    expect(none).toBeNull();

    const invalid = await getUserFromSessionCookie(
      `${SESSION_COOKIE_NAME}=does-not-exist`,
    );
    expect(invalid).toBeNull();
  });

  test("expired session returns null", async () => {
    const db = getDb(dbPath);
    const userId = crypto.randomUUID();
    db.insert(users)
      .values({
        id: userId,
        discordId: "discord-exp",
        username: "expired_user",
        avatar: null,
        createdAt: new Date().toISOString(),
      })
      .run();

    const { id: sessionId, cookie } = await createSession(userId);
    db.update(sessions)
      .set({
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      })
      .run();

    const user = await getUserFromSessionCookie(cookie.split(";")[0]!);
    expect(user).toBeNull();
    expect(sessionId.length).toBeGreaterThan(0);
  });

  test("GET /api/auth/me returns 401 without cookie and 200 with valid session", async () => {
    const unauthRes = await app.handle(
      new Request("http://localhost/api/auth/me"),
    );
    expect(unauthRes.status).toBe(401);

    const db = getDb(dbPath);
    const userId = crypto.randomUUID();
    db.insert(users)
      .values({
        id: userId,
        discordId: "discord-456",
        username: "noa",
        avatar: "avatar_hash",
        createdAt: new Date().toISOString(),
      })
      .run();

    const { cookie } = await createSession(userId);
    const cookiePair = cookie.split(";")[0]!;

    const authRes = await app.handle(
      new Request("http://localhost/api/auth/me", {
        headers: {
          cookie: cookiePair,
        },
      }),
    );
    expect(authRes.status).toBe(200);
    const body = (await authRes.json()) as {
      id: string;
      discordId: string;
      username: string;
      avatar: string | null;
    };
    expect(body.id).toBe(userId);
    expect(body.discordId).toBe("discord-456");
    expect(body.username).toBe("noa");
    expect(body.avatar).toBe("avatar_hash");
  });

  test("POST /api/auth/logout revokes session and clears cookie", async () => {
    const db = getDb(dbPath);
    const userId = crypto.randomUUID();
    db.insert(users)
      .values({
        id: userId,
        discordId: "discord-789",
        username: "yuuka",
        avatar: null,
        createdAt: new Date().toISOString(),
      })
      .run();

    const { cookie } = await createSession(userId);
    const cookiePair = cookie.split(";")[0]!;

    const logoutRes = await app.handle(
      new Request("http://localhost/api/auth/logout", {
        method: "POST",
        headers: {
          cookie: cookiePair,
        },
      }),
    );
    expect(logoutRes.status).toBe(200);
    const setCookie = logoutRes.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(setCookie).toContain("Max-Age=0");

    const afterMe = await app.handle(
      new Request("http://localhost/api/auth/me", {
        headers: {
          cookie: cookiePair,
        },
      }),
    );
    expect(afterMe.status).toBe(401);
  });

  test("GET /api/auth/discord redirects to Discord authorize URL with state cookie", async () => {
    const res = await app.handle(
      new Request("http://localhost/api/auth/discord"),
    );
    expect(res.status).toBe(302);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("https://discord.com/oauth2/authorize");
    expect(location).toContain("client_id=test-client-id");
    expect(location).toContain("scope=identify");
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("discord_oauth_state=");
  });

  test("GET /api/auth/discord?desktop=1 returns JSON url and stores pending without oauth cookies", async () => {
    const res = await app.handle(
      new Request("http://localhost/api/auth/discord?desktop=1"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { url: string };
    expect(body.url).toContain("https://discord.com/oauth2/authorize");
    expect(body.url).toContain("client_id=test-client-id");
    expect(body.url).toContain("scope=identify");

    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).not.toContain("discord_oauth_state=");

    const state = new URL(body.url).searchParams.get("state");
    expect(state).toBeTruthy();
    const pending = takeOAuthPending(state!, dbPath);
    expect(pending).not.toBeNull();
    expect(pending?.desktop).toBe(true);
    expect(pending?.codeVerifier.length).toBeGreaterThan(0);
  });

  test("GET /api/auth/discord/callback exchanges mocked token, upserts user, sets session cookie, and redirects", async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof Request
            ? input.url
            : input.toString();
      if (url.includes("/oauth2/token")) {
        return new Response(
          JSON.stringify({
            access_token: "mock-access-token",
            token_type: "Bearer",
            expires_in: 3600,
            scope: "identify",
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }
      if (url.includes("/users/@me")) {
        return new Response(
          JSON.stringify({
            id: "discord-cb-999",
            username: "rio",
            global_name: "Rio Tsukatsuki",
            avatar: "rio_avatar",
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }
      return origFetch(input);
    }) as typeof fetch;

    try {
      const callbackRes = await app.handle(
        new Request(
          "http://localhost/api/auth/discord/callback?code=mock-code&state=mock-state",
          {
            headers: {
              cookie:
                "discord_oauth_state=mock-state; discord_oauth_verifier=mock-verifier",
            },
          },
        ),
      );

      expect(callbackRes.status).toBe(302);
      expect(callbackRes.headers.get("location")).toBe(
        "http://localhost:3000/",
      );

      const cookies = callbackRes.headers.getSetCookie?.() ?? [
        callbackRes.headers.get("set-cookie") ?? "",
      ];
      const sessionSetCookie =
        cookies.find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`)) ?? "";
      expect(sessionSetCookie).toContain(`${SESSION_COOKIE_NAME}=`);

      const sessionCookiePair = sessionSetCookie.split(";")[0] ?? "";
      const meRes = await app.handle(
        new Request("http://localhost/api/auth/me", {
          headers: {
            cookie: sessionCookiePair,
          },
        }),
      );
      expect(meRes.status).toBe(200);
      const meBody = (await meRes.json()) as {
        discordId: string;
        username: string;
        avatar: string | null;
      };
      expect(meBody.discordId).toBe("discord-cb-999");
      expect(meBody.username).toBe("Rio Tsukatsuki");
      expect(meBody.avatar).toBe(
        "https://cdn.discordapp.com/avatars/discord-cb-999/rio_avatar.png",
      );
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  test("desktop callback redirects to echbox claim deep link; claim sets session once", async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof Request
            ? input.url
            : input.toString();
      if (url.includes("/oauth2/token")) {
        return new Response(
          JSON.stringify({
            access_token: "mock-access-token",
            token_type: "Bearer",
            expires_in: 3600,
            scope: "identify",
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }
      if (url.includes("/users/@me")) {
        return new Response(
          JSON.stringify({
            id: "discord-desktop-111",
            username: "hoshino",
            global_name: "Hoshino",
            avatar: "hoshino_avatar",
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }
      return origFetch(input);
    }) as typeof fetch;

    try {
      const startRes = await app.handle(
        new Request("http://localhost/api/auth/discord?desktop=1"),
      );
      const { url } = (await startRes.json()) as { url: string };
      const state = new URL(url).searchParams.get("state")!;

      const callbackRes = await app.handle(
        new Request(
          `http://localhost/api/auth/discord/callback?code=mock-code&state=${encodeURIComponent(state)}`,
        ),
      );
      expect(callbackRes.status).toBe(302);
      const location = callbackRes.headers.get("location") ?? "";
      expect(location.startsWith("echbox://auth/callback?token=")).toBe(true);
      const token = new URL(location).searchParams.get("token");
      expect(token).toBeTruthy();

      const claimRes = await app.handle(
        new Request("http://localhost/api/auth/claim", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token }),
        }),
      );
      expect(claimRes.status).toBe(200);
      const claimBody = (await claimRes.json()) as { ok: boolean };
      expect(claimBody.ok).toBe(true);

      const cookies = claimRes.headers.getSetCookie?.() ?? [
        claimRes.headers.get("set-cookie") ?? "",
      ];
      const sessionSetCookie =
        cookies.find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`)) ?? "";
      expect(sessionSetCookie).toContain(`${SESSION_COOKIE_NAME}=`);
      const sessionCookiePair = sessionSetCookie.split(";")[0] ?? "";

      const meRes = await app.handle(
        new Request("http://localhost/api/auth/me", {
          headers: { cookie: sessionCookiePair },
        }),
      );
      expect(meRes.status).toBe(200);
      const meBody = (await meRes.json()) as { discordId: string; username: string };
      expect(meBody.discordId).toBe("discord-desktop-111");
      expect(meBody.username).toBe("Hoshino");

      const secondClaim = await app.handle(
        new Request("http://localhost/api/auth/claim", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token }),
        }),
      );
      expect(secondClaim.status).toBe(400);
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});
