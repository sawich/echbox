import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";
import { sha256Hex } from "../../cards/hash";
import { getDb } from "../../db/client";
import { migrateDb } from "../../db/migrate";
import { users } from "../../db/schema";
import {
  addPluginVersion,
  BadPluginError,
  createPlugin,
  DuplicatePluginHashError,
  getPlugin,
  getPluginVersionBytes,
} from "../service";
import { getPluginDir } from "../storage";
import { seedTestGame } from "../../__tests__/test-game";

function pluginZip(payload: string): Uint8Array {
  return zipSync({ "data.txt": strToU8(payload) });
}

describe("plugin archive validation and storage hardening", () => {
  let tempDir: string;
  let dbPath: string;
  let dataDir: string;
  let authorId: string;
  let gameId: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "echbox-plugin-val-"));
    dbPath = join(tempDir, "test.db");
    dataDir = join(tempDir, "data");
    process.env.DATABASE_PATH = dbPath;
    process.env.DATA_DIR = dataDir;
    migrateDb(dbPath);
    authorId = crypto.randomUUID();
    getDb(dbPath)
      .insert(users)
      .values({
        id: authorId,
        discordId: "d-plug-val",
        username: "pv",
        avatar: null,
        createdAt: new Date().toISOString(),
      })
      .run();
    gameId = seedTestGame(authorId, { dbPath }).id;
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("create rejects empty, non-zip, truncated and entry-less archives", async () => {
    const bad = [
      new Uint8Array(),
      strToU8("<html>nope</html>"),
      pluginZip("x").slice(0, 20),
      zipSync({}),
    ];
    for (const fileBytes of bad) {
      await expect(
        createPlugin({
          gameId,
          authorId,
          title: "P",
          semver: "1.0.0",
          fileBytes,
          dbPath,
          dataDir,
        }),
      ).rejects.toBeInstanceOf(BadPluginError);
    }
    expect(existsSync(join(dataDir, "plugins"))).toBe(false);
  });

  test("addVersion rejects empty and non-zip archives", async () => {
    const created = await createPlugin({ gameId,
      authorId,
      title: "P",
      semver: "1.0.0",
      fileBytes: pluginZip("v1"),
      dbPath,
      dataDir,
    });
    for (const fileBytes of [new Uint8Array(), strToU8("garbage")]) {
      await expect(
        addPluginVersion({
          pluginId: created.id,
          authorId,
          semver: "1.0.1",
          fileBytes,
          dbPath,
          dataDir,
        }),
      ).rejects.toBeInstanceOf(BadPluginError);
    }
  });

  test("storage helpers refuse hostile plugin ids", () => {
    for (const id of ["..", ".", "../..", "a/b", ""]) {
      expect(() => getPluginDir(id, dataDir)).toThrow(BadPluginError);
    }
  });

  test("concurrent identical uploads: one wins, loser maps to duplicate-hash", async () => {
    const bytes = pluginZip("same");
    const results = await Promise.allSettled([
      createPlugin({ gameId, authorId, title: "A", semver: "1.0.0", fileBytes: bytes, dbPath, dataDir }),
      createPlugin({ gameId, authorId, title: "B", semver: "1.0.0", fileBytes: bytes, dbPath, dataDir }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const bad = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(bad.reason).toBeInstanceOf(DuplicatePluginHashError);
    expect(readdirSync(join(dataDir, "plugins", ".staging"))).toEqual([]);
  });

  test("concurrent version uploads get distinct semvers and intact files", async () => {
    const created = await createPlugin({ gameId,
      authorId,
      title: "P",
      semver: "1.0.0",
      fileBytes: pluginZip("v1"),
      dbPath,
      dataDir,
    });
    await Promise.all(
      ["a", "b", "c"].map((p, i) =>
        addPluginVersion({
          pluginId: created.id,
          authorId,
          semver: `1.0.${i + 1}`,
          fileBytes: pluginZip(p),
          dbPath,
          dataDir,
        }),
      ),
    );
    const detail = (await getPlugin(created.id, { dbPath, dataDir }))!;
    expect(detail.versions.map((v) => v.semver)).toEqual([
      "1.0.0",
      "1.0.1",
      "1.0.2",
      "1.0.3",
    ]);
    expect(new Set(detail.versions.map((v) => v.id)).size).toBe(4);
    expect(detail.latestSemver).toBe("1.0.3");
    expect(detail.latestVersionId).toBe(detail.versions[3]!.id);
    for (const v of detail.versions) {
      const label =
        v.semver === "1.0.0"
          ? "v1"
          : v.semver === "1.0.1"
            ? "a"
            : v.semver === "1.0.2"
              ? "b"
              : "c";
      const file = await getPluginVersionBytes(created.id, v.id, {
        dbPath,
        dataDir,
      });
      expect(file).not.toBeNull();
      expect(sha256Hex(file!.bytes)).toBe(v.contentHash);
      expect(sha256Hex(file!.bytes)).toBe(sha256Hex(pluginZip(label)));
    }
  });
});
