import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  consumeAuthClaim,
  createAuthClaim,
  saveOAuthPending,
  takeOAuthPending,
} from "../auth/oauth-store";
import { getDb } from "../db/client";
import { migrateDb } from "../db/migrate";
import { authClaims } from "../db/schema";

describe("oauth-store", () => {
  let dir: string;
  let dbPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "echbox-oauth-store-"));
    dbPath = join(dir, "test.db");
    process.env.DATABASE_PATH = dbPath;
    Bun.env.DATABASE_PATH = dbPath;
    migrateDb(dbPath);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("saveOAuthPending + takeOAuthPending round-trip", () => {
    saveOAuthPending(
      {
        state: "state-abc",
        codeVerifier: "verifier-xyz",
        desktop: true,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
      dbPath,
    );

    const taken = takeOAuthPending("state-abc", dbPath);
    expect(taken).toEqual({
      codeVerifier: "verifier-xyz",
      desktop: true,
      nonce: null,
    });
    expect(takeOAuthPending("state-abc", dbPath)).toBeNull();
  });

  test("takeOAuthPending returns null when expired", () => {
    saveOAuthPending(
      {
        state: "state-old",
        codeVerifier: "verifier-old",
        desktop: false,
        expiresAt: new Date(Date.now() - 1_000).toISOString(),
      },
      dbPath,
    );

    expect(takeOAuthPending("state-old", dbPath)).toBeNull();
  });

  test("createAuthClaim + consume once then second consume is null", () => {
    const sessionId = crypto.randomUUID();
    const token = createAuthClaim(sessionId, null, dbPath);
    expect(token.length).toBeGreaterThanOrEqual(32);

    expect(consumeAuthClaim(token, null, dbPath)).toBe(sessionId);
    expect(consumeAuthClaim(token, null, dbPath)).toBeNull();
  });

  test("consumeAuthClaim returns null when expired", () => {
    const sessionId = crypto.randomUUID();
    const token = createAuthClaim(sessionId, null, dbPath);
    getDb(dbPath)
      .update(authClaims)
      .set({ expiresAt: new Date(Date.now() - 1_000).toISOString() })
      .where(eq(authClaims.token, token))
      .run();

    expect(consumeAuthClaim(token, null, dbPath)).toBeNull();
  });

  test("consumeAuthClaim requires matching nonce when claim has one", () => {
    const sessionId = crypto.randomUUID();
    const token = createAuthClaim(sessionId, "nonce-abc", dbPath);
    expect(consumeAuthClaim(token, "wrong", dbPath)).toBeNull();
    expect(consumeAuthClaim(token, "nonce-abc", dbPath)).toBe(sessionId);
  });

  test("takeOAuthPending returns stored nonce", () => {
    saveOAuthPending(
      {
        state: "state-nonce",
        codeVerifier: "verifier",
        desktop: true,
        nonce: "login-nonce",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
      dbPath,
    );
    expect(takeOAuthPending("state-nonce", dbPath)).toEqual({
      codeVerifier: "verifier",
      desktop: true,
      nonce: "login-nonce",
    });
  });
});
