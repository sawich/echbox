import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { authClaims, oauthPending } from "../db/schema";

export const AUTH_CLAIM_TTL_SECONDS = 60 * 5;

export function saveOAuthPending(
  input: {
    state: string;
    codeVerifier: string;
    desktop: boolean;
    expiresAt: string;
  },
  dbPath?: string,
): void {
  const db = getDb(dbPath);
  db.insert(oauthPending)
    .values({
      state: input.state,
      codeVerifier: input.codeVerifier,
      desktop: input.desktop ? 1 : 0,
      expiresAt: input.expiresAt,
    })
    .run();
}

export function takeOAuthPending(
  state: string,
  dbPath?: string,
): { codeVerifier: string; desktop: boolean } | null {
  const db = getDb(dbPath);
  const row = db
    .select()
    .from(oauthPending)
    .where(eq(oauthPending.state, state))
    .get();

  if (!row) return null;

  db.delete(oauthPending).where(eq(oauthPending.state, state)).run();

  const expiresMs = Date.parse(row.expiresAt);
  if (Number.isNaN(expiresMs) || expiresMs <= Date.now()) {
    return null;
  }

  return {
    codeVerifier: row.codeVerifier,
    desktop: row.desktop === 1,
  };
}

export function createAuthClaim(sessionId: string, dbPath?: string): string {
  const db = getDb(dbPath);
  const token = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString(
    "base64url",
  );
  const expiresAt = new Date(
    Date.now() + AUTH_CLAIM_TTL_SECONDS * 1000,
  ).toISOString();

  db.insert(authClaims)
    .values({
      token,
      sessionId,
      expiresAt,
      usedAt: null,
    })
    .run();

  return token;
}

export function consumeAuthClaim(
  token: string,
  dbPath?: string,
): string | null {
  const db = getDb(dbPath);
  const row = db
    .select()
    .from(authClaims)
    .where(eq(authClaims.token, token))
    .get();

  if (!row || row.usedAt) return null;

  const expiresMs = Date.parse(row.expiresAt);
  if (Number.isNaN(expiresMs) || expiresMs <= Date.now()) {
    return null;
  }

  db.update(authClaims)
    .set({ usedAt: new Date().toISOString() })
    .where(eq(authClaims.token, token))
    .run();

  return row.sessionId;
}
