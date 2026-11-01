import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { sessions, users } from "../db/schema";

export const SESSION_COOKIE_NAME = "echbox_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

export type User = typeof users.$inferSelect;

function getSessionSecret(): string | undefined {
  return Bun.env.SESSION_SECRET ?? process.env.SESSION_SECRET;
}

function isProduction(): boolean {
  return (Bun.env.NODE_ENV ?? process.env.NODE_ENV) === "production";
}

function signSessionId(id: string, secret: string): string {
  const sig = createHmac("sha256", secret).update(id).digest("base64url");
  return `${id}.${sig}`;
}

function verifyOrExtractSessionId(rawValue: string): string | null {
  const secret = getSessionSecret();
  if (!secret) {
    // Allow unsigned session id or strip signature if present when no secret is configured
    const dotIndex = rawValue.indexOf(".");
    return dotIndex === -1 ? rawValue : rawValue.slice(0, dotIndex);
  }

  const dotIndex = rawValue.indexOf(".");
  if (dotIndex === -1) {
    return null;
  }

  const id = rawValue.slice(0, dotIndex);
  const providedSig = rawValue.slice(dotIndex + 1);
  const expectedSig = createHmac("sha256", secret)
    .update(id)
    .digest("base64url");

  const a = Buffer.from(providedSig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return null;
  }
  return id;
}

export function serializeCookie(
  name: string,
  value: string,
  options: {
    maxAge?: number;
    path?: string;
    httpOnly?: boolean;
    sameSite?: "Lax" | "Strict" | "None";
    secure?: boolean;
  } = {},
): string {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${options.path ?? "/"}`);
  if (options.httpOnly ?? true) {
    parts.push("HttpOnly");
  }
  parts.push(`SameSite=${options.sameSite ?? "Lax"}`);
  if (options.secure ?? isProduction()) {
    parts.push("Secure");
  }
  if (options.maxAge !== undefined) {
    parts.push(`Max-Age=${options.maxAge}`);
  }
  return parts.join("; ");
}

export function parseCookies(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) return {};
  const out: Record<string, string> = {};
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const rawVal = trimmed.slice(eqIdx + 1).trim();
    try {
      out[key] = decodeURIComponent(rawVal);
    } catch {
      out[key] = rawVal;
    }
  }
  return out;
}

export function buildBlankSessionCookie(): string {
  return serializeCookie(SESSION_COOKIE_NAME, "", {
    maxAge: 0,
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
  });
}

export function serializeSessionCookie(sessionId: string): string {
  const secret = getSessionSecret();
  const cookieValue = secret ? signSessionId(sessionId, secret) : sessionId;
  return serializeCookie(SESSION_COOKIE_NAME, cookieValue, {
    maxAge: SESSION_TTL_SECONDS,
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
  });
}

export async function createSession(
  userId: string,
  dbPath?: string,
): Promise<{ id: string; cookie: string }> {
  const db = getDb(dbPath);
  const id = crypto.randomUUID();
  const expiresAt = new Date(
    Date.now() + SESSION_TTL_SECONDS * 1000,
  ).toISOString();

  db.insert(sessions)
    .values({
      id,
      userId,
      expiresAt,
    })
    .run();

  return { id, cookie: serializeSessionCookie(id) };
}

export function extractSessionIdFromCookieHeader(
  cookieHeader: string | null,
): string | null {
  const cookies = parseCookies(cookieHeader);
  const raw = cookies[SESSION_COOKIE_NAME];
  if (!raw) return null;
  return verifyOrExtractSessionId(raw);
}

export async function getUserFromSessionCookie(
  cookieHeader: string | null,
  dbPath?: string,
): Promise<User | null> {
  const sessionId = extractSessionIdFromCookieHeader(cookieHeader);
  if (!sessionId) return null;

  const db = getDb(dbPath);
  const row = db
    .select({
      session: sessions,
      user: users,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, sessionId))
    .get();

  if (!row) return null;

  const expiresMs = Date.parse(row.session.expiresAt);
  if (Number.isNaN(expiresMs) || expiresMs <= Date.now()) {
    db.delete(sessions).where(eq(sessions.id, sessionId)).run();
    return null;
  }

  return row.user;
}

export async function revokeSessionFromCookie(
  cookieHeader: string | null,
  dbPath?: string,
): Promise<void> {
  const sessionId = extractSessionIdFromCookieHeader(cookieHeader);
  if (!sessionId) return;
  const db = getDb(dbPath);
  db.delete(sessions).where(eq(sessions.id, sessionId)).run();
}
