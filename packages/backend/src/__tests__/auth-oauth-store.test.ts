import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  consumeAuthClaim,
  createAuthClaim,
  saveOAuthPending,
  takeOAuthPending,
} from "../auth/oauth-store";
import { migrateDb } from "../db/migrate";

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
    const token = createAuthClaim(sessionId, dbPath);
    expect(token.length).toBeGreaterThanOrEqual(32);

    expect(consumeAuthClaim(token, dbPath)).toBe(sessionId);
    expect(consumeAuthClaim(token, dbPath)).toBeNull();
  });
});
