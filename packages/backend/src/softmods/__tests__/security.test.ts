import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";
import { sha256Hex } from "../../cards/hash";
import { getDb } from "../../db/client";
import { migrateDb } from "../../db/migrate";
import { softmodVersions, users } from "../../db/schema";
import { eq } from "drizzle-orm";
import {
  addSoftmodVersion,
  BadSoftmodError,
  createSoftmod,
  deleteSoftmod,
  DuplicateSoftmodHashError,
  getSoftmod,
  SoftmodGuidConflictError,
} from "../service";
import { getSoftmodDir, removeSoftmodFiles } from "../storage";
import { seedTestGame } from "../../__tests__/test-game";

function zipmod(guid: string, payload = "a"): Uint8Array {
  return zipSync({
    "manifest.xml": strToU8(
      `<Manifest><guid>${guid}</guid><name>N</name><version>1.0</version><author>A</author></Manifest>`,
    ),
    "data.txt": strToU8(payload),
  });
}

describe("softmod storage hardening", () => {
  let tempDir: string;
  let dbPath: string;
  let dataDir: string;
  let authorId: string;
  let gameId: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "echbox-softmod-sec-"));
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
        discordId: "d-sec",
        username: "sec",
        avatar: null,
        createdAt: new Date().toISOString(),
      })
      .run();
    gameId = seedTestGame(authorId, { dbPath }).id;
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("create rejects hostile GUIDs and writes nothing outside data dir", async () => {
    const sentinel = join(tempDir, "sentinel.txt");
    writeFileSync(sentinel, "keep");
    for (const guid of ["..", ".", "../..", "../../escape", "a/b", "/abs/x"]) {
      await expect(
        createSoftmod({ gameId, authorId, semver: "1.0.0", fileBytes: zipmod(guid), dbPath, dataDir }),
      ).rejects.toBeInstanceOf(BadSoftmodError);
    }
    expect(existsSync(sentinel)).toBe(true);
    expect(existsSync(join(tempDir, "escape"))).toBe(false);
    expect(existsSync(join(dataDir, "softmods"))).toBe(false);
  });

  test("storage helpers refuse hostile ids (defense in depth)", async () => {
    for (const id of ["..", ".", "../..", "a/b", ""]) {
      expect(() => getSoftmodDir(id, dataDir)).toThrow(BadSoftmodError);
      await expect(removeSoftmodFiles(id, dataDir)).rejects.toBeInstanceOf(
        BadSoftmodError,
      );
    }
  });

  test("hostile delete id never removes other softmods' files", async () => {
    const created = await createSoftmod({ gameId,
      authorId,
      semver: "1.0.0", fileBytes: zipmod("com.keep.me"),
      dbPath,
      dataDir,
    });
    for (const id of ["..", ".", "../..", "../softmods"]) {
      await expect(
        deleteSoftmod({ softmodId: id, authorId, dbPath, dataDir }),
      ).rejects.toThrow();
    }
    expect(existsSync(join(dataDir, "softmods", created.id))).toBe(true);
    expect(existsSync(dataDir)).toBe(true);
  });

  test("addVersion with hostile softmod id is rejected", async () => {
    await expect(
      addSoftmodVersion({
        softmodId: "../..",
        authorId,
        semver: "1.0.0", fileBytes: zipmod("../.."),
        dbPath,
        dataDir,
      }),
    ).rejects.toThrow();
  });

  test("rejects empty, non-zip, and entry-less archives", async () => {
    for (const bytes of [
      new Uint8Array(),
      strToU8("<html>not a zip</html>"),
      zipSync({}),
    ]) {
      await expect(
        createSoftmod({ gameId, authorId, semver: "1.0.0", fileBytes: bytes, dbPath, dataDir }),
      ).rejects.toBeInstanceOf(BadSoftmodError);
    }
    const created = await createSoftmod({ gameId,
      authorId,
      semver: "1.0.0", fileBytes: zipmod("com.valid.one"),
      dbPath,
      dataDir,
    });
    await expect(
      addSoftmodVersion({
        softmodId: created.id,
        authorId,
        semver: "1.0.1",
        fileBytes: new Uint8Array(),
        dbPath,
        dataDir,
      }),
    ).rejects.toBeInstanceOf(BadSoftmodError);
  });

  test("concurrent same-GUID creates: one wins, loser gets 409 error and winner file is intact", async () => {
    const a = zipmod("com.race.guid", "payload-a");
    const b = zipmod("com.race.guid", "payload-b");
    const results = await Promise.allSettled([
      createSoftmod({ gameId, authorId, semver: "1.0.0", fileBytes: a, dbPath, dataDir }),
      createSoftmod({ gameId, authorId, semver: "1.0.0", fileBytes: b, dbPath, dataDir }),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled");
    const bad = results.filter((r) => r.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(bad).toHaveLength(1);
    expect((bad[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      SoftmodGuidConflictError,
    );

    const row = getDb(dbPath)
      .select()
      .from(softmodVersions)
      .where(eq(softmodVersions.softmodId, "com.race.guid"))
      .get()!;
    const stored = new Uint8Array(await Bun.file(row.originalPath).arrayBuffer());
    expect(sha256Hex(stored)).toBe(row.contentHash);
    // No leaked staging files.
    expect(readdirSync(join(dataDir, "softmods", ".staging"))).toEqual([]);
  });

  test("concurrent identical uploads map to duplicate-hash error", async () => {
    const bytes = zipmod("com.race.same", "same");
    const results = await Promise.allSettled([
      createSoftmod({ gameId, authorId, semver: "1.0.0", fileBytes: bytes, dbPath, dataDir }),
      createSoftmod({ gameId, authorId, semver: "1.0.0", fileBytes: bytes, dbPath, dataDir }),
    ]);
    const bad = results.filter((r) => r.status === "rejected");
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((bad[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      DuplicateSoftmodHashError,
    );
  });

  test("concurrent version uploads get distinct semvers and intact files", async () => {
    const created = await createSoftmod({ gameId,
      authorId,
      semver: "1.0.0", fileBytes: zipmod("com.race.ver", "v1"),
      dbPath,
      dataDir,
    });
    const files = ["v-a", "v-b", "v-c"].map((p) => zipmod("com.race.ver", p));
    await Promise.all(
      files.map((fileBytes, i) =>
        addSoftmodVersion({
          softmodId: created.id,
          authorId,
          semver: `1.0.${i + 1}`,
          fileBytes,
          dbPath,
          dataDir,
        }),
      ),
    );
    const detail = (await getSoftmod(created.id, { dbPath, dataDir }))!;
    expect(detail.versions.map((v) => v.semver)).toEqual([
      "1.0.0",
      "1.0.1",
      "1.0.2",
      "1.0.3",
    ]);
    expect(new Set(detail.versions.map((v) => v.id)).size).toBe(4);
    expect(detail.latestSemver).toBe("1.0.3");
    for (const v of detail.versions) {
      const stored = new Uint8Array(await Bun.file(v.originalPath).arrayBuffer());
      expect(sha256Hex(stored)).toBe(v.contentHash);
    }
  });

  test("failed insert does not leave a file at the final path", async () => {
    mkdirSync(join(dataDir, "softmods"), { recursive: true });
    const bytes = zipmod("com.fail.fk", "x");
    await expect(
      createSoftmod({ gameId,
        authorId: "no-such-user",
        semver: "1.0.0", fileBytes: bytes,
        dbPath,
        dataDir,
      }),
    ).rejects.toThrow();
    expect(existsSync(join(dataDir, "softmods", "com.fail.fk"))).toBe(false);
    expect(readdirSync(join(dataDir, "softmods", ".staging"))).toEqual([]);
  });
});
