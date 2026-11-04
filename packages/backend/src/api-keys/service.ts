import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { User } from "../auth/session";
import { getDb } from "../db/client";
import { apiKeys, users } from "../db/schema";
import { newId } from "../id";

export type ApiKeyPublic = {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

export type CreatedApiKey = ApiKeyPublic & {
  /** Full secret — returned only once on create */
  key: string;
};

export class ApiKeyError extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
  ) {
    super(message);
    this.name = "ApiKeyError";
  }
}

export function hashApiKey(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function formatApiKey(keyId: string, secretHex: string): string {
  return `ebx_${keyId}_${secretHex}`;
}

export function parseApiKeyToken(
  token: string,
): { keyId: string; secretHex: string } | null {
  const trimmed = token.trim();
  if (!trimmed.startsWith("ebx_")) return null;
  const rest = trimmed.slice(4);
  const sep = rest.indexOf("_");
  if (sep <= 0 || sep === rest.length - 1) return null;
  const keyId = rest.slice(0, sep);
  const secretHex = rest.slice(sep + 1);
  if (!keyId || !/^[0-9a-f]+$/i.test(secretHex) || secretHex.length < 32) {
    return null;
  }
  return { keyId, secretHex };
}

function safeEqualHex(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

export function createApiKey(input: {
  userId: string;
  name: string;
  dbPath?: string;
}): CreatedApiKey {
  const name = input.name.trim();
  if (!name) {
    throw new ApiKeyError("Name is required", 400);
  }
  if (name.length > 80) {
    throw new ApiKeyError("Name is too long", 400);
  }

  const db = getDb(input.dbPath);
  const id = newId();
  const secretHex = randomBytes(32).toString("hex");
  const key = formatApiKey(id, secretHex);
  const keyHash = hashApiKey(key);
  const keyPrefix = `ebx_${id.slice(0, 8)}`;
  const createdAt = new Date().toISOString();

  db.insert(apiKeys)
    .values({
      id,
      userId: input.userId,
      name,
      keyPrefix,
      keyHash,
      createdAt,
      lastUsedAt: null,
      revokedAt: null,
    })
    .run();

  return {
    id,
    name,
    prefix: keyPrefix,
    createdAt,
    lastUsedAt: null,
    revokedAt: null,
    key,
  };
}

export function listApiKeys(input: {
  userId: string;
  dbPath?: string;
}): ApiKeyPublic[] {
  const db = getDb(input.dbPath);
  const rows = db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      prefix: apiKeys.keyPrefix,
      createdAt: apiKeys.createdAt,
      lastUsedAt: apiKeys.lastUsedAt,
      revokedAt: apiKeys.revokedAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.userId, input.userId))
    .orderBy(desc(apiKeys.createdAt))
    .all();

  return rows;
}

export function revokeApiKey(input: {
  userId: string;
  keyId: string;
  dbPath?: string;
}): void {
  const db = getDb(input.dbPath);
  const row = db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.id, input.keyId), eq(apiKeys.userId, input.userId)))
    .get();

  if (!row) {
    throw new ApiKeyError("API key not found", 404);
  }
  if (row.revokedAt) {
    return;
  }

  db.update(apiKeys)
    .set({ revokedAt: new Date().toISOString() })
    .where(eq(apiKeys.id, input.keyId))
    .run();
}

/**
 * Resolve a user from a Bearer API key token.
 * Updates lastUsedAt on success.
 */
export function resolveUserFromBearer(
  token: string,
  options: { dbPath?: string } = {},
): User | null {
  const parsed = parseApiKeyToken(token);
  if (!parsed) return null;

  const db = getDb(options.dbPath);
  const row = db
    .select()
    .from(apiKeys)
    .where(
      and(eq(apiKeys.id, parsed.keyId), isNull(apiKeys.revokedAt)),
    )
    .get();

  if (!row) return null;

  const providedHash = hashApiKey(token.trim());
  if (!safeEqualHex(row.keyHash, providedHash)) {
    return null;
  }

  const user = db.select().from(users).where(eq(users.id, row.userId)).get();
  if (!user) return null;

  db.update(apiKeys)
    .set({ lastUsedAt: new Date().toISOString() })
    .where(eq(apiKeys.id, row.id))
    .run();

  return user;
}

export function extractBearerToken(
  authorization: string | null,
): string | null {
  if (!authorization) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  return match?.[1]?.trim() || null;
}
