import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getDb } from "../../db/client";
import { migrateDb } from "../../db/migrate";
import { users } from "../../db/schema";
import {
  createApiKey,
  extractBearerToken,
  hashApiKey,
  listApiKeys,
  parseApiKeyToken,
  revokeApiKey,
  resolveUserFromBearer,
} from "../service";

describe("api-keys service", () => {
  let tempDir: string;
  let dbPath: string;
  let userId: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "echbox-api-keys-"));
    dbPath = join(tempDir, "test.db");
    migrateDb(dbPath);
    userId = crypto.randomUUID();
    getDb(dbPath)
      .insert(users)
      .values({
        id: userId,
        discordId: "discord-api-key-user",
        username: "key_user",
        avatar: null,
        createdAt: new Date().toISOString(),
      })
      .run();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("createApiKey returns plaintext once and list omits secret", () => {
    const created = createApiKey({
      userId,
      name: "Uploader",
      dbPath,
    });
    expect(created.key.startsWith("ebx_")).toBe(true);
    expect(created.prefix.startsWith("ebx_")).toBe(true);
    expect(created.name).toBe("Uploader");

    const listed = listApiKeys({ userId, dbPath });
    expect(listed).toHaveLength(1);
    expect(listed[0]!.id).toBe(created.id);
    expect(listed[0]).not.toHaveProperty("key");
    expect((listed[0] as { key?: string }).key).toBeUndefined();
  });

  test("resolveUserFromBearer accepts valid key and rejects revoked", () => {
    const created = createApiKey({ userId, name: "Bot", dbPath });
    const user = resolveUserFromBearer(created.key, { dbPath });
    expect(user?.id).toBe(userId);

    revokeApiKey({ userId, keyId: created.id, dbPath });
    expect(resolveUserFromBearer(created.key, { dbPath })).toBeNull();
  });

  test("parseApiKeyToken and extractBearerToken", () => {
    expect(extractBearerToken("Bearer abc")).toBe("abc");
    expect(extractBearerToken("bearer  xyz  ")).toBe("xyz");
    expect(extractBearerToken(null)).toBeNull();
    expect(parseApiKeyToken("not-a-key")).toBeNull();

    const created = createApiKey({ userId, name: "X", dbPath });
    const parsed = parseApiKeyToken(created.key);
    expect(parsed?.keyId).toBe(created.id);
    expect(hashApiKey(created.key)).toHaveLength(64);
  });
});
